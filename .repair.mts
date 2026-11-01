// Re-align Sessions rows that were written shifted right. Dry run unless --apply.
import { getSheetsClient, getSheetId } from "@/lib/repositories/sheets/client";
import { SESSIONS_TAB } from "@/lib/repositories/sheets/tabs";
import { sheetRowsToObjects } from "@/lib/repositories/sheets/rowMapper";
import { sessionSchema } from "@/lib/validation/schemas";
const apply = process.argv.includes("--apply");
const sheets = getSheetsClient();
const spreadsheetId = getSheetId();
const values = ((await sheets.spreadsheets.values.get({ spreadsheetId, range: "Sessions!A:ZZ" })).data.values ?? []) as string[][];
const h = values[0];
const idCol = h.indexOf("session_id");
const good = sessionRowsGood();
function sessionRowsGood() {
  return sheetRowsToObjects(SESSIONS_TAB, values).map((r) => sessionSchema.safeParse(r)).filter((r) => r.success).map((r) => r.data!);
}
const plan: { row: number; cells: string[]; width: number }[] = [];
values.forEach((r, i) => {
  if (i === 0 || r.every((c) => !String(c ?? "").trim()) || String(r[idCol] ?? "").trim()) return;
  const at = r.findIndex((c) => /^ses_/.test(String(c)));
  const shift = at - idCol;
  const cells = h.map((_, col) => String(r[col + shift] ?? ""));
  plan.push({ row: i + 1, cells, width: r.length });
});
for (const p of plan) {
  const obj = sheetRowsToObjects(SESSIONS_TAB, [h, p.cells])[0];
  const parsed = sessionSchema.safeParse(obj);
  const s = parsed.success ? parsed.data : null;
  const dupe = s && good.find((g) => (g.player_id || g.player) === (s.player_id || s.player) && g.date === s.date && g.time_in === s.time_in);
  console.log(`row ${p.row}: ${parsed.success ? "OK" : "INVALID"} | ${s?.session_id.slice(0, 12)} | ${s?.player || s?.logged_by} | ${s?.date} ${s?.time_in}-${s?.time_out} | in=${s?.buy_in} out=${s?.buy_out} | v${s?._row_version}${dupe ? ` | ALREADY RE-ENTERED as ${dupe.session_id.slice(0, 12)}` : ""}`);
}
if (apply) {
  const lastCol = (n: number) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  for (const p of plan) {
    const width = Math.max(p.width, h.length);
    const row = Array.from({ length: width }, (_, i) => (i < h.length ? p.cells[i] : ""));
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `Sessions!A${p.row}:${lastCol(width)}${p.row}`, valueInputOption: "RAW", requestBody: { values: [row] } });
  }
  console.log(`re-aligned ${plan.length} rows`);
}
