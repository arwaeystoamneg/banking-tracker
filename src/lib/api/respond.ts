import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ConflictError, NotFoundError } from "@/lib/repositories/types";

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
  console.error(err);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
