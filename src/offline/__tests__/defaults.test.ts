import { describe, expect, it } from "vitest";
import { tabDefaults, withDefaults } from "@/offline/defaults";
import { ownsSession } from "@/lib/auth/permissions";
import { sessionPlayerName } from "@/lib/sessionHelpers";
import type { Session } from "@/lib/validation/schemas";

// Exactly what SessionForm queues when someone logs a session for themselves (player fields left out).
const justLogged = {
  date: "2026-11-24",
  buy_in: 10000,
  time_in: "18:00",
  logged_by: "Damon",
  casino: "",
  notes: "",
  game_id: "",
  schedule_option: "",
  buy_out: null,
  time_out: "",
  rounds_banked: null,
  action_offered: null,
  action_booked: null,
  coverage_pct: null,
  bonus_action_booked: null,
  collection_paid: null,
  gross_wl: null,
  net_pnl: null,
  peak_drawdown: null,
  partners: "",
  split_terms: "",
  logged_at: "2026-11-24T18:00:00.000Z",
  owner_id: "damon",
  session_id: "ses_local",
  _row_version: 0,
};

describe("cached rows get schema defaults", () => {
  it("fills every field a just-logged session is missing, so screens can read them", () => {
    const row = withDefaults("sessions", justLogged) as unknown as Session;
    expect(row).toMatchObject({ player: "", player_id: "", payroll_paid_at: "", overtime_status: "", trip: "", backing: "", backer_paid: "", pay_rate: null, ray_sponsored: false });
    // These threw "Cannot read properties of undefined (reading 'trim')" on the raw row.
    expect(() => ownsSession({ role: "employee", userId: "damon", name: "Damon" }, row)).not.toThrow();
    expect(sessionPlayerName(row)).toBe("Damon");
    // Fields the row has are kept as they are.
    expect(row.buy_in).toBe(10000);
    expect(row._row_version).toBe(0);
  });

  it("leaves complete rows untouched and ignores tabs without a schema", () => {
    const full = withDefaults("sessions", justLogged);
    expect(withDefaults("sessions", full)).toBe(full);
    expect(tabDefaults("games")).toBeNull();
  });
});
