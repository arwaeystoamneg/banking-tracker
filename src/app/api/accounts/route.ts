import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/respond";
import { AuthorizationError, requireCurrentUser } from "@/lib/auth/session";
import { canApproveAccounts } from "@/lib/auth/permissions";
import { listRegisteredAccounts, toAccountRequest } from "@/lib/auth/registered";

export const dynamic = "force-dynamic";

/** Everyone who signed up in the app (never their password hashes). Ray and admin only. */
export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!canApproveAccounts(user)) throw new AuthorizationError("Only Ray or admin can see account requests");
    const accounts = (await listRegisteredAccounts()).map(toAccountRequest);
    return NextResponse.json(accounts, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return apiError(err);
  }
}
