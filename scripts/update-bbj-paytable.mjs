// Rewrites the UTH Bad Beat Jackpot side bet's paytable to the six researched bad-beat lines
// (Stones/M8trix), and sets its reference edge to the validated fully-banked ~14.7% with a sourced
// note. Idempotent: PATCHes existing rows, creates missing ones. Uses the same admin-cookie minting
// as scripts/extras-import.mjs.
//
// Usage: node scripts/update-bbj-paytable.mjs   (BASE_URL defaults to http://localhost:3000)

import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Matches the server's dev signing path (development-only:<passphrase>) exactly — no length guard, so
// a short dev passphrase still works, unlike scripts/auth-cookie.mjs which enforces ≥32.
function envValue(name) {
  if (process.env[name]) return process.env[name];
  const line = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .find((entry) => entry.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}
function mintCookie() {
  const passphrase = envValue("APP_PASSPHRASE");
  if (!passphrase) throw new Error("APP_PASSPHRASE is required");
  const signingSecret = envValue("AUTH_COOKIE_SECRET") ?? `development-only:${passphrase}`;
  const accountVersion = createHmac("sha256", signingSecret).update(`credential:${passphrase}`).digest("hex");
  const issuedAt = Date.now();
  const payload = Buffer.from(
    JSON.stringify({ role: "admin", userId: "admin", name: "Admin", accountVersion, issuedAt, expiresAt: issuedAt + 3600_000 }),
  ).toString("base64url");
  return `cbt_auth=${payload}.${createHmac("sha256", signingSecret).update(payload).digest("hex")}`;
}

const ck = mintCookie();
const headers = { "Content-Type": "application/json", cookie: ck };
const get = async (p) => {
  const r = await fetch(`${BASE_URL}${p}`, { headers: { cookie: ck } });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status} (auth?)`);
  return r.json();
};

const note =
  "California player-banked UTH Bad Beat Bonus (Stones/M8trix paytable). Pays on the LOSING hand of the player " +
  "vs player-dealer showdown when the loser is three-of-a-kind or better; a five-card tie loses. Requires Ante/Blind/Trips. " +
  "Fully-banked house edge ~14.7-15% (Monte Carlo, validated against Stephen How's ~14.8%); the realized bank edge rises " +
  "to ~16-24%+ under underbanking as jackpot payouts get capped by coverage — computed live in the EV calculator. " +
  "Standard published paytable; VERIFY against the room's felt.";

const rows = [
  { id: "pt_uth_bbj_1", ordinal: 1, outcome: "Straight flush (beaten)", payout: "7500:1" },
  { id: "pt_uth_bbj_2", ordinal: 2, outcome: "Four of a kind (beaten)", payout: "500:1" },
  { id: "pt_uth_bbj_3", ordinal: 3, outcome: "Full house (beaten)", payout: "50:1" },
  { id: "pt_uth_bbj_4", ordinal: 4, outcome: "Flush (beaten)", payout: "30:1" },
  { id: "pt_uth_bbj_5", ordinal: 5, outcome: "Straight (beaten)", payout: "20:1" },
  { id: "pt_uth_bbj_6", ordinal: 6, outcome: "Three of a kind (beaten)", payout: "9:1" },
];

const sidebets = await get("/api/sidebets");
const bbj = sidebets.find((s) => s.sidebet_id === "sb_uth_progressive");
if (!bbj) throw new Error("BBJ side bet sb_uth_progressive not found");

let r = await fetch(`${BASE_URL}/api/sidebets/sb_uth_progressive`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ patch: { edge_pct: 0.147, top_payout: "Straight flush (beaten) 7,500:1", note }, expectedVersion: bbj._row_version }),
});
console.log(`sidebet PATCH -> ${r.status}`);
await sleep(1000);

const paytables = await get("/api/paytables");
for (const row of rows) {
  const existing = paytables.find((p) => p.paytable_id === row.id);
  if (existing) {
    r = await fetch(`${BASE_URL}/api/paytables/${row.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ patch: { ordinal: row.ordinal, outcome: row.outcome, payout: row.payout }, expectedVersion: existing._row_version }),
    });
    console.log(`PATCH ${row.id} "${row.outcome} ${row.payout}" -> ${r.status}`);
  } else {
    r = await fetch(`${BASE_URL}/api/paytables`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: row.id, sidebet_id: "sb_uth_progressive", ...row }),
    });
    console.log(`POST  ${row.id} "${row.outcome} ${row.payout}" -> ${r.status}`);
  }
  if (!r.ok) console.log("   ", (await r.text()).slice(0, 140));
  await sleep(1000);
}
console.log("done");
