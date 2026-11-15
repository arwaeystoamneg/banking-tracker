import { makeItemRoutes } from "@/lib/api/crudRoute";
import { autoTripPatchSchema, type AutoTrip } from "@/lib/validation/schemas";
import type { AutoTripCreate, AutoTripPatch } from "@/lib/repositories/inferred";

/** DELETE turns auto-adding off for that player (Ray or admin). */
export const { GET, PATCH, DELETE } = makeItemRoutes<AutoTrip, AutoTripCreate, AutoTripPatch>("autoTrips", autoTripPatchSchema);
