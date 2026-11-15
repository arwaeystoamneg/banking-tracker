import { makeListRoutes } from "@/lib/api/crudRoute";
import { autoTripCreateSchema, type AutoTrip } from "@/lib/validation/schemas";
import type { AutoTripCreate, AutoTripPatch } from "@/lib/repositories/inferred";

/** GET which players' new sessions join a trip on their own; POST { player, trip } turns it on (Ray or admin). */
export const { GET, POST } = makeListRoutes<AutoTrip, AutoTripCreate, AutoTripPatch>("autoTrips", autoTripCreateSchema);
