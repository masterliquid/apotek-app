import Decimal from "decimal.js";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { goodsReceiptLines, goodsReceipts, productBatches, products, purchaseOrderLines, purchaseOrders, stockMovements, suppliers, units } from "@/db/schema";
import { dayInPharmacyTime, nextDailyNumber } from "./counters";
import { percentOf, toMoney } from "./money";
import { computeProductPrices, nextBaseCostAfterReceipt } from "./pricing";
import { resolveUnitFactor } from "./products";
import { toBaseQty } from "./units";

export class PurchasingError extends Error {
  // `lineId` is the purchase order line the problem belongs to, so the screen can mark the right row.
  constructor(message: string, public lineId?: number) {
    super(message);
    this.name = "PurchasingError";
  }
}

type Ctx = { pharmacyId: number; userId: number };
type PoStatus = "open" | "partial" | "received" | "closed" | "cancelled";

const STATUS_LABEL: Record<PoStatus, string> = { open: "open", partial: "partially received", received: "fully received", closed: "closed", cancelled: "cancelled" };

// --- Purchase orders -----------------------------------------------------------
// Life of an order: open (nothing received) → partial (some received) → received (all received).
// A partial order can also be "closed" when the supplier will not send the rest; an open order can be cancelled.

export async function createPurchaseOrder(tx: Tx, ctx: Ctx, input: { supplierId: number; note?: string | null }, now = new Date()) {
  const poNo = await nextDailyNumber(tx, ctx.pharmacyId, "PO", now);
  const [row] = await tx
    .insert(purchaseOrders)
    .values({ pharmacyId: ctx.pharmacyId, poNo, supplierId: input.supplierId, note: input.note || null, createdBy: ctx.userId })
    .returning({ id: purchaseOrders.id });
  return { id: row.id, poNo };
}

// Locks the order row (so two people cannot receive or edit the same order at the same moment) and returns its status.
async function lockPurchaseOrder(tx: Tx, pharmacyId: number, purchaseOrderId: number): Promise<PoStatus> {
  const rows = (await tx.execute(sql`select status from purchase_orders where pharmacy_id = ${pharmacyId} and id = ${purchaseOrderId} for update`)).rows as { status: PoStatus }[];
  if (rows.length === 0) throw new PurchasingError("Purchase order not found");
  return rows[0].status;
}

async function lockEditablePurchaseOrder(tx: Tx, pharmacyId: number, purchaseOrderId: number): Promise<PoStatus> {
  const status = await lockPurchaseOrder(tx, pharmacyId, purchaseOrderId);
  if (status !== "open" && status !== "partial") throw new PurchasingError(`This purchase order is no longer open (it is ${STATUS_LABEL[status]})`);
  return status;
}

async function receivedByLine(tx: Tx, pharmacyId: number, lineIds: number[]): Promise<Map<number, number>> {
  if (lineIds.length === 0) return new Map();
  const rows = await tx
    .select({ lineId: goodsReceiptLines.purchaseOrderLineId, qty: sql<number>`sum(${goodsReceiptLines.qty})::int` })
    .from(goodsReceiptLines)
    .where(and(eq(goodsReceiptLines.pharmacyId, pharmacyId), inArray(goodsReceiptLines.purchaseOrderLineId, lineIds)))
    .groupBy(goodsReceiptLines.purchaseOrderLineId);
  return new Map(rows.map((r) => [r.lineId!, r.qty]));
}

export async function addPurchaseOrderLine(tx: Tx, ctx: Ctx, purchaseOrderId: number, input: { productId: number; unitId: number; qty: number }) {
  await lockEditablePurchaseOrder(tx, ctx.pharmacyId, purchaseOrderId);
  const unitFactor = await resolveUnitFactor(tx, ctx.pharmacyId, input.productId, input.unitId);
  toBaseQty(input.qty, unitFactor); // validates qty
  await tx.insert(purchaseOrderLines).values({ pharmacyId: ctx.pharmacyId, purchaseOrderId, productId: input.productId, unitId: input.unitId, unitFactor, qty: input.qty, createdBy: ctx.userId });
  // A partially received order that gets a new line still has something to receive.
  await syncStatus(tx, ctx, purchaseOrderId);
}

