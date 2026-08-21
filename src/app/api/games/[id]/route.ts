import { makeItemRoutes } from "@/lib/api/crudRoute";
import { gamePatchSchema, type Game } from "@/lib/validation/schemas";
import type { GameCreate, GamePatch } from "@/lib/repositories/inferred";

export const { GET, PATCH, DELETE } = makeItemRoutes<Game, GameCreate, GamePatch>("games", gamePatchSchema);
