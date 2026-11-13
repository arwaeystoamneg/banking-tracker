import type { CSSProperties } from "react";

/** Each room's starting color; Ray or admin can change any of them in the app. */
export const DEFAULT_ROOM_COLORS: Record<string, string> = {
  "Artichoke Joe's": "#f472b6",
  M8trix: "#7e22ce",
  Oaks: "#8b5a2b",
  "Bay 101": "#f59e0b",
  "Hollywood Park": "#000000",
  Bicycle: "#3b82f6",
  Commerce: "#14b8a6",
  Hustler: "#22d3ee",
  Gardens: "#a3e635",
};
const OTHER = "#94a3b8";

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** Very dark colors (like black) get a solid fill and a light outline so they stay visible on the dark page. */
function isDark(hex: string): boolean {
  const [r, g, b] = channels(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 40;
}

/** The color mixed halfway to white, for readable text on the dark page. */
function lighten(hex: string): string {
  return `#${channels(hex)
    .map((c) => Math.round(c + (255 - c) * 0.5).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function roomHex(room: string, chosen: Record<string, string> = {}): string {
  const color = chosen[room] ?? DEFAULT_ROOM_COLORS[room] ?? OTHER;
  return isHexColor(color) ? color : OTHER;
}

export function roomBadgeStyle(hex: string): CSSProperties {
  return isDark(hex)
    ? { backgroundColor: hex, borderColor: "#737373", color: "#f5f5f5" }
    : { backgroundColor: `${hex}33`, borderColor: `${hex}99`, color: lighten(hex) };
}

export function roomDotStyle(hex: string): CSSProperties {
  return isDark(hex) ? { backgroundColor: hex, boxShadow: "0 0 0 1px #a3a3a3" } : { backgroundColor: hex };
}
