import type { FeeSchedule, Game, Paytable, Round, Session, Sidebet } from "@/lib/validation/schemas";

export class ConflictError extends Error {
  constructor(
    public readonly tab: string,
    public readonly id: string,
    public readonly serverRow: unknown,
  ) {
    super(`Conflict updating ${tab}/${id}: row changed since it was read`);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(
    public readonly tab: string,
    public readonly id: string,
  ) {
    super(`${tab}/${id} not found`);
    this.name = "NotFoundError";
  }
}

/**
 * Every tab shares this shape. `update` takes the version the client last read (`expectedVersion`,
 * the row's `_row_version`) and throws ConflictError if the stored row has moved on — this is the
 * read-modify-write guard required by CLAUDE.md's offline-behavior section, implemented once here so
 * both the mock and Sheets backends honor it identically.
 */
export interface CrudRepository<T, TCreate, TPatch> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  /** `id`, when given, is used verbatim instead of generating a new one — see lib/ids.ts. */
  create(data: TCreate, id?: string): Promise<T>;
  update(id: string, patch: TPatch, expectedVersion: number): Promise<T>;
  remove(id: string, expectedVersion: number): Promise<void>;
}

import type {
  FeeScheduleCreate,
  FeeSchedulePatch,
  GameCreate,
  GamePatch,
  PaytableCreate,
  PaytablePatch,
  RoundCreate,
  RoundPatch,
  SessionCreate,
  SessionPatch,
  SidebetCreate,
  SidebetPatch,
} from "@/lib/repositories/inferred";

export interface Repositories {
  games: CrudRepository<Game, GameCreate, GamePatch>;
  sidebets: CrudRepository<Sidebet, SidebetCreate, SidebetPatch>;
  paytables: CrudRepository<Paytable, PaytableCreate, PaytablePatch>;
  feeSchedules: CrudRepository<FeeSchedule, FeeScheduleCreate, FeeSchedulePatch>;
  sessions: CrudRepository<Session, SessionCreate, SessionPatch>;
  rounds: CrudRepository<Round, RoundCreate, RoundPatch>;
}
