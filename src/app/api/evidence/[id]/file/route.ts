import { NextResponse, type NextRequest } from "next/server";
import { get } from "@vercel/blob";
import { apiError } from "@/lib/api/respond";
import { EVIDENCE_BLOB_ACCESS } from "@/lib/blob/constants";
import { getRepositoriesForUser } from "@/lib/repositories";
import { requireCurrentUser } from "@/lib/auth/session";

type RouteParams = { params: Promise<{ id: string }> };

/** Streams a private evidence blob after the same visibility check as the evidence row. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await requireCurrentUser();
    const repos = await getRepositoriesForUser(user);
    const row = await repos.lossEvidence.get(id);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const result = await get(row.blob_key, { access: EVIDENCE_BLOB_ACCESS });
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || row.mime || "image/jpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
