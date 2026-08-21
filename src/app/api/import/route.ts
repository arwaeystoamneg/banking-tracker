import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getActiveBackend } from "@/lib/repositories";
import { replaceMockStore } from "@/lib/repositories/mock/store";
import {
  feeScheduleSchema,
  gameSchema,
  paytableSchema,
  roundSchema,
  sessionSchema,
  sidebetSchema,
} from "@/lib/validation/schemas";
import { apiError } from "@/lib/api/respond";
import { AuthorizationError, requireCurrentUser } from "@/lib/auth/session";

const snapshotSchema = z.object({
  games: z.array(gameSchema),
  sidebets: z.array(sidebetSchema),
  paytables: z.array(paytableSchema),
  feeSchedules: z.array(feeScheduleSchema),
  sessions: z.array(sessionSchema),
  rounds: z.array(roundSchema),
});

/**
 * Restores a full snapshot exactly as exported (ids and _row_version intact, so cross-tab references
 * keep working). Only wired for the mock backend for now — restoring into a live Sheets document
 * wholesale is a bigger, riskier operation than this pass covers; do it manually in Sheets if needed.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    if (user.role !== "admin") throw new AuthorizationError("Only an admin can restore a snapshot");

    if (getActiveBackend() !== "mock") {
      return NextResponse.json(
        { error: "not_implemented", message: "Import is only supported against the mock backend right now." },
        { status: 501 },
      );
    }

    const body = await request.json();
    const snapshot = snapshotSchema.parse(body);
    replaceMockStore(snapshot);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
