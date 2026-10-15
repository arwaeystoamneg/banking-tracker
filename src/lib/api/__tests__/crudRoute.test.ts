import { describe, expect, it } from "vitest";
import { providedKeysOnly } from "@/lib/api/crudRoute";
import { gamePatchSchema, sessionPatchSchema } from "@/lib/validation/schemas";

describe("providedKeysOnly", () => {
  it("keeps a one-field session patch from resetting every defaulted field", () => {
    const raw = { buy_out: 1200, time_out: "23:10" };
    expect(providedKeysOnly(sessionPatchSchema.parse(raw), raw)).toEqual(raw);
  });

  it("keeps an explicit blank that the user actually sent", () => {
    const raw = { notes: "" };
    expect(providedKeysOnly(sessionPatchSchema.parse(raw), raw)).toEqual({ notes: "" });
  });

  it("applies to games edited one field at a time", () => {
    const raw = { rules: "Dealer hits soft 17" };
    expect(providedKeysOnly(gamePatchSchema.parse(raw), raw)).toEqual(raw);
  });
});
