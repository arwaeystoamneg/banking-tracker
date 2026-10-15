"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthUser, TeamMember } from "@/lib/auth/types";
import { configureOfflineDatabase, getActivePrincipalId } from "@/offline/db";

const AuthContext = createContext<AuthUser | null>(null);
const TeamContext = createContext<TeamMember[]>([]);

export function AuthProvider({ user, team, children }: { user: AuthUser; team: TeamMember[]; children: ReactNode }) {
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void configureOfflineDatabase(user)
      .then(() => {
        if (!cancelled) setReadyFor(user.userId);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const ready = readyFor === user.userId && getActivePrincipalId() === user.userId;
  return (
    <AuthContext.Provider value={user}>
      <TeamContext.Provider value={team}>
      {error ? (
        <p className="p-4 text-sm text-red-400">Could not open this account&apos;s offline data: {error}</p>
      ) : ready ? (
        children
      ) : (
        <p className="p-4 text-sm text-muted">Opening offline data…</p>
      )}
      </TeamContext.Provider>
    </AuthContext.Provider>
  );
}

/** Every configured account (id + name only), for choosing who played a session. */
export function useTeam(): TeamMember[] {
  return useContext(TeamContext);
}

export function useCurrentUser(): AuthUser {
  const user = useContext(AuthContext);
  if (!user) throw new Error("useCurrentUser must be used inside AuthProvider");
  return user;
}
