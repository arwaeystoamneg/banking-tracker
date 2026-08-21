import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/respond";
import { getRepositoriesForUser } from "@/lib/repositories";
import { requireCurrentUser } from "@/lib/auth/session";
import { lossDecisionSchema } from "@/lib/validation/schemas";

type RouteParams = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  decision: lossDecisionSchema,
  expectedVersion: z.number().int().positive(),
});

/**
 * The only endpoint that mutates a report. Authorization, the transition table, the two-person
 * rule, and the audit append all live in `recordDecision` — this route parses a body and calls it.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { decision, expectedVersion } = bodySchema.parse(await request.json());
    const repos = await getRepositoriesForUser(await requireCurrentUser());
    // reviewed_by / reviewed_at are stamped inside recordDecision; empty here so the
    // LossDecisionPatch type is satisfied without trusting the request body for them.
    const updated = await repos.lossReports.recordDecision(
      id,
      { ...decision, reviewed_by: "", reviewed_at: "" },
      expectedVersion,
    );
    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err);
  }
}
