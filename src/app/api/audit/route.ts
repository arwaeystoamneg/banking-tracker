import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/respond";
import { getRepositoriesForUser } from "@/lib/repositories";
import { requireCurrentUser } from "@/lib/auth/session";

export async function GET() {
  try {
    const repos = await getRepositoriesForUser(await requireCurrentUser());
    return NextResponse.json(await repos.auditLog.list());
  } catch (err) {
    return apiError(err);
  }
}
