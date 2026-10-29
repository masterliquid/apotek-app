import Decimal from "decimal.js";

// All money math goes through decimal.js; values are stored as NUMERIC(15,2) strings.
// Rounding is half-up to 2 decimals, matching how MySQL stored legacy DECIMAL(15,2) values.
export function toMoney(value: Decimal.Value): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export function percentOf(value: Decimal.Value, pct: Decimal.Value): Decimal {
  return new Decimal(value).mul(pct).div(100);
}
