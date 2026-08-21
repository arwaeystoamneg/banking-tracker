export async function readApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown; message?: unknown };
    if (typeof body.message === "string" && body.message) return body.message;
    if (body.error === "conflict") {
      return "This report changed while you were looking at it. Reload and try again.";
    }
    if (body.error === "forbidden") return "You don't have permission to do that.";
    if (body.error === "not_found") return "Not found.";
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // Body wasn't JSON — fall through to the status code.
  }
  return `Request failed (${res.status})`;
}
