import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth/types";

// configureOfflineDatabase only runs in a browser.
(globalThis as { window?: unknown }).window ??= globalThis;

const { configureOfflineDatabase } = await import("@/offline/db");
const dbModule = await import("@/offline/db");
const { enqueueCreate, enqueueDelete, enqueueUpdate, flushQueue, canAutoMerge } = await import("@/offline/queue");
const { mergeServerRowsWithLocal } = await import("@/offline/cache");

type Row = Record<string, unknown> & { session_id: string; _row_version: number };

/** A tiny stand-in for /api/sessions with version checks, like the real server. */
function fakeServer() {
  const rows = new Map<string, Row>();
  const calls: string[] = [];
  let hold: Promise<void> | null = null;
  let offline = false;
  let signedOut = false;
  let loseReplies = false;
  /** A create the server answers with a row it already had under another id (a merged duplicate). */
  const mergeInto = new Map<string, string>();
  const bodies: Record<string, unknown>[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, "http://local");
    const id = url.pathname.split("/")[3];
    const method = init.method ?? "GET";
    calls.push(`${method} ${id ?? ""}`.trim());
    if (offline) throw new TypeError("Failed to fetch");
    if (hold) await hold;
    if (signedOut) return json({ error: "unauthorized" }, 401);
    const body = init.body ? JSON.parse(String(init.body)) : {};
    bodies.push(body);
    if (loseReplies) {
      // The server saves it, but the reply never makes it back to the phone.
      loseReplies = false;
      const { id: newId, ...rest } = body;
      if (method === "POST") rows.set(newId, { ...rest, session_id: newId, _row_version: 1 } as Row);
      throw new TypeError("Network connection was lost");
    }
    if (method === "POST") {
      const { id: newId, ...rest } = body;
      const target = mergeInto.get(newId);
      if (target && rows.has(target)) return json(rows.get(target), 201);
      const existing = rows.get(newId);
      if (existing) return json(existing, 201);
      const row = { ...rest, session_id: newId, _row_version: 1 } as Row;
      rows.set(newId, row);
      return json(row, 201);
    }
    const row = rows.get(id);
    if (!row) return json({ error: "not_found" }, 404);
    if (row._row_version !== body.expectedVersion) return json({ error: "conflict", serverRow: row }, 409);
    if (method === "DELETE") {
      rows.delete(id);
      return new Response(null, { status: 204 });
    }
    const updated = { ...row, ...body.patch, _row_version: row._row_version + 1 };
    rows.set(id, updated);
    return json(updated);
  });

  return {
    rows,
    calls,
    fetchMock,
    bodies,
    mergeInto,
    setOffline: (value: boolean) => (offline = value),
    setSignedOut: (value: boolean) => (signedOut = value),
    loseNextReply: () => (loseReplies = true),
    holdRequests() {
      let release!: () => void;
      hold = new Promise((resolve) => (release = resolve));
      return () => {
        hold = null;
        release();
      };
    },
  };
}

let server: ReturnType<typeof fakeServer>;
let n = 0;
const database = () => dbModule.db!;
const queue = () => database().writeQueue.toArray();
const session = (id: string, extra: Record<string, unknown> = {}): Row => ({
  session_id: id, date: "2026-10-20", buy_in: 100, buy_out: null, time_in: "19:00", time_out: "", logged_by: "Ray", _row_version: 1, ...extra,
});

