import Decimal from "decimal.js";

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function d(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

/** "$20,000.00", "-$85.50". */
export function formatMoney(value: Decimal.Value): string {
  const n = d(value);
  const sign = n.isNegative() ? "-" : "";
  const [whole, cents] = n.abs().toFixed(2).split(".");
  return `${sign}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

/**
 * Reads a typed dollar amount the way people write it at a table: "15000", "15,000", "$15,000.50", "15k",
 * "2.5k". Returns NaN for anything else, so forms can say what's missing.
 */
export function parseMoneyInput(text: string): number {
  const cleaned = text.trim().replace(/[$,\s]/g, "").toLowerCase();
  if (!cleaned) return Number.NaN;
  const match = /^(\d+(?:\.\d+)?|\.\d+)(k)?$/.exec(cleaned);
  if (!match) return Number.NaN;
  const value = Number(match[1]) * (match[2] ? 1000 : 1);
  return Math.round(value * 100) / 100;
}

export function formatPercent(value: Decimal.Value, digits = 3): string {
  return `${d(value).times(100).toFixed(digits)}%`;
}
