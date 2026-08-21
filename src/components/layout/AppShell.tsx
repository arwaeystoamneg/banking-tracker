"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { SyncStatusBar } from "@/components/sync/SyncStatusBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { AuthProvider } from "@/components/providers/AuthProvider";
import type { AuthUser } from "@/lib/auth/types";

export function AppShell({ user, children }: { user: AuthUser; children: ReactNode }) {
  return (
    <AuthProvider user={user}>
      <QueryProvider>
        <div className="flex min-h-dvh flex-col">
          <div className="flex min-h-9 items-center justify-between border-b border-border bg-surface px-4 text-xs text-muted">
            <span>
              {user.name} · {user.role === "demo" ? "public read-only demo" : user.role}
            </span>
            <form action="/api/logout" method="POST">
              <button type="submit" className="min-h-9 px-2 text-muted-strong active:text-foreground">
                Sign out
              </button>
            </form>
          </div>
          <SyncStatusBar />
          <div className="flex-1 overflow-y-auto pb-4">{children}</div>
          <BottomNav />
        </div>
      </QueryProvider>
    </AuthProvider>
  );
}
