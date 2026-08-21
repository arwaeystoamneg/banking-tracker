import Decimal from "decimal.js";

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function d(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

export function formatMoney(value: Decimal.Value): string {
  const n = d(value);
  const sign = n.isNegative() ? "-" : "";
  return `${sign}$${n.abs().toFixed(2)}`;
}

export function formatPercent(value: Decimal.Value, digits = 3): string {
  return `${d(value).times(100).toFixed(digits)}%`;
}
