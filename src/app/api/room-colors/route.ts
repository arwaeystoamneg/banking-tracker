import { makeListRoutes } from "@/lib/api/crudRoute";
import { roomColorCreateSchema, type RoomColor } from "@/lib/validation/schemas";
import type { RoomColorCreate, RoomColorPatch } from "@/lib/repositories/inferred";

/** GET every room's chosen color; POST { room, color } sets one (Ray or admin). */
export const { GET, POST } = makeListRoutes<RoomColor, RoomColorCreate, RoomColorPatch>("roomColors", roomColorCreateSchema);
