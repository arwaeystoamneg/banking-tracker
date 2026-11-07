import { NextResponse } from "next/server";
import { getRepositoriesForUser } from "@/lib/repositories";
import { apiError } from "@/lib/api/respond";
import { requireCurrentUser } from "@/lib/auth/session";

/**
 * Snapshot every tab to a single JSON file the user can download and keep. The tabs come from the
 * repositories themselves, so a tab added later is exported without anyone remembering to list it here.
 */
export async function GET() {
  try {
    const user = await requireCurrentUser();
    const repos = await getRepositoriesForUser(user);
    const tabs = await Promise.all(
      Object.entries(repos).map(async ([name, repo]) => [name, await (repo as { list(): Promise<unknown[]> }).list()] as const),
    );
    const snapshot = { ...Object.fromEntries(tabs), exportedAt: new Date().toISOString() };

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
