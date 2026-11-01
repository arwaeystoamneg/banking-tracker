/**
 * Whether the server answers right now. navigator.onLine alone says "online" on a cardroom floor with one bar
 * that can't load anything, so this asks for a tiny public file with a short timeout.
 */
export async function serverReachable(timeoutMs = 2500): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/manifest.webmanifest", { cache: "no-store", signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