export async function removePurchaseOrderLine(tx: Tx, ctx: Ctx, purchaseOrderId: number, lineId: number) {
  await lockEditablePurchaseOrder(tx, ctx.pharmacyId, purchaseOrderId);
  if ((await receivedByLine(tx, ctx.pharmacyId, [lineId])).get(lineId)) throw new PurchasingError("Part of this item was already received, so it cannot be removed. Close the order instead.", lineId);
  await tx.delete(purchaseOrderLines).where(and(eq(purchaseOrderLines.pharmacyId, ctx.pharmacyId), eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId), eq(purchaseOrderLines.id, lineId)));
  await syncStatus(tx, ctx, purchaseOrderId);
}

// Fix a wrong ordered quantity (e.g. typed 1000 instead of 100). It can never go below what was already received.
export async function setPurchaseOrderLineQty(tx: Tx, ctx: Ctx, purchaseOrderId: number, lineId: number, qty: number) {
  await lockEditablePurchaseOrder(tx, ctx.pharmacyId, purchaseOrderId);
  if (!Number.isInteger(qty) || qty <= 0) throw new PurchasingError("Quantity must be a whole number above 0", lineId);
  const received = (await receivedByLine(tx, ctx.pharmacyId, [lineId])).get(lineId) ?? 0;
  if (qty < received) throw new PurchasingError(`${received} were already received, so the order cannot be lower than ${received}`, lineId);
  await tx.update(purchaseOrderLines).set({ qty, updatedAt: new Date(), updatedBy: ctx.userId }).where(and(eq(purchaseOrderLines.pharmacyId, ctx.pharmacyId), eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId), eq(purchaseOrderLines.id, lineId)));
  await syncStatus(tx, ctx, purchaseOrderId);
}

// "Nothing received" → open; something still missing → partial; everything in → received.
async function syncStatus(tx: Tx, ctx: Ctx, purchaseOrderId: number): Promise<PoStatus> {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(goodsReceipts).where(and(eq(goodsReceipts.pharmacyId, ctx.pharmacyId), eq(goodsReceipts.purchaseOrderId, purchaseOrderId)));
  const lines = await tx.select({ id: purchaseOrderLines.id, qty: purchaseOrderLines.qty }).from(purchaseOrderLines).where(and(eq(purchaseOrderLines.pharmacyId, ctx.pharmacyId), eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId)));
  const received = await receivedByLine(tx, ctx.pharmacyId, lines.map((l) => l.id));
  const missing = lines.some((l) => (received.get(l.id) ?? 0) < l.qty);
  const status: PoStatus = n === 0 ? "open" : missing ? "partial" : "received";
  await tx.update(purchaseOrders).set({ status, updatedAt: new Date(), updatedBy: ctx.userId }).where(and(eq(purchaseOrders.pharmacyId, ctx.pharmacyId), eq(purchaseOrders.id, purchaseOrderId)));
  return status;
}

// The supplier will not send the rest: keep what was received, stop waiting for the remainder.
export async function closePurchaseOrder(tx: Tx, ctx: Ctx, purchaseOrderId: number) {
  const status = await lockPurchaseOrder(tx, ctx.pharmacyId, purchaseOrderId);
  if (status !== "partial") throw new PurchasingError(status === "open" ? "Nothing was received yet. Cancel the order instead." : `This purchase order is already ${STATUS_LABEL[status]}`);
  await tx.update(purchaseOrders).set({ status: "closed", updatedAt: new Date(), updatedBy: ctx.userId }).where(and(eq(purchaseOrders.pharmacyId, ctx.pharmacyId), eq(purchaseOrders.id, purchaseOrderId)));
}

