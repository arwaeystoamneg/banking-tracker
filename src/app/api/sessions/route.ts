import { makeListRoutes } from "@/lib/api/crudRoute";
import { sessionCreateSchema, type Session } from "@/lib/validation/schemas";
import type { SessionCreate, SessionPatch } from "@/lib/repositories/inferred";

export const { GET, POST } = makeListRoutes<Session, SessionCreate, SessionPatch>("sessions", sessionCreateSchema);
