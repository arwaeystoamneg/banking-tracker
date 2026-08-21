import { NextResponse } from "next/server";
import { getRepositories } from "@/lib/repositories";
import { apiError } from "@/lib/api/respond";

/** Snapshot every tab to a single JSON file the user can download and keep. */
export async function GET() {
  try {
    const repos = await getRepositories();
    const [games, sidebets, paytables, feeSchedules, sessions, rounds] = await Promise.all([
      repos.games.list(),
      repos.sidebets.list(),
      repos.paytables.list(),
      repos.feeSchedules.list(),
      repos.sessions.list(),
      repos.rounds.list(),
    ]);

    const snapshot = { games, sidebets, paytables, feeSchedules, sessions, rounds, exportedAt: new Date().toISOString() };

    return new NextResponse(JSON.stringify(snapshot, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="banking-tracker-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
