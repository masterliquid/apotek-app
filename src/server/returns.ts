import Decimal from "decimal.js";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import {
  goodsReceiptLines, goodsReceipts, productBatches, products, purchaseOrders, purchaseReturnLines, purchaseReturns, saleLineAllocations, saleLines, sales, salesReturnLines, salesReturns,
  stockMovements, units,
} from "@/db/schema";
import { nextDailyNumber } from "./counters";
import { toMoney } from "./money";
import { toBaseQty } from "./units";

export class ReturnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReturnError";
  }
}

type Ctx = { pharmacyId: number; userId: number };
export type ReturnItem = { lineId: number; qty: number }; // qty is in the unit of the original line

// Merges duplicate lines and drops zero quantities.
function normalizeItems(items: ReturnItem[]): ReturnItem[] {
  const merged = new Map<number, number>();
  for (const { lineId, qty } of items) {
    if (!Number.isInteger(qty) || qty < 0) throw new ReturnError("Quantities must be whole numbers");
    if (qty > 0) merged.set(lineId, (merged.get(lineId) ?? 0) + qty);
  }
  if (merged.size === 0) throw new ReturnError("Enter a quantity to return");
  return [...merged].map(([lineId, qty]) => ({ lineId, qty }));
}

// Refund for the first `returnedBase` units of a line, rounded once. Refunds of several partial returns are the
// difference of two cumulative amounts, so they add up to exactly the line total when everything is returned.
function cumulativeRefund(lineTotal: Decimal.Value, lineQtyBase: number, returnedBase: number): Decimal {
  return new Decimal(toMoney(new Decimal(lineTotal).mul(returnedBase).div(lineQtyBase)));
}

// --- Sales returns ---------------------------------------------------------------

export async function findCommittedSaleByReceipt(tx: Tx, pharmacyId: number, receiptNo: string) {
  const [sale] = await tx
    .select({ id: sales.id, receiptNo: sales.receiptNo, customerName: sales.customerName, grandTotal: sales.grandTotal, committedAt: sales.committedAt })
    .from(sales)
    .where(and(eq(sales.pharmacyId, pharmacyId), eq(sales.receiptNo, receiptNo.trim()), eq(sales.status, "committed")));
  return sale ?? null;
}

async function returnedBaseByLine(tx: Tx, pharmacyId: number, lineIds: number[]): Promise<Map<number, number>> {
  if (lineIds.length === 0) return new Map();
  const rows = await tx
    .select({ lineId: saleLineAllocations.saleLineId, qty: sql<number>`sum(${salesReturnLines.qtyBase})::int` })
    .from(salesReturnLines)
    .innerJoin(saleLineAllocations, and(eq(saleLineAllocations.pharmacyId, salesReturnLines.pharmacyId), eq(saleLineAllocations.id, salesReturnLines.saleLineAllocationId)))
    .where(and(eq(salesReturnLines.pharmacyId, pharmacyId), inArray(saleLineAllocations.saleLineId, lineIds)))
    .groupBy(saleLineAllocations.saleLineId);
  return new Map(rows.map((r) => [r.lineId, r.qty]));
}

export async function getReturnableSaleLines(tx: Tx, pharmacyId: number, saleId: number) {
  const lines = await tx
    .select({ id: saleLines.id, productName: products.name, unitName: units.name, unitFactor: saleLines.unitFactor, qty: saleLines.qty, qtyBase: saleLines.qtyBase, unitPrice: saleLines.unitPrice, discountPct: saleLines.discountPct, lineTotal: saleLines.lineTotal })
    .from(saleLines)
    .innerJoin(products, and(eq(products.pharmacyId, saleLines.pharmacyId), eq(products.id, saleLines.productId)))
    .innerJoin(units, and(eq(units.pharmacyId, saleLines.pharmacyId), eq(units.id, saleLines.unitId)))
    .where(and(eq(saleLines.pharmacyId, pharmacyId), eq(saleLines.saleId, saleId)))
    .orderBy(asc(saleLines.id));
  const returned = await returnedBaseByLine(tx, pharmacyId, lines.map((l) => l.id));
  return lines.map((l) => {
    const returnedBase = returned.get(l.id) ?? 0;
    return { ...l, returnedQty: returnedBase / l.unitFactor, returnableQty: (l.qtyBase - returnedBase) / l.unitFactor };
  });
}

