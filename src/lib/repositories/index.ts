import "server-only";
import type { Repositories } from "@/lib/repositories/types";
import { createMockRepositories } from "@/lib/repositories/mock";
import { hasSheetsCredentials } from "@/lib/repositories/sheets/client";

export * from "@/lib/repositories/types";

const globalForRepos = globalThis as unknown as { __repositories?: Repositories };

export function getActiveBackend(): "mock" | "sheets" {
  return selectedBackend();
}

function selectedBackend(): "mock" | "sheets" {
  const explicit = process.env.DATA_BACKEND;
  if (explicit === "mock" || explicit === "sheets") return explicit;
  return hasSheetsCredentials() ? "sheets" : "mock";
}

/**
 * Memoized on globalThis so Next's dev-server hot reload doesn't rebuild the client on every request.
 * Async so the Sheets backend (and its googleapis import) is only ever loaded when actually selected.
 */
export async function getRepositories(): Promise<Repositories> {
  if (globalForRepos.__repositories) return globalForRepos.__repositories;

  const backend = selectedBackend();
  if (backend === "sheets") {
    const { createSheetsRepositories } = await import("@/lib/repositories/sheets");
    globalForRepos.__repositories = createSheetsRepositories();
  } else {
    globalForRepos.__repositories = createMockRepositories();
  }
  return globalForRepos.__repositories;
}
