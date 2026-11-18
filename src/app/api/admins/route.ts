import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/respond";
import { AuthorizationError, InputError, requireCurrentUser } from "@/lib/auth/session";
import { canManageAdmins } from "@/lib/auth/permissions";
import { listTeamMembers } from "@/lib/auth/accounts";
import { grantAdmin, listAdminIds, revokeAdmin } from "@/lib/auth/admins";
import { OWNER_ACCOUNT_ID } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

/** Everyone with an account and whether they're admin. Ray only. */
export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!canManageAdmins(user)) throw new AuthorizationError("Only Ray can manage admins");
    const [team, admins] = await Promise.all([listTeamMembers(), listAdminIds()]);
    return NextResponse.json(
      team.map((member) => ({
        id: member.id,
        name: member.name,
        admin: member.id === OWNER_ACCOUNT_ID || admins.has(member.id),
        owner: member.id === OWNER_ACCOUNT_ID,
      })),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return apiError(err);
  }
}

const changeSchema = z.object({ id: z.string().trim().min(1), admin: z.boolean() });

/** Ray grants or removes admin status. Nobody can change Ray's. Takes effect on that person's next page load. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    if (!canManageAdmins(user)) throw new AuthorizationError("Only Ray can grant or remove admin status");
    const { id, admin } = changeSchema.parse(await request.json());
    const target = (await listTeamMembers()).find((member) => member.id === id.trim().toLowerCase());
    if (!target) throw new InputError("No account with that id");
    if (target.id === OWNER_ACCOUNT_ID) throw new InputError("Ray is always admin");
    if (admin) await grantAdmin(target.id, target.name, user.name);
    else await revokeAdmin(target.id);
    return NextResponse.json({ id: target.id, admin });
  } catch (err) {
    return apiError(err);
  }
}
