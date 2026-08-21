import { NextResponse, type NextRequest } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { apiError } from "@/lib/api/respond";
import { canSubmitLossReport } from "@/lib/auth/permissions";
import { AuthorizationError, InputError, requireCurrentUser } from "@/lib/auth/session";
import { EVIDENCE_ALLOWED_TYPES, EVIDENCE_MAX_BYTES } from "@/lib/blob/constants";
import { getRepositoriesForUser } from "@/lib/repositories";

/**
 * Issues a client-upload token. Row-writing does not happen here: `onUploadCompleted` never fires
 * on localhost (Vercel cannot call back to the machine), so the client POSTs the blob key + hash
 * to /api/evidence after `upload()` resolves. Dev and prod take the same path. Do not pass
 * `onUploadCompleted` even as a no-op — the SDK then tries to mint a callback URL and warns.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    if (!canSubmitLossReport(user)) throw new AuthorizationError("This account cannot file loss reports");
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new InputError(
        "Photo uploads are not configured (missing BLOB_READ_WRITE_TOKEN). File the report without photos, or add the token and retry.",
      );
    }

    const body = (await request.json()) as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        let lossId = "";
        try {
          const parsed = JSON.parse(clientPayload ?? "{}") as { loss_id?: unknown };
          lossId = typeof parsed.loss_id === "string" ? parsed.loss_id : "";
        } catch {
          lossId = "";
        }
        if (!lossId) throw new AuthorizationError("A loss_id is required to upload evidence");

        const repos = await getRepositoriesForUser(user);
        const report = await repos.lossReports.get(lossId);
        if (!report) throw new AuthorizationError("Evidence can only be attached to a report you can see");
        if (report.status !== "submitted") {
          throw new AuthorizationError("Evidence cannot be added once a report is under review");
        }

        return {
          allowedContentTypes: [...EVIDENCE_ALLOWED_TYPES],
          maximumSizeInBytes: EVIDENCE_MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ loss_id: lossId, userId: user.userId }),
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    return apiError(err);
  }
}
