import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentUser } from "@/lib/auth/session";
import { listTeamMembers } from "@/lib/auth/accounts";

export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The demo never sees real account names.
  const team = user.role === "demo" ? [] : listTeamMembers();
  return (
    <AppShell user={user} team={team}>
      {children}
    </AppShell>
  );
}