// A return is its own document; the original sale, its receipt and its date are never changed. Stock goes back to
// the same batches the goods came from. The sale row is locked, so two returns of one sale cannot both pass the
// "not more than sold" check.
export async function createSalesReturn(tx: Tx, ctx: Ctx, input: { saleId: number; reason?: string | null; items: ReturnItem[] }, now = new Date()) {
  const items = normalizeItems(input.items);

  const locked = (await tx.execute(sql`select status from sales where pharmacy_id = ${ctx.pharmacyId} and id = ${input.saleId} for update`)).rows as { status: string }[];
  if (locked.length === 0) throw new ReturnError("Sale not found");
  if (locked[0].status !== "committed") throw new ReturnError("Only completed sales can be returned");

  const returnNo = await nextDailyNumber(tx, ctx.pharmacyId, "SR", now);
  const [header] = await tx
    .insert(salesReturns)
    .values({ pharmacyId: ctx.pharmacyId, returnNo, saleId: input.saleId, reason: input.reason?.trim() || null, totalRefund: "0", createdBy: ctx.userId })
    .returning({ id: salesReturns.id });

  let totalRefund = new Decimal(0);
  for (const item of items) {
    const [line] = await tx
      .select({ id: saleLines.id, unitFactor: saleLines.unitFactor, qtyBase: saleLines.qtyBase, lineTotal: saleLines.lineTotal })
      .from(saleLines)
      .where(and(eq(saleLines.pharmacyId, ctx.pharmacyId), eq(saleLines.saleId, input.saleId), eq(saleLines.id, item.lineId)));
    if (!line) throw new ReturnError("Line does not belong to this sale");

    const returnedBefore = (await returnedBaseByLine(tx, ctx.pharmacyId, [line.id])).get(line.id) ?? 0;
    const qtyBase = toBaseQty(item.qty, line.unitFactor);
    if (qtyBase > line.qtyBase - returnedBefore) throw new ReturnError(`Cannot return more than was sold (${(line.qtyBase - returnedBefore) / line.unitFactor} left to return)`);

    const itemRefund = cumulativeRefund(line.lineTotal, line.qtyBase, returnedBefore + qtyBase).sub(cumulativeRefund(line.lineTotal, line.qtyBase, returnedBefore));
    totalRefund = totalRefund.add(itemRefund);

    // Put the goods back into the batches they were taken from, oldest allocation first.
    const allocations = await tx
      .select({ id: saleLineAllocations.id, batchId: saleLineAllocations.batchId, qtyBase: saleLineAllocations.qtyBase })
      .from(saleLineAllocations)
      .where(and(eq(saleLineAllocations.pharmacyId, ctx.pharmacyId), eq(saleLineAllocations.saleLineId, line.id)))
      .orderBy(asc(saleLineAllocations.id));
    const returnedPerAllocation = new Map(
      (
        await tx
          .select({ id: salesReturnLines.saleLineAllocationId, qty: sql<number>`sum(${salesReturnLines.qtyBase})::int` })
          .from(salesReturnLines)
          .where(and(eq(salesReturnLines.pharmacyId, ctx.pharmacyId), inArray(salesReturnLines.saleLineAllocationId, allocations.map((a) => a.id))))
          .groupBy(salesReturnLines.saleLineAllocationId)
      ).map((r) => [r.id, r.qty]),
    );

    let remaining = qtyBase;
    let assigned = 0;
    for (const alloc of allocations) {
      if (remaining === 0) break;
      const take = Math.min(remaining, alloc.qtyBase - (returnedPerAllocation.get(alloc.id) ?? 0));
      if (take <= 0) continue;
      assigned += take;
      const refund = itemRefund.mul(assigned).div(qtyBase);
      const previous = itemRefund.mul(assigned - take).div(qtyBase);
      await tx.update(productBatches).set({ qtyOnHand: sql`${productBatches.qtyOnHand} + ${take}`, updatedAt: now, updatedBy: ctx.userId }).where(and(eq(productBatches.pharmacyId, ctx.pharmacyId), eq(productBatches.id, alloc.batchId)));
      await tx.insert(salesReturnLines).values({ pharmacyId: ctx.pharmacyId, salesReturnId: header.id, saleLineAllocationId: alloc.id, qtyBase: take, refundAmount: toMoney(new Decimal(toMoney(refund)).sub(toMoney(previous))) });
      const [batch] = await tx.select({ productId: productBatches.productId }).from(productBatches).where(and(eq(productBatches.pharmacyId, ctx.pharmacyId), eq(productBatches.id, alloc.batchId)));
      await tx.insert(stockMovements).values({ pharmacyId: ctx.pharmacyId, productId: batch.productId, batchId: alloc.batchId, type: "sales_return", qtyChange: take, documentId: header.id, createdBy: ctx.userId });
      remaining -= take;
    }
    if (remaining > 0) throw new ReturnError("Stock allocation for this line is incomplete (imported data?)");
  }

  await tx.update(salesReturns).set({ totalRefund: toMoney(totalRefund) }).where(and(eq(salesReturns.pharmacyId, ctx.pharmacyId), eq(salesReturns.id, header.id)));
  return { returnId: header.id, returnNo, totalRefund: toMoney(totalRefund) };
}