export async function cancelPurchaseOrder(tx: Tx, ctx: Ctx, purchaseOrderId: number) {
  const status = await lockPurchaseOrder(tx, ctx.pharmacyId, purchaseOrderId);
  if (status !== "open") throw new PurchasingError(status === "partial" ? "Goods were already received. Close the order instead." : `This purchase order is already ${STATUS_LABEL[status]}`);
  await tx.update(purchaseOrders).set({ status: "cancelled", updatedAt: new Date(), updatedBy: ctx.userId }).where(and(eq(purchaseOrders.pharmacyId, ctx.pharmacyId), eq(purchaseOrders.id, purchaseOrderId)));
}

export async function listPurchaseOrders(tx: Tx, pharmacyId: number) {
  return tx
    .select({
      id: purchaseOrders.id,
      poNo: purchaseOrders.poNo,
      status: purchaseOrders.status,
      supplierName: suppliers.name,
      createdAt: purchaseOrders.createdAt,
      orderedBase: sql<number>`coalesce((select sum(l.qty * l.unit_factor) from purchase_order_lines l where l.pharmacy_id = ${purchaseOrders.pharmacyId} and l.purchase_order_id = ${purchaseOrders.id}), 0)::int`,
      receivedBase: sql<number>`coalesce((select sum(r.qty_base) from goods_receipt_lines r join purchase_order_lines l on l.pharmacy_id = r.pharmacy_id and l.id = r.purchase_order_line_id where l.pharmacy_id = ${purchaseOrders.pharmacyId} and l.purchase_order_id = ${purchaseOrders.id}), 0)::int`,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, and(eq(suppliers.pharmacyId, purchaseOrders.pharmacyId), eq(suppliers.id, purchaseOrders.supplierId)))
    .where(eq(purchaseOrders.pharmacyId, pharmacyId))
    .orderBy(desc(purchaseOrders.id))
    .limit(300);
}

export async function getPurchaseOrder(tx: Tx, pharmacyId: number, purchaseOrderId: number) {
  const [po] = await tx
    .select({ id: purchaseOrders.id, poNo: purchaseOrders.poNo, status: purchaseOrders.status, note: purchaseOrders.note, createdAt: purchaseOrders.createdAt, supplierName: suppliers.name })
    .from(purchaseOrders)
    .innerJoin(suppliers, and(eq(suppliers.pharmacyId, purchaseOrders.pharmacyId), eq(suppliers.id, purchaseOrders.supplierId)))
    .where(and(eq(purchaseOrders.pharmacyId, pharmacyId), eq(purchaseOrders.id, purchaseOrderId)));
  if (!po) return null;

  const rawLines = await tx
    .select({
      id: purchaseOrderLines.id,
      productId: purchaseOrderLines.productId,
      productCode: products.code,
      productName: products.name,
      baseCost: products.baseCost,
      unitId: purchaseOrderLines.unitId,
      unitName: units.name,
      unitFactor: purchaseOrderLines.unitFactor,
      qty: purchaseOrderLines.qty,
    })
    .from(purchaseOrderLines)
    .innerJoin(products, and(eq(products.pharmacyId, purchaseOrderLines.pharmacyId), eq(products.id, purchaseOrderLines.productId)))
    .innerJoin(units, and(eq(units.pharmacyId, purchaseOrderLines.pharmacyId), eq(units.id, purchaseOrderLines.unitId)))
    .where(and(eq(purchaseOrderLines.pharmacyId, pharmacyId), eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId)))
    .orderBy(asc(purchaseOrderLines.id));
  const received = await receivedByLine(tx, pharmacyId, rawLines.map((l) => l.id));
  const lines = rawLines.map((l) => {
    const receivedQty = received.get(l.id) ?? 0;
    return {
      ...l,
      receivedQty,
      remainingQty: Math.max(l.qty - receivedQty, 0),
      // What the product usually costs for one ordered unit; offered as the starting value of the invoice price.
      suggestedPrice: toMoney(new Decimal(l.baseCost).mul(l.unitFactor)),
    };
  });

  const receiptRows = await tx
    .select({ id: goodsReceipts.id, receiptNo: goodsReceipts.receiptNo, invoiceNo: goodsReceipts.supplierInvoiceNo, grandTotal: goodsReceipts.grandTotal, note: goodsReceipts.note, createdAt: goodsReceipts.createdAt })
    .from(goodsReceipts)
    .where(and(eq(goodsReceipts.pharmacyId, pharmacyId), eq(goodsReceipts.purchaseOrderId, purchaseOrderId)))
    .orderBy(asc(goodsReceipts.id));
  const receiptLines = receiptRows.length
    ? await tx
        .select({
          receiptId: goodsReceiptLines.goodsReceiptId,
          productName: products.name,
          unitName: units.name,
          qty: goodsReceiptLines.qty,
          batchNo: productBatches.batchNo,
          expiryDate: productBatches.expiryDate,
          unitPrice: goodsReceiptLines.unitPrice,
          discountPct: goodsReceiptLines.discountPct,
          lineTotal: goodsReceiptLines.lineTotal,
          planned: sql<boolean>`${goodsReceiptLines.purchaseOrderLineId} is not null`,
        })
        .from(goodsReceiptLines)
        .innerJoin(products, and(eq(products.pharmacyId, goodsReceiptLines.pharmacyId), eq(products.id, goodsReceiptLines.productId)))
        .innerJoin(units, and(eq(units.pharmacyId, goodsReceiptLines.pharmacyId), eq(units.id, goodsReceiptLines.unitId)))
        .innerJoin(productBatches, and(eq(productBatches.pharmacyId, goodsReceiptLines.pharmacyId), eq(productBatches.id, goodsReceiptLines.batchId)))
        .where(and(eq(goodsReceiptLines.pharmacyId, pharmacyId), inArray(goodsReceiptLines.goodsReceiptId, receiptRows.map((r) => r.id))))
        .orderBy(asc(goodsReceiptLines.id))
    : [];
  const receipts = receiptRows.map((r) => ({ ...r, lines: receiptLines.filter((l) => l.receiptId === r.id) }));

  return { ...po, lines, receipts };
}

