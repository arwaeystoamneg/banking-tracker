import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ConflictError, NotFoundError } from "@/lib/repositories/types";
import { AuthenticationError, AuthorizationError, InputError } from "@/lib/auth/session";

export function apiError(err: unknown): NextResponse {
  if (err instanceof ConflictError) {
    return NextResponse.json({ error: "conflict", tab: err.tab, id: err.id, serverRow: err.serverRow }, { status: 409 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: "not_found", tab: err.tab, id: err.id }, { status: 404 });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "invalid_input", issues: err.issues }, { status: 400 });
  }
  if (err instanceof AuthenticationError) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (err instanceof AuthorizationError) {
    return NextResponse.json({ error: "forbidden", message: err.message }, { status: 403 });
  }
  if (err instanceof InputError) {
    return NextResponse.json({ error: "invalid_input", message: err.message }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
