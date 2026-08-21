import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api/respond";
import { getRepositoriesForUser } from "@/lib/repositories";
import { requireCurrentUser } from "@/lib/auth/session";
import { lossEvidenceSubmitSchema } from "@/lib/validation/schemas";

export async function GET() {
  try {
    const repos = await getRepositoriesForUser(await requireCurrentUser());
    return NextResponse.json(await repos.lossEvidence.list());
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...rest } = body as Record<string, unknown> & { id?: unknown };
    const data = lossEvidenceSubmitSchema.parse(rest);
    const repos = await getRepositoriesForUser(await requireCurrentUser());
    const created = await repos.lossEvidence.create(data, typeof id === "string" ? id : undefined);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
