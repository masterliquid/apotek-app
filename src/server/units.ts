// Stock is always counted in a product's base unit (e.g. tablet). A pack unit (strip, box) has a factor:
// 1 box with factor 100 = 100 base units. Fractions are not allowed.
export function toBaseQty(qty: number, factor: number): number {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Quantity must be a positive whole number");
  if (!Number.isInteger(factor) || factor < 1) throw new Error("Unit factor must be a whole number of at least 1");
  const base = qty * factor;
  if (!Number.isSafeInteger(base) || base > 2_147_483_647) throw new Error("Quantity is too large");
  return base;
}
