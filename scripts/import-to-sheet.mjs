// Imports scripts/games-import.json into whatever backend the running app targets (the live Google
// Sheet, when GOOGLE_* creds are set) by POSTing through the app's own API — so every row goes through
// the same zod validation and _row_version handling as a write made in the UI.
//
// Idempotent: skips any game/sidebet/paytable whose id already exists, so re-running is safe.
// Paced: one write ~every 1.2s to stay under the Sheets 60-writes/min quota (create also does a read).
//
// Usage:  node scripts/import-to-sheet.mjs            (targets http://localhost:3000)
//         BASE_URL=https://your-app.vercel.app node scripts/import-to-sheet.mjs
// Requires APP_PASSPHRASE in .env.local (used to mint the auth cookie).

import { readFileSync } from "node:fs";
import { mintAdminCookie } from "./auth-cookie.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PACE_MS = Number(process.env.PACE_MS ?? 1200);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const cookie = mintAdminCookie();
  const headers = { "Content-Type": "application/json", cookie };
  const data = JSON.parse(readFileSync(new URL("./games-import.json", import.meta.url), "utf8"));

  const get = async (path) => {
    const res = await fetch(`${BASE_URL}${path}`, { headers: { cookie } });
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return res.json();
  };

  const existing = {
    games: new Set((await get("/api/games")).map((r) => r.game_id)),
    sidebets: new Set((await get("/api/sidebets")).map((r) => r.sidebet_id)),
    paytables: new Set((await get("/api/paytables")).map((r) => r.paytable_id)),
  };

  let created = 0;
  let skipped = 0;
  let failed = 0;

  const post = async (path, body, label) => {
    try {
      const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
      if (!res.ok) {
        failed += 1;
        console.log(`  ✗ ${label} -> ${res.status} ${(await res.text()).slice(0, 160)}`);
      } else {
        created += 1;
        console.log(`  ✓ ${label}`);
      }
    } catch (err) {
      failed += 1;
      console.log(`  ✗ ${label} -> ${err.message}`);
    }
    await sleep(PACE_MS);
  };

  // Paytables reference sidebets; sidebets reference games. Deterministic ids are provided so the
  // cross-tab links resolve regardless of insert order, but we still write parents first.
  console.log(`Importing into ${BASE_URL} (pace ${PACE_MS}ms)…\n`);

  console.log("Games:");
  for (const g of data.games ?? []) {
    if (existing.games.has(g.id)) { skipped += 1; console.log(`  · skip ${g.name} (exists)`); continue; }
    await post("/api/games", g, g.name);
  }

  console.log("Side bets:");
  for (const s of data.sidebets ?? []) {
    if (existing.sidebets.has(s.id)) { skipped += 1; console.log(`  · skip ${s.name} (exists)`); continue; }
    await post("/api/sidebets", s, `${s.game_id} / ${s.name}`);
  }

  console.log("Paytable rows:");
  for (const p of data.paytables ?? []) {
    const id = p.id ?? `pt_${p.sidebet_id}_${p.ordinal}`;
    if (existing.paytables.has(id)) { skipped += 1; continue; }
    await post("/api/paytables", { id, ...p }, `${p.sidebet_id} #${p.ordinal} ${p.outcome}`);
  }

  console.log(`\nDone. created=${created} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
