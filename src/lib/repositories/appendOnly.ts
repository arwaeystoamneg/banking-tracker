import type {
  AppendOnlyRepository,
  CrudRepository,
  LossReportRepository,
} from "@/lib/repositories/types";
import type { LossDecisionPatch, LossReport } from "@/lib/validation/schemas";
import type { LossReportCreate } from "@/lib/repositories/inferred";

/**
 * Both backends are built from the same generic CrudRepository. These adapters narrow one down to
 * the append-only surface before it is registered, so `update`/`remove` are not merely
 * discouraged on the loss-reporting tabs — they are absent from the value the app ever holds.
 */
export function toAppendOnly<T, TCreate>(
  repo: CrudRepository<T, TCreate, never>,
): AppendOnlyRepository<T, TCreate> {
  return {
    list: () => repo.list(),
    get: (id) => repo.get(id),
    create: (data, id) => repo.create(data, id),
  };
}

export function toLossReportRepository(
  repo: CrudRepository<LossReport, LossReportCreate, LossDecisionPatch>,
): LossReportRepository {
  return {
    list: () => repo.list(),
    get: (id) => repo.get(id),
    create: (data, id) => repo.create(data, id),
    recordDecision: (id, decision, expectedVersion) => repo.update(id, decision, expectedVersion),
  };
}