beforeEach(async () => {
  server = fakeServer();
  vi.stubGlobal("fetch", server.fetchMock);
  const user: AuthUser = { role: "individual", userId: `flush-test-${n++}`, name: "Ray" };
  await configureOfflineDatabase(user);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("write queue sync", () => {
  it("an edit made while the create is still sending doesn't conflict with itself", async () => {
    const id = await enqueueCreate("sessions", { date: "2026-10-20", buy_in: 100, time_in: "19:00" });
    const release = server.holdRequests();
    const flushing = flushQueue();
    await vi.waitFor(() => expect(server.calls).toContain("POST"));
    // End the session before the start has finished saving — the UI passes the local version, 0.
    await enqueueUpdate("sessions", id, { buy_out: 250, time_out: "23:00" }, 0);
    release();
    await flushing;
    expect(await queue()).toEqual([]);
    expect(server.rows.get(id)).toMatchObject({ buy_out: 250, time_out: "23:00", _row_version: 2 });
  });

  it("retries a write left 'syncing' when the app was closed mid-send", async () => {
    server.rows.set("s1", session("s1"));
    await database().table("sessions").put(session("s1"));
    await enqueueUpdate("sessions", "s1", { buy_in: 300 }, 1);
    const [item] = await queue();
    await database().writeQueue.update(item.id!, { status: "syncing" });
    await flushQueue();
    expect(await queue()).toEqual([]);
    expect(server.rows.get("s1")?.buy_in).toBe(300);
  });

  it("merges edits to different fields instead of calling it a conflict", async () => {
    await database().table("sessions").put(session("s1"));
    // Someone else ended the session on another phone (version 2); this phone fixes the buy-in from version 1.
    server.rows.set("s1", session("s1", { buy_out: 400, time_out: "02:00", _row_version: 2 }));
    await enqueueUpdate("sessions", "s1", { buy_in: 150 }, 1);
    await flushQueue();
    expect(await queue()).toEqual([]);
    expect(server.rows.get("s1")).toMatchObject({ buy_in: 150, buy_out: 400, time_out: "02:00", _row_version: 3 });
  });

  it("still asks when both changed the same field", async () => {
    await database().table("sessions").put(session("s1"));
    server.rows.set("s1", session("s1", { buy_in: 500, _row_version: 2 }));
    await enqueueUpdate("sessions", "s1", { buy_in: 150 }, 1);
    await flushQueue();
    const [item] = await queue();
    expect(item.status).toBe("conflict");
    expect(server.rows.get("s1")?.buy_in).toBe(500);
  });

  it("a stuck row only holds back later writes to that row, not everyone else's", async () => {
    await database().table("sessions").bulkPut([session("a"), session("b")]);
    server.rows.set("a", session("a", { buy_in: 500, _row_version: 2 }));
    server.rows.set("b", session("b"));
    await enqueueUpdate("sessions", "a", { buy_in: 150 }, 1); // conflicts
    await enqueueUpdate("sessions", "a", { time_out: "23:00" }, 1); // must wait behind it
    await enqueueUpdate("sessions", "b", { buy_in: 175 }, 1); // unrelated: should sync
    await flushQueue();
    expect(server.rows.get("b")?.buy_in).toBe(175);
    const left = await queue();
    expect(left.map((item) => [item.targetId, item.status])).toEqual([
      ["a", "conflict"],
      ["a", "pending"],
    ]);
    expect(server.calls.filter((call) => call === "PATCH a")).toHaveLength(1);
  });

  it("deleting something that never synced cancels it on the phone", async () => {
    server.setOffline(true);
    const id = await enqueueCreate("sessions", { date: "2026-10-20", buy_in: 100, time_in: "19:00" });
    await enqueueUpdate("sessions", id, { buy_in: 120 }, 0);
    await enqueueDelete("sessions", id);
    server.setOffline(false);
    await flushQueue();
    expect(server.calls).toEqual([]);
    expect(await queue()).toEqual([]);
    expect(await database().table("sessions").get(id)).toBeUndefined();
  });

  it("an edit to something deleted elsewhere is flagged with a plain reason", async () => {
    await database().table("sessions").put(session("gone"));
    await enqueueUpdate("sessions", "gone", { buy_in: 1 }, 1);
    await flushQueue();
    const [item] = await queue();
    expect(item.status).toBe("blocked");
    expect(item.lastError).toContain("deleted on another device");
  });

  it("no signal: keeps everything and sends it all when signal returns", async () => {
    server.setOffline(true);
    const first = await enqueueCreate("sessions", { date: "2026-10-20", buy_in: 100, time_in: "19:00" });
    await enqueueUpdate("sessions", first, { buy_out: 90, time_out: "22:00" }, 0);
    await flushQueue();
    expect((await queue()).map((item) => item.status)).toEqual(["error", "pending"]);
    server.setOffline(false);
    await flushQueue();
    expect(await queue()).toEqual([]);
    expect(server.rows.get(first)).toMatchObject({ buy_out: 90, _row_version: 2 });
  });
});

describe("sync bugs", () => {
  it("sends writes in the order they were made, even if the phone's clock jumped back", async () => {
    server.setOffline(true);
    const id = await enqueueCreate("sessions", { date: "2026-10-20", buy_in: 100, time_in: "19:00" });
    await enqueueUpdate("sessions", id, { buy_out: 90, time_out: "22:00" }, 0);
    const [create, update] = await queue();
    // The clock was corrected backwards between the two saves.
    await database().writeQueue.update(create.id!, { createdAt: "2026-10-20T23:00:00.000Z" });
    await database().writeQueue.update(update.id!, { createdAt: "2026-10-20T21:00:00.000Z" });
    server.setOffline(false);
    await flushQueue();
    expect(server.calls).toEqual(["POST", `PATCH ${id}`]);
    expect(server.rows.get(id)).toMatchObject({ buy_out: 90, _row_version: 2 });
  });

  it("an expired sign-in keeps every saved change, deletes included, and sends them after signing in", async () => {
    server.rows.set("s1", session("s1"));
    await database().table("sessions").put(session("s1"));
    server.setSignedOut(true);
    await enqueueDelete("sessions", "s1");
    await flushQueue();
    const [item] = await queue();
    expect(item).toMatchObject({ op: "delete", status: "error" });
    expect(await database().meta.get("signedOut")).toBeTruthy();
    expect(server.rows.has("s1")).toBe(true);
    server.setSignedOut(false);
    await flushQueue();
    expect(await queue()).toEqual([]);
    expect(server.rows.has("s1")).toBe(false);
    expect(await database().meta.get("signedOut")).toBeUndefined();
  });

  it("ending a session that the server merged into an existing one ends that one", async () => {
    server.rows.set("existing", session("existing"));
    server.setOffline(true);
    const id = await enqueueCreate("sessions", { date: "2026-10-20", buy_in: 100, time_in: "19:00" });
    await enqueueUpdate("sessions", id, { buy_out: 250, time_out: "23:00" }, 0);
    server.mergeInto.set(id, "existing");
    server.setOffline(false);
    await flushQueue();
    expect(await queue()).toEqual([]);
    expect(server.rows.get("existing")).toMatchObject({ buy_out: 250, time_out: "23:00", _row_version: 2 });
    expect(await database().table("sessions").get(id)).toBeUndefined();
    const { mergedId } = await import("@/offline/queue");
    expect(await mergedId("sessions", id)).toBe("existing");
  });

  it("deleting a session whose create may have reached the server deletes it there too", async () => {
    const id = await enqueueCreate("sessions", { date: "2026-10-20", buy_in: 100, time_in: "19:00" });
    server.loseNextReply();
    await flushQueue(); // saved on the server, but the phone only saw an error
    expect(server.rows.has(id)).toBe(true);
    await enqueueDelete("sessions", id);
    await flushQueue();
    expect(await queue()).toEqual([]);
    expect(server.rows.has(id)).toBe(false);
  });

  it("an edit sends only the fields it changed, with what they held before", async () => {
    server.rows.set("s1", session("s1"));
    await database().table("sessions").put(session("s1"));
    // The edit form re-sends every field; only the buy-out actually changed.
    await enqueueUpdate("sessions", "s1", { date: "2026-10-20", buy_in: 100, time_in: "19:00", buy_out: 300 }, 1);
    await enqueueUpdate("sessions", "s1", { buy_in: 100 }, 1); // nothing changed: nothing queued
    expect(await queue()).toHaveLength(1);
    await flushQueue();
    expect(server.bodies.at(-1)).toEqual({ patch: { buy_out: 300 }, expectedVersion: 1, baseValues: { buy_out: null } });
  });
});

describe("helpers", () => {
  it("canAutoMerge only when the edited fields are untouched (or already match)", () => {
    const item = { op: "update" as const, payload: { buy_in: 150 }, baseValues: { buy_in: 100 } };
    expect(canAutoMerge(item, { buy_in: 100, buy_out: 400 })).toBe(true);
    expect(canAutoMerge(item, { buy_in: 150 })).toBe(true);
    expect(canAutoMerge(item, { buy_in: 500 })).toBe(false);
    expect(canAutoMerge({ ...item, op: "delete" as const }, { buy_in: 100 })).toBe(false);
    expect(canAutoMerge({ ...item, baseValues: undefined }, { buy_in: 100 })).toBe(false);
  });

  it("a slightly old server list doesn't hide a just-saved row or revive a just-deleted one", () => {
    const merged = mergeServerRowsWithLocal(
      [{ session_id: "deleted", _row_version: 1 }],
      [{ session_id: "new", _row_version: 1 }, { session_id: "old-local", _row_version: 1 }],
      "session_id",
      false,
      (id) => (id === "new" ? "saved" : id === "deleted" ? "deleted" : null),
    );
    expect([...merged.keys()]).toEqual(["new"]);
  });
});
