const LOGGED_BY_KEY = "cbt_logged_by";
const PLAYER_KEY = "cbt_last_player";

/** Per-device memory for the shared admin login, which has no name of its own. */
function read(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the form still works, it just won't prefill next time.
  }
}

export function getRememberedLoggedBy(): string {
  return read(LOGGED_BY_KEY);
}

export function rememberLoggedBy(name: string): void {
  write(LOGGED_BY_KEY, name);
}

/** Last player picked on this device, as `id:<account id>` or `name:<free text>`. */
export function getRememberedPlayer(): string {
  return read(PLAYER_KEY);
}

export function rememberPlayer(value: string): void {
  write(PLAYER_KEY, value);
}
