"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { SyncStatusBar } from "@/components/sync/SyncStatusBar";
import { BottomNav } from "@/components/layout/BottomNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <div className="flex min-h-dvh flex-col">
        <SyncStatusBar />
        <div className="flex-1 overflow-y-auto pb-4">{children}</div>
        <BottomNav />
      </div>
    </QueryProvider>
  );
}