export async function listSalesReturns(tx: Tx, pharmacyId: number) {
  return tx
    .select({ id: salesReturns.id, returnNo: salesReturns.returnNo, receiptNo: sales.receiptNo, totalRefund: salesReturns.totalRefund, reason: salesReturns.reason, createdAt: salesReturns.createdAt })
    .from(salesReturns)
    .innerJoin(sales, and(eq(sales.pharmacyId, salesReturns.pharmacyId), eq(sales.id, salesReturns.saleId)))
    .where(eq(salesReturns.pharmacyId, pharmacyId))
    .orderBy(desc(salesReturns.id))
    .limit(100);
}

// --- Purchase returns ------------------------------------------------------------

export async function listGoodsReceipts(tx: Tx, pharmacyId: number) {
  return tx
    .select({ id: goodsReceipts.id, receiptNo: goodsReceipts.receiptNo, invoiceNo: goodsReceipts.supplierInvoiceNo, poNo: purchaseOrders.poNo, grandTotal: goodsReceipts.grandTotal, createdAt: goodsReceipts.createdAt })
    .from(goodsReceipts)
    .innerJoin(purchaseOrders, and(eq(purchaseOrders.pharmacyId, goodsReceipts.pharmacyId), eq(purchaseOrders.id, goodsReceipts.purchaseOrderId)))
    .where(eq(goodsReceipts.pharmacyId, pharmacyId))
    .orderBy(desc(goodsReceipts.id))
    .limit(100);
}

export async function getReturnableReceiptLines(tx: Tx, pharmacyId: number, goodsReceiptId: number) {
  const lines = await tx
    .select({ id: goodsReceiptLines.id, productName: products.name, unitName: units.name, unitFactor: goodsReceiptLines.unitFactor, qty: goodsReceiptLines.qty, qtyBase: goodsReceiptLines.qtyBase, batchId: goodsReceiptLines.batchId, batchNo: productBatches.batchNo, batchQty: productBatches.qtyOnHand })
    .from(goodsReceiptLines)
    .innerJoin(products, and(eq(products.pharmacyId, goodsReceiptLines.pharmacyId), eq(products.id, goodsReceiptLines.productId)))
    .innerJoin(units, and(eq(units.pharmacyId, goodsReceiptLines.pharmacyId), eq(units.id, goodsReceiptLines.unitId)))
    .innerJoin(productBatches, and(eq(productBatches.pharmacyId, goodsReceiptLines.pharmacyId), eq(productBatches.id, goodsReceiptLines.batchId)))
    .where(and(eq(goodsReceiptLines.pharmacyId, pharmacyId), eq(goodsReceiptLines.goodsReceiptId, goodsReceiptId)))
    .orderBy(asc(goodsReceiptLines.id));
  const returned = new Map(
    (
      lines.length === 0
        ? []
        : await tx
            .select({ id: purchaseReturnLines.goodsReceiptLineId, qty: sql<number>`sum(${purchaseReturnLines.qtyBase})::int` })
            .from(purchaseReturnLines)
            .where(and(eq(purchaseReturnLines.pharmacyId, pharmacyId), inArray(purchaseReturnLines.goodsReceiptLineId, lines.map((l) => l.id))))
            .groupBy(purchaseReturnLines.goodsReceiptLineId)
    ).map((r) => [r.id, r.qty]),
  );
  return lines.map((l) => {
    const returnedBase = returned.get(l.id) ?? 0;
    // Goods already sold cannot be sent back: limited by what the batch still holds.
    const returnableBase = Math.min(l.qtyBase - returnedBase, l.batchQty);
    return { ...l, returnedQty: returnedBase / l.unitFactor, returnableQty: Math.floor(returnableBase / l.unitFactor) };
  });
}

