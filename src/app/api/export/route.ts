import { NextResponse } from "next/server";
import { getRepositoriesForUser } from "@/lib/repositories";
import { apiError } from "@/lib/api/respond";
import { requireCurrentUser } from "@/lib/auth/session";

/** Snapshot every tab to a single JSON file the user can download and keep. */
export async function GET() {
  try {
    const user = await requireCurrentUser();
    const repos = await getRepositoriesForUser(user);
    const [games, sidebets, paytables, feeSchedules, sessions, rounds, lossReports, lossEvidence, auditLog] =
      await Promise.all([
        repos.games.list(),
        repos.sidebets.list(),
        repos.paytables.list(),
        repos.feeSchedules.list(),
        repos.sessions.list(),
        repos.rounds.list(),
        repos.lossReports.list(),
        repos.lossEvidence.list(),
        repos.auditLog.list(),
      ]);

    const snapshot = {
      games,
      sidebets,
      paytables,
      feeSchedules,
      sessions,
      rounds,
      lossReports,
      lossEvidence,
      auditLog,
      exportedAt: new Date().toISOString(),
    };

    return new NextResponse(JSON.stringify(snapshot, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${user.role === "demo" ? "banking-tracker-demo" : "banking-tracker-export"}-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
