/** Pull a message out of a thrown value, including Gaxios's nested Google API error. */
export function googleApiMessage(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const nested = (err as { response?: { data?: { error?: { message?: unknown } } } }).response?.data?.error
      ?.message;
    if (typeof nested === "string" && nested) return nested;
    if (err instanceof Error && err.message) return err.message;
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return String(err);
}

export function isSheetAlreadyExistsError(err: unknown): boolean {
  const message = googleApiMessage(err);
  return /already exists/i.test(message) && /sheet/i.test(message);
}

export function isMissingSheetRangeError(err: unknown): boolean {
  return /unable to parse range/i.test(googleApiMessage(err));
}