// Sends goods back to the supplier: stock leaves the same batch it arrived in, never below zero.
export async function createPurchaseReturn(tx: Tx, ctx: Ctx, input: { goodsReceiptId: number; reason?: string | null; items: ReturnItem[] }, now = new Date()) {
  const items = normalizeItems(input.items);
  const locked = (await tx.execute(sql`select id from goods_receipts where pharmacy_id = ${ctx.pharmacyId} and id = ${input.goodsReceiptId} for update`)).rows;
  if (locked.length === 0) throw new ReturnError("Goods receipt not found");

  const returnNo = await nextDailyNumber(tx, ctx.pharmacyId, "PR", now);
  const [header] = await tx
    .insert(purchaseReturns)
    .values({ pharmacyId: ctx.pharmacyId, returnNo, goodsReceiptId: input.goodsReceiptId, reason: input.reason?.trim() || null, createdBy: ctx.userId })
    .returning({ id: purchaseReturns.id });

  for (const item of items) {
    const [line] = await tx
      .select({ id: goodsReceiptLines.id, productId: goodsReceiptLines.productId, batchId: goodsReceiptLines.batchId, unitFactor: goodsReceiptLines.unitFactor, qtyBase: goodsReceiptLines.qtyBase })
      .from(goodsReceiptLines)
      .where(and(eq(goodsReceiptLines.pharmacyId, ctx.pharmacyId), eq(goodsReceiptLines.goodsReceiptId, input.goodsReceiptId), eq(goodsReceiptLines.id, item.lineId)));
    if (!line) throw new ReturnError("Line does not belong to this receipt");

    const [{ qty: returnedBefore }] = await tx
      .select({ qty: sql<number>`coalesce(sum(${purchaseReturnLines.qtyBase}), 0)::int` })
      .from(purchaseReturnLines)
      .where(and(eq(purchaseReturnLines.pharmacyId, ctx.pharmacyId), eq(purchaseReturnLines.goodsReceiptLineId, line.id)));
    const qtyBase = toBaseQty(item.qty, line.unitFactor);
    if (qtyBase > line.qtyBase - returnedBefore) throw new ReturnError("Cannot return more than was received");

    const updated = await tx
      .update(productBatches)
      .set({ qtyOnHand: sql`${productBatches.qtyOnHand} - ${qtyBase}`, updatedAt: now, updatedBy: ctx.userId })
      .where(and(eq(productBatches.pharmacyId, ctx.pharmacyId), eq(productBatches.id, line.batchId), sql`${productBatches.qtyOnHand} >= ${qtyBase}`))
      .returning({ id: productBatches.id });
    if (updated.length === 0) throw new ReturnError("Not enough of this batch is left in stock (part of it was already sold)");

    await tx.insert(purchaseReturnLines).values({ pharmacyId: ctx.pharmacyId, purchaseReturnId: header.id, goodsReceiptLineId: line.id, qtyBase });
    await tx.insert(stockMovements).values({ pharmacyId: ctx.pharmacyId, productId: line.productId, batchId: line.batchId, type: "purchase_return", qtyChange: -qtyBase, documentId: header.id, createdBy: ctx.userId });
  }
  return { returnId: header.id, returnNo };
}
