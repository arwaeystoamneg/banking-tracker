import fs from "node:fs";
import path from "node:path";

/**
 * Local-dev/demo persistence for the mock backend: an in-memory object mirrored to a JSON file on
 * every write. This survives `next dev` restarts, but NOT a Vercel deployment — serverless functions
 * there have an ephemeral/read-only filesystem. Production always needs DATA_BACKEND=sheets.
 */

export interface MockTables {
  games: Record<string, unknown>[];
  sidebets: Record<string, unknown>[];
  paytables: Record<string, unknown>[];
  feeSchedules: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  rounds: Record<string, unknown>[];
}

const STORE_PATH = path.join(process.cwd(), ".data", "mock-store.json");
const BACKUP_PATH = `${STORE_PATH}.bak`;
const SEED_PATH = path.join(process.cwd(), "src", "lib", "repositories", "mock", "fixtures", "seed.json");

function isMockTables(value: unknown): value is MockTables {
  if (!value || typeof value !== "object") return false;
  const tables = value as Partial<MockTables>;
  return (
    Array.isArray(tables.games) &&
    Array.isArray(tables.sidebets) &&
    Array.isArray(tables.paytables) &&
    Array.isArray(tables.feeSchedules) &&
    Array.isArray(tables.sessions) &&
    Array.isArray(tables.rounds)
  );
}

function readTables(filePath: string): MockTables {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (!isMockTables(parsed)) throw new Error(`Invalid mock store shape: ${filePath}`);
  return parsed;
}

function loadSeed(): MockTables {
  return readTables(SEED_PATH);
}

function loadFromDisk(): MockTables {
  if (fs.existsSync(STORE_PATH)) {
    try {
      return readTables(STORE_PATH);
    } catch (error) {
      // A backup lets local development recover from an interrupted write without discarding data.
      if (fs.existsSync(BACKUP_PATH)) {
        try {
          const backup = readTables(BACKUP_PATH);
          console.warn("Mock store was unreadable; restored its last valid backup.", error);
          persistToDisk(backup);
          return backup;
        } catch {
          // Fall through to the seed only when both persisted copies are unusable.
        }
      }
      console.warn("Mock store was unreadable and had no backup; restoring seed data.", error);
    }
  }
  const seeded = loadSeed();
  persistToDisk(seeded);
  return seeded;
}

function isReadOnlyFsError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "EROFS" || error.code === "EACCES" || error.code === "EPERM"),
  );
}

function persistToDisk(tables: MockTables): void {
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    const tempPath = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(tables, null, 2), "utf-8");

    try {
      if (fs.existsSync(STORE_PATH)) {
        // Only replace the recovery copy when the current store is known to be valid.
        try {
          readTables(STORE_PATH);
          fs.copyFileSync(STORE_PATH, BACKUP_PATH);
        } catch {
          // The new temp file is still safe to promote when the old store is already corrupt.
        }
      }
      fs.renameSync(tempPath, STORE_PATH);
    } finally {
      fs.rmSync(tempPath, { force: true });
    }
  } catch (error) {
    // Vercel’s filesystem is read-only except /tmp. Keep the in-memory store rather than 500ing.
    if (isReadOnlyFsError(error)) return;
    throw error;
  }
}

// Memoize on globalThis so Next's dev-server hot reload doesn't wipe in-memory state on every request.
const globalForStore = globalThis as unknown as { __mockStore?: MockTables };

export function getMockStore(): MockTables {
  if (!globalForStore.__mockStore) {
    globalForStore.__mockStore = loadFromDisk();
  }
  return globalForStore.__mockStore;
}

export function saveMockStore(): void {
  if (globalForStore.__mockStore) {
    persistToDisk(globalForStore.__mockStore);
  }
}

/** Test/dev helper: wipe the in-memory + on-disk store back to the seed. */
export function resetMockStore(): void {
  globalForStore.__mockStore = loadSeed();
  persistToDisk(globalForStore.__mockStore);
}

/** Wholesale restore from an export snapshot — preserves ids and _row_version exactly as exported. */
export function replaceMockStore(tables: MockTables): void {
  globalForStore.__mockStore = tables;
  persistToDisk(tables);
}
