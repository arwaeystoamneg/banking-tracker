import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/respond";
import { AuthorizationError, requireCurrentUser } from "@/lib/auth/session";
import { canApproveAccounts } from "@/lib/auth/permissions";
import { decideRegisteredAccount, toAccountRequest } from "@/lib/auth/registered";
import { NotFoundError } from "@/lib/repositories/types";

export const dynamic = "force-dynamic";

const decisionSchema = z.object({
  decision: z.enum(["approve", "approve_employee", "decline"]),
});

/**
 * Ray or admin lets a sign-up in (as an individual, or as an employee so they land on payroll) or turns it
 * down. Takes effect on that person's next page load; approving someone already declined lets them back in.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    if (!canApproveAccounts(user)) throw new AuthorizationError("Only Ray or admin can approve accounts");
    const { id } = await params;
    const { decision } = decisionSchema.parse(await request.json());
    const updated = await decideRegisteredAccount(
      id,
      decision === "decline"
        ? { status: "declined" }
        : { status: "approved", role: decision === "approve_employee" ? "employee" : "individual" },
      user.name,
    );
    if (!updated) throw new NotFoundError("Accounts", id);
    return NextResponse.json(toAccountRequest(updated));
  } catch (err) {
    return apiError(err);
  }
}
