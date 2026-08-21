import { describe, expect, it } from "vitest";
import { roundCreateSchema, roundSchema } from "@/lib/validation/schemas";

describe("round schemas", () => {
  const valid = {
    round_id: "round-1",
    session_id: "session-1",
    seq: 1,
    tta: 500,
    booked: 400,
    fee_paid: 5,
    result: 20,
    _row_version: 1,
  };

  it("rejects booked action above offered TTA", () => {
    expect(() => roundSchema.parse({ ...valid, booked: 501 })).toThrow();
    expect(() => roundCreateSchema.parse({ ...valid, booked: 501 })).toThrow();
  });

  it("rejects negative TTA, booked, and fees", () => {
    expect(() => roundSchema.parse({ ...valid, tta: -1 })).toThrow();
    expect(() => roundSchema.parse({ ...valid, booked: -1 })).toThrow();
    expect(() => roundSchema.parse({ ...valid, fee_paid: -1 })).toThrow();
  });
});
