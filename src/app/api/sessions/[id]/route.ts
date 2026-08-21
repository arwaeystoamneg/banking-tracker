import { makeItemRoutes } from "@/lib/api/crudRoute";
import { sessionPatchSchema, type Session } from "@/lib/validation/schemas";
import type { SessionCreate, SessionPatch } from "@/lib/repositories/inferred";

export const { GET, PATCH, DELETE } = makeItemRoutes<Session, SessionCreate, SessionPatch>("sessions", sessionPatchSchema);