// --- Goods receipt -------------------------------------------------------------

export type ReceiptLineInput = {
  // The ordered line this delivery counts against. When omitted, it is matched to an open line of the same product and
  // unit; when nothing matches, the item is recorded as an extra (it arrived but was not on the order).
  purchaseOrderLineId?: number | null;
  productId?: number;
  unitId?: number;
  qty: number;
  // Price per received unit as printed on the supplier invoice.
  unitPrice: string;
  discountPct: string;
  batchNo: string;
  // YYYY-MM-DD
  expiryDate: string;
};

export type ReceiveGoodsInput = { purchaseOrderId: number; supplierInvoiceNo: string; note?: string | null; lines: ReceiptLineInput[] };

// Records ONE delivery against an order. An order can be received in several deliveries; each delivery is its own
// receipt (GR-…). Everything runs in the caller's transaction: receipt + lines, batch stock, the append-only stock
// ledger, cost update and the order's status either all happen or none. The order row is locked first, so two people
// receiving at once cannot receive more than was ordered.
export async function receiveGoods(tx: Tx, ctx: Ctx, markupPct: string, input: ReceiveGoodsInput, now = new Date()) {
  if (input.lines.length === 0) throw new PurchasingError("Enter the quantity that arrived for at least one item");
  const today = dayInPharmacyTime(now);
  await lockEditablePurchaseOrder(tx, ctx.pharmacyId, input.purchaseOrderId);

  const poLines = await tx
    .select({ id: purchaseOrderLines.id, productId: purchaseOrderLines.productId, unitId: purchaseOrderLines.unitId, qty: purchaseOrderLines.qty, name: products.name })
    .from(purchaseOrderLines)
    .innerJoin(products, and(eq(products.pharmacyId, purchaseOrderLines.pharmacyId), eq(products.id, purchaseOrderLines.productId)))
    .where(and(eq(purchaseOrderLines.pharmacyId, ctx.pharmacyId), eq(purchaseOrderLines.purchaseOrderId, input.purchaseOrderId)))
    .orderBy(asc(purchaseOrderLines.id));
  const already = await receivedByLine(tx, ctx.pharmacyId, poLines.map((l) => l.id));
  const thisDelivery = new Map<number, number>();
  const remaining = (l: (typeof poLines)[number]) => l.qty - (already.get(l.id) ?? 0) - (thisDelivery.get(l.id) ?? 0);

  const [receipt] = await tx
    .insert(goodsReceipts)
    .values({
      pharmacyId: ctx.pharmacyId,
      purchaseOrderId: input.purchaseOrderId,
      receiptNo: await nextDailyNumber(tx, ctx.pharmacyId, "GR", now),
      supplierInvoiceNo: input.supplierInvoiceNo.trim(),
      grandTotal: "0",
      note: input.note || null,
      createdBy: ctx.userId,
    })
    .returning({ id: goodsReceipts.id, receiptNo: goodsReceipts.receiptNo });

  let grandTotal = new Decimal(0);
  for (const line of input.lines) {
    if (!line.batchNo.trim()) throw new PurchasingError("Batch number is required", line.purchaseOrderLineId ?? undefined);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(line.expiryDate)) throw new PurchasingError("Expiry date is required", line.purchaseOrderLineId ?? undefined);
    if (line.expiryDate <= today) throw new PurchasingError(`Batch ${line.batchNo} is already expired or expires today`, line.purchaseOrderLineId ?? undefined);

    // Which ordered line does this delivery belong to?
    let target: (typeof poLines)[number] | undefined;
    if (line.purchaseOrderLineId) {
      target = poLines.find((l) => l.id === line.purchaseOrderLineId);
      if (!target) throw new PurchasingError("That item is not on this purchase order");
    } else if (line.productId && line.unitId) {
      target = poLines.find((l) => l.productId === line.productId && l.unitId === line.unitId && remaining(l) > 0);
    } else {
      throw new PurchasingError("Product and unit are required for an item that is not on the order");
    }
    const productId = target?.productId ?? line.productId!;
    const unitId = target?.unitId ?? line.unitId!;

    if (target) {
      const left = remaining(target);
      if (line.qty > left) {
        throw new PurchasingError(
          `${target.name}: ${target.qty} ordered, ${already.get(target.id) ?? 0} already received, so only ${Math.max(left, 0)} can still be received (you entered ${line.qty}). Raise the ordered quantity first if more was delivered.`,
          target.id,
        );
      }
      thisDelivery.set(target.id, (thisDelivery.get(target.id) ?? 0) + line.qty);
    }

    const unitFactor = await resolveUnitFactor(tx, ctx.pharmacyId, productId, unitId);
    const qtyBase = toBaseQty(line.qty, unitFactor);
    const price = new Decimal(line.unitPrice);
    const discount = new Decimal(line.discountPct || "0");
    if (price.isNegative() || discount.isNegative() || discount.greaterThan(100)) throw new PurchasingError("Invalid price or discount", target?.id);

    const gross = price.mul(line.qty);
    const lineTotal = gross.sub(percentOf(gross, discount));
    grandTotal = grandTotal.add(new Decimal(toMoney(lineTotal)));
    // Net cost per base unit goes on the batch (for profit later).
    const batchUnitCost = toMoney(price.sub(percentOf(price, discount)).div(unitFactor));

    const batchId = await addToBatch(tx, ctx, { productId, batchNo: line.batchNo.trim(), expiryDate: line.expiryDate, unitCost: batchUnitCost, qtyBase }, target?.id);

    await tx.insert(goodsReceiptLines).values({
      pharmacyId: ctx.pharmacyId,
      goodsReceiptId: receipt.id,
      purchaseOrderLineId: target?.id ?? null,
      productId,
      batchId,
      unitId,
      unitFactor,
      qty: line.qty,
      qtyBase,
      unitPrice: toMoney(price),
      discountPct: discount.toFixed(2),
      lineTotal: toMoney(lineTotal),
      createdBy: ctx.userId,
    });
    await tx.insert(stockMovements).values({ pharmacyId: ctx.pharmacyId, productId, batchId, type: "goods_receipt", qtyChange: qtyBase, documentId: receipt.id, createdBy: ctx.userId });

    // Legacy rule: the product's base cost only goes up. Compared on the invoice price before discount, per base unit.
    await raiseBaseCostIfHigher(tx, ctx, markupPct, productId, price.div(unitFactor));
  }

  await tx.update(goodsReceipts).set({ grandTotal: toMoney(grandTotal) }).where(and(eq(goodsReceipts.pharmacyId, ctx.pharmacyId), eq(goodsReceipts.id, receipt.id)));
  const status = await syncStatus(tx, ctx, input.purchaseOrderId);
  return { receiptId: receipt.id, receiptNo: receipt.receiptNo!, grandTotal: toMoney(grandTotal), status };
}

