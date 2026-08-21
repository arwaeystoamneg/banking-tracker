import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api/respond";
import { getRepositoriesForUser } from "@/lib/repositories";
import { requireCurrentUser } from "@/lib/auth/session";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const repos = await getRepositoriesForUser(await requireCurrentUser());
    const row = await repos.lossEvidence.get(id);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    return apiError(err);
  }
}
