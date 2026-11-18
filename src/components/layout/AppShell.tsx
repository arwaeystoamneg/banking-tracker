"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { SyncStatusBar } from "@/components/sync/SyncStatusBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ThemeBackdrop } from "@/components/layout/ThemeBackdrop";
import { AccountRequests } from "@/components/layout/AccountRequests";
import Link from "next/link";
import { canApproveAccounts, canManageAdmins } from "@/lib/auth/permissions";
import { isOwner } from "@/lib/auth/types";
import type { AuthUser, TeamMember } from "@/lib/auth/types";

export function AppShell({ user, team, children }: { user: AuthUser; team: TeamMember[]; children: ReactNode }) {
  return (
    <AuthProvider user={user} team={team}>
      <QueryProvider>
        <div className="flex min-h-dvh flex-col">
          <ThemeBackdrop />
          <div className="theme-stripe" aria-hidden />
          <div className="flex min-h-9 items-center justify-between border-b border-border bg-surface px-4 text-xs text-muted">
            <span>
              {user.name} ·{" "}
              {user.pending
                ? "waiting for approval · demo data"
                : user.role === "demo"
                  ? "public read-only demo"
                  : isOwner(user)
                    ? "owner"
                    : user.admin
                      ? `${user.role} · admin`
                      : user.role}
            </span>
            <div className="flex items-center">
              {canManageAdmins(user) ? (
                <Link href="/admins" className="min-h-9 px-2 leading-9 text-muted-strong active:text-foreground">
                  Admins
                </Link>
              ) : null}
              <ThemeToggle userId={user.userId} />
              <form action="/api/logout" method="POST">
                <button type="submit" className="min-h-9 px-2 text-muted-strong active:text-foreground">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          {canApproveAccounts(user) ? <AccountRequests /> : null}
          <SyncStatusBar />
          <div className="flex-1 overflow-y-auto pb-4">{children}</div>
          <BottomNav />
        </div>
      </QueryProvider>
    </AuthProvider>
  );
}
