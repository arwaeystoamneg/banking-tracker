// Applies scripts/extras-import.json to the running app's backend (the live Sheet when creds are set):
//  - creates the Bicycle fee-schedule tiers for each Bicycle game
//  - reworks the UTH Progressive side bet into a Bad Beat Jackpot (+ paytable rows)
// Idempotent: skips fee rows / paytable rows that already exist, and only PATCHes the side bet if it
// hasn't already been renamed. Paced under the Sheets write quota.
//
// Usage: node scripts/extras-import.mjs   (or BASE_URL=https://your-app.vercel.app node scripts/extras-import.mjs)

import { readFileSync } from "node:fs";
import { mintAdminCookie } from "./auth-cookie.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PACE_MS = Number(process.env.PACE_MS ?? 1200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const ck = mintAdminCookie();
  const headers = { "Content-Type": "application/json", cookie: ck };
  const data = JSON.parse(readFileSync(new URL("./extras-import.json", import.meta.url), "utf8"));
  const get = async (p) => {
    const r = await fetch(`${BASE_URL}${p}`, { headers: { cookie: ck } });
    if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
    return r.json();
  };

  let created = 0;
  let skipped = 0;
  let failed = 0;
  const post = async (path, body, label) => {
    const r = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!r.ok) { failed += 1; console.log(`  ✗ ${label} -> ${r.status} ${(await r.text()).slice(0, 140)}`); }
    else { created += 1; console.log(`  ✓ ${label}`); }
    await sleep(PACE_MS);
  };

  // Fee schedules
  const existingFees = new Set((await get("/api/fee-schedules")).map((r) => r.schedule_id));
  console.log("Fee schedules:");
  for (const f of data.feeSchedules ?? []) {
    if (existingFees.has(f.id)) { skipped += 1; console.log(`  · skip ${f.id} (exists)`); continue; }
    await post("/api/fee-schedules", f, `${f.game_id} ${f.option_label} $${f.tier_min}-${f.tier_max ?? "∞"} = $${f.pd_fee}`);
  }

  // UTH Bad Beat: PATCH the side bet, then add paytable rows.
  const bb = data.badBeat;
  if (bb) {
    console.log("UTH Bad Beat Jackpot:");
    const sidebets = await get("/api/sidebets");
    const sb = sidebets.find((s) => s.sidebet_id === bb.sidebetId);
    if (!sb) {
      console.log(`  ✗ side bet ${bb.sidebetId} not found`);
      failed += 1;
    } else if (sb.name === bb.expectNameNot) {
      console.log(`  · skip PATCH (already "${sb.name}")`);
      skipped += 1;
    } else {
      const r = await fetch(`${BASE_URL}/api/sidebets/${bb.sidebetId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ patch: bb.patch, expectedVersion: sb._row_version }),
      });
      if (!r.ok) { failed += 1; console.log(`  ✗ PATCH -> ${r.status} ${(await r.text()).slice(0, 140)}`); }
      else { created += 1; console.log(`  ✓ renamed to Bad Beat Jackpot`); }
      await sleep(PACE_MS);
    }

    const existingPt = new Set((await get("/api/paytables")).map((r) => r.paytable_id));
    for (const p of bb.paytables ?? []) {
      if (existingPt.has(p.id)) { skipped += 1; console.log(`  · skip paytable ${p.id}`); continue; }
      await post("/api/paytables", p, `bad beat: ${p.outcome} ${p.payout}`);
    }
  }

  console.log(`\nDone. created=${created} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
