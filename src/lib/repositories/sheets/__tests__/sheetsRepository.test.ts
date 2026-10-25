import { beforeEach, describe, expect, it } from "vitest";
import { createSheetsRepository } from "@/lib/repositories/sheets/sheetsRepository";
import { invalidateSheetCache } from "@/lib/repositories/sheets/loader";
import { SESSIONS_TAB } from "@/lib/repositories/sheets/tabs";
import { ConflictError } from "@/lib/repositories/types";
import { sessionSchema, type Session } from "@/lib/validation/schemas";

/**
 * In-memory stand-in for the Google Sheets API: enough of values.get/batchGet/update/append/clear and
 * spreadsheets.get/batchUpdate to run the repository, including Google's "exceeds grid limits" refusal.
 */
function fakeSheets(initial: Record<string, { columns: number; rows: string[][] }>) {
  const tabs = new Map(Object.entries(initial).map(([title, tab], i) => [title, { id: i + 1, ...tab }]));
  const calls: Record<string, number> = {};
  const count = (name: string) => (calls[name] = (calls[name] ?? 0) + 1);
  const col = (letters: string) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const parse = (range: string) => {
    const [title, cells] = range.split("!");
    const m = /^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/.exec(cells);
    return { tab: tabs.get(title)!, title, c1: m ? col(m[1]) : 1, r1: m?.[2] ? Number(m[2]) : 1, c2: m?.[3] ? col(m[3]) : undefined };
  };
  const values = {
    async get({ range }: { range: string }) {
      count("values.get");
      return { data: { values: parse(range).tab.rows.map((r) => [...r]) } };
    },
    async batchGet({ ranges }: { ranges: string[] }) {
      count("values.batchGet");
      return { data: { valueRanges: ranges.map((range) => ({ values: parse(range).tab.rows.map((r) => [...r]) })) } };
    },
    async update({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) {
      count("values.update");
      const { tab, title, c1, r1, c2 } = parse(range);
      if ((c2 ?? c1 + requestBody.values[0].length - 1) > tab.columns) {
        throw Object.assign(new Error(`Range (${title}) exceeds grid limits`), { code: 400 });
      }
      while (tab.rows.length < r1) tab.rows.push([]);
      const row = tab.rows[r1 - 1];
      requestBody.values[0].forEach((v, i) => (row[c1 - 1 + i] = String(v)));
    },
    async append({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) {
      count("values.append");
      parse(range).tab.rows.push(requestBody.values[0].map(String));
    },
    async clear({ range }: { range: string }) {
      count("values.clear");
      const { tab, r1 } = parse(range);
      tab.rows[r1 - 1] = [];
    },
  };
  const spreadsheets = {
    values,
    async get() {
      count("spreadsheets.get");
      return { data: { sheets: [...tabs].map(([title, t]) => ({ properties: { title, sheetId: t.id, gridProperties: { columnCount: t.columns } } })) } };
    },
    async batchUpdate({ requestBody }: { requestBody: { requests: { appendDimension?: { sheetId: number; length: number } }[] } }) {
      count("spreadsheets.batchUpdate");
      for (const request of requestBody.requests) {
        const grow = request.appendDimension;
        if (grow) for (const t of tabs.values()) if (t.id === grow.sheetId) t.columns += grow.length;
      }
      return { data: { replies: [] } };
    },
  };
  return { client: { spreadsheets }, calls, tabs };
}

const SHEET = "test-sheet";
// The live Sessions tab before payroll: every header up to player_id, and only 27 columns of grid.
const OLD_HEADERS = SESSIONS_TAB.headers.filter((h) => !h.startsWith("payroll_"));

function sessionRow(id: string, version: number): string[] {
  const row = { session_id: id, date: "2026-10-20", buy_in: "100", time_in: "19:00", logged_by: "Ray Tang", logged_at: "x", _row_version: String(version) } as Record<string, string>;
  return OLD_HEADERS.map((h) => row[h] ?? "");
}

let sheets: ReturnType<typeof fakeSheets>;
let repo: ReturnType<typeof createSheetsRepository<Session, Partial<Session>, Partial<Session>>>;

beforeEach(() => {
  sheets = fakeSheets({ Sessions: { columns: 27, rows: [[...OLD_HEADERS], sessionRow("s1", 3)] } });
  (globalThis as { __sheetsClient?: unknown }).__sheetsClient = sheets.client;
  invalidateSheetCache(SHEET);
  repo = createSheetsRepository({ tab: "Sessions", tabConfig: SESSIONS_TAB, makeId: () => "new", rowSchema: sessionSchema, spreadsheetId: SHEET });
});

describe("sheets repository against a narrow, pre-payroll Sessions tab", () => {
  it("widens the grid and adds the new columns instead of failing the save", async () => {
    const saved = await repo.update("s1", { buy_in: 250 }, 3);
    expect(saved).toMatchObject({ buy_in: 250, _row_version: 4 });
    const tab = sheets.tabs.get("Sessions")!;
    expect(tab.columns).toBeGreaterThanOrEqual(SESSIONS_TAB.headers.length);
    expect(tab.rows[0].slice(-2)).toEqual(["payroll_paid_at", "payroll_paid_by"]);
  });

  it("serves a burst of list reads from one Google read, and shows a save straight away", async () => {
    await Promise.all(Array.from({ length: 25 }, () => repo.list()));
    expect(sheets.calls["values.batchGet"]).toBe(1);
    await repo.update("s1", { buy_in: 999 }, 3);
    const after = await repo.list();
    expect(after.find((s) => s.session_id === "s1")?.buy_in).toBe(999);
  });

  it("checks versions against the live sheet, not the shared copy", async () => {
    await repo.list(); // cache now holds version 3
    sheets.tabs.get("Sessions")!.rows[1] = sessionRow("s1", 7); // someone else saved on another server
    expect((await repo.get("s1"))?._row_version).toBe(7);
    await expect(repo.update("s1", { buy_in: 1 }, 3)).rejects.toBeInstanceOf(ConflictError);
  });

  it("costs one read per save, and a retried create doesn't duplicate", async () => {
    await repo.update("s1", { buy_in: 5 }, 3); // first save also adds the payroll columns
    for (const key of Object.keys(sheets.calls)) delete sheets.calls[key];
    await repo.update("s1", { buy_in: 6 }, 4);
    expect(sheets.calls["values.get"]).toBe(1);
    const created = await repo.create({ date: "2026-10-21", buy_in: 50, time_in: "20:00", logged_by: "Ray Tang", logged_at: "y" }, "s2");
    const retried = await repo.create({ date: "2026-10-21", buy_in: 50, time_in: "20:00", logged_by: "Ray Tang", logged_at: "y" }, "s2");
    expect(retried).toEqual(created);
    expect((await repo.list()).filter((s) => s.session_id === "s2")).toHaveLength(1);
  });
});
