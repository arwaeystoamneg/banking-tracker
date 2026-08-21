import { describe, expect, it } from "vitest";
import { googleApiMessage, isMissingSheetRangeError, isSheetAlreadyExistsError } from "@/lib/repositories/sheets/googleErrors";

describe("google sheet error shapes", () => {
  it("reads the nested Gaxios message", () => {
    const err = {
      message: "Request failed",
      response: { data: { error: { message: 'Unable to parse range: LossReports!1:1' } } },
    };
    expect(googleApiMessage(err)).toBe("Unable to parse range: LossReports!1:1");
    expect(isMissingSheetRangeError(err)).toBe(true);
  });

  it("detects a duplicate addSheet", () => {
    expect(
      isSheetAlreadyExistsError(
        new Error('Invalid requests[0].addSheet: A sheet with the name "LossReports" already exists.'),
      ),
    ).toBe(true);
  });
});