async function addToBatch(tx: Tx, ctx: Ctx, input: { productId: number; batchNo: string; expiryDate: string; unitCost: string; qtyBase: number }, lineId?: number): Promise<number> {
  const [existing] = await tx
    .select({ id: productBatches.id, expiryDate: productBatches.expiryDate })
    .from(productBatches)
    .where(and(eq(productBatches.pharmacyId, ctx.pharmacyId), eq(productBatches.productId, input.productId), eq(productBatches.batchNo, input.batchNo)));

  if (!existing) {
    const [created] = await tx
      .insert(productBatches)
      .values({ pharmacyId: ctx.pharmacyId, productId: input.productId, batchNo: input.batchNo, expiryDate: input.expiryDate, unitCost: input.unitCost, qtyOnHand: input.qtyBase, createdBy: ctx.userId })
      .returning({ id: productBatches.id });
    return created.id;
  }
  // The same batch number must carry the same expiry date (a LEGACY batch without expiry cannot be extended here).
  if (existing.expiryDate !== input.expiryDate) throw new PurchasingError(`Batch ${input.batchNo} already exists with a different expiry date`, lineId);
  await tx
    .update(productBatches)
    .set({ qtyOnHand: sql`${productBatches.qtyOnHand} + ${input.qtyBase}`, updatedAt: new Date(), updatedBy: ctx.userId })
    .where(and(eq(productBatches.pharmacyId, ctx.pharmacyId), eq(productBatches.id, existing.id)));
  return existing.id;
}

async function raiseBaseCostIfHigher(tx: Tx, ctx: Ctx, markupPct: string, productId: number, receivedCostPerBaseUnit: Decimal) {
  const [product] = await tx
    .select({ baseCost: products.baseCost, marginPct: products.marginPct })
    .from(products)
    .where(and(eq(products.pharmacyId, ctx.pharmacyId), eq(products.id, productId)));
  const next = nextBaseCostAfterReceipt(product.baseCost, receivedCostPerBaseUnit);
  if (new Decimal(next).equals(product.baseCost)) return;
  const { buyPrice, recommendedPrice } = computeProductPrices({ baseCost: next, markupPct, marginPct: product.marginPct });
  await tx
    .update(products)
    .set({ baseCost: next, buyPrice, recommendedPrice, updatedAt: new Date(), updatedBy: ctx.userId })
    .where(and(eq(products.pharmacyId, ctx.pharmacyId), eq(products.id, productId)));
}
