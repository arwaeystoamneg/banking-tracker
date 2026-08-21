import { describe, expect, it } from "vitest";
import { normalizePrivateKey } from "@/lib/repositories/sheets/privateKey";

describe("normalizePrivateKey", () => {
  it("unwraps Vercel-quoted env values and escaped newlines", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----";
    expect(normalizePrivateKey(`"${pem.replace(/\n/g, "\\n")}\\n"`)).toBe(`${pem}\n`);
    expect(normalizePrivateKey(`' ${pem} '`)).toBe(pem);
  });
});
