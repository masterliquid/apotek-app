import Decimal from "decimal.js";
import { percentOf, toMoney } from "./money";

// Legacy pricing rule (t2_barang, T2Barang::beforeValidate):
//   buy price         = base cost + markup%   (markup was hard-coded 10%; now a pharmacy setting, default 10)
//   recommended price = buy price + margin%
// Only the manually set sell price is used at the POS. The recommended price is computed from the
// unrounded buy price, as the legacy PHP code did, and each stored value is rounded to 2 decimals.
export function computeProductPrices(input: { baseCost: Decimal.Value; markupPct: Decimal.Value; marginPct: Decimal.Value }) {
  const baseCost = new Decimal(input.baseCost);
  if (baseCost.isNegative()) throw new Error("Base cost cannot be negative");
  const buyPrice = baseCost.add(percentOf(baseCost, input.markupPct));
  const recommendedPrice = buyPrice.add(percentOf(buyPrice, input.marginPct));
  return { buyPrice: toMoney(buyPrice), recommendedPrice: toMoney(recommendedPrice) };
}

// Legacy goods-receipt rule (T3PurchaseUnitsController): the product's base cost is replaced only when
// the newly received cost is higher; a lower purchase price never lowers it.
export function nextBaseCostAfterReceipt(currentBaseCost: Decimal.Value, receivedUnitCost: Decimal.Value): string {
  const current = new Decimal(currentBaseCost);
  const received = new Decimal(receivedUnitCost);
  return toMoney(received.greaterThan(current) ? received : current);
}
