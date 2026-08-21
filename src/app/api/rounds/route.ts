import { NextResponse, type NextRequest } from "next/server";
import { makeListRoutes } from "@/lib/api/crudRoute";
import { roundCreateSchema, type Round } from "@/lib/validation/schemas";
import type { RoundCreate, RoundPatch } from "@/lib/repositories/inferred";
import { getRepositoriesForUser } from "@/lib/repositories";
import { apiError } from "@/lib/api/respond";
import { requireCurrentUser } from "@/lib/auth/session";

const base = makeListRoutes<Round, RoundCreate, RoundPatch>("rounds", roundCreateSchema);

export const POST = base.POST;

// Rounds are scoped to a session — support ?session_id= filtering so the session detail page doesn't
// have to pull every round ever logged.
export async function GET(request: NextRequest) {
  try {
    const repos = await getRepositoriesForUser(await requireCurrentUser());
    const sessionId = request.nextUrl.searchParams.get("session_id");
    const all = await repos.rounds.list();
    const rows = sessionId ? all.filter((r) => r.session_id === sessionId) : all;
    return NextResponse.json(rows);
  } catch (err) {
    return apiError(err);
  }
}
