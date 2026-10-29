import Decimal from "decimal.js";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { adjustmentReasons, productBatches, products, stockAdjustments, stockMovements, stockOpnameLines, stockOpnames } from "@/db/schema";
import { nextDailyNumber } from "./counters";
import { toMoney } from "./money";

export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

type Ctx = { pharmacyId: number; userId: number };

// Batches with their product, for pickers and counting sheets.
export async function listBatches(tx: Tx, pharmacyId: number, productId?: number) {
  return tx
    .select({ id: productBatches.id, productId: productBatches.productId, productName: products.name, productCode: products.code, batchNo: productBatches.batchNo, expiryDate: productBatches.expiryDate, qtyOnHand: productBatches.qtyOnHand, unitCost: productBatches.unitCost })
    .from(productBatches)
    .innerJoin(products, and(eq(products.pharmacyId, productBatches.pharmacyId), eq(products.id, productBatches.productId)))
    .where(and(eq(productBatches.pharmacyId, pharmacyId), productId ? eq(productBatches.productId, productId) : undefined))
    .orderBy(asc(products.name), sql`${productBatches.expiryDate} asc nulls last`, asc(productBatches.id))
    .limit(2000);
}

// Moves one batch by a signed amount; refuses to go below zero. Writes the ledger row.
async function moveBatch(tx: Tx, ctx: Ctx, batchId: number, change: number, type: "adjustment" | "stock_opname", documentId: number) {
  const [row] = await tx
    .update(productBatches)
    .set({ qtyOnHand: sql`${productBatches.qtyOnHand} + ${change}`, updatedAt: new Date(), updatedBy: ctx.userId })
    .where(and(eq(productBatches.pharmacyId, ctx.pharmacyId), eq(productBatches.id, batchId), sql`${productBatches.qtyOnHand} + ${change} >= 0`))
    .returning({ productId: productBatches.productId });
  if (!row) throw new InventoryError("Stock cannot go below zero (the batch has less than that, or it does not exist)");
  await tx.insert(stockMovements).values({ pharmacyId: ctx.pharmacyId, productId: row.productId, batchId, type, qtyChange: change, documentId, createdBy: ctx.userId });
}

// --- Stock adjustments -----------------------------------------------------------

export async function createAdjustment(tx: Tx, ctx: Ctx, input: { batchId: number; reasonId: number; qtyChange: number; note?: string | null }) {
  if (!Number.isInteger(input.qtyChange) || input.qtyChange === 0 || Math.abs(input.qtyChange) > 2_000_000_000) throw new InventoryError("Enter a whole number other than 0 (negative to remove stock)");
  const [adjustment] = await tx
    .insert(stockAdjustments)
    .values({ pharmacyId: ctx.pharmacyId, batchId: input.batchId, reasonId: input.reasonId, qtyChange: input.qtyChange, note: input.note?.trim() || null, createdBy: ctx.userId })
    .returning({ id: stockAdjustments.id });
  await moveBatch(tx, ctx, input.batchId, input.qtyChange, "adjustment", adjustment.id);
  return adjustment.id;
}

export async function listAdjustments(tx: Tx, pharmacyId: number) {
  return tx
    .select({ id: stockAdjustments.id, productName: products.name, batchNo: productBatches.batchNo, reason: adjustmentReasons.name, qtyChange: stockAdjustments.qtyChange, note: stockAdjustments.note, createdAt: stockAdjustments.createdAt })
    .from(stockAdjustments)
    .innerJoin(productBatches, and(eq(productBatches.pharmacyId, stockAdjustments.pharmacyId), eq(productBatches.id, stockAdjustments.batchId)))
    .innerJoin(products, and(eq(products.pharmacyId, productBatches.pharmacyId), eq(products.id, productBatches.productId)))
    .innerJoin(adjustmentReasons, and(eq(adjustmentReasons.pharmacyId, stockAdjustments.pharmacyId), eq(adjustmentReasons.id, stockAdjustments.reasonId)))
    .where(eq(stockAdjustments.pharmacyId, pharmacyId))
    .orderBy(desc(stockAdjustments.id))
    .limit(100);
}

// --- Stock opname (physical count) -----------------------------------------------

export async function createOpname(tx: Tx, ctx: Ctx, note?: string | null, now = new Date()) {
  const opnameNo = await nextDailyNumber(tx, ctx.pharmacyId, "SO", now);
  const [row] = await tx.insert(stockOpnames).values({ pharmacyId: ctx.pharmacyId, opnameNo, note: note?.trim() || null, createdBy: ctx.userId }).returning({ id: stockOpnames.id });
  return { id: row.id, opnameNo };
}

async function requirePendingOpname(tx: Tx, pharmacyId: number, opnameId: number) {
  const [o] = await tx.select({ status: stockOpnames.status }).from(stockOpnames).where(and(eq(stockOpnames.pharmacyId, pharmacyId), eq(stockOpnames.id, opnameId)));
  if (!o) throw new InventoryError("Stock opname not found");
  if (o.status !== "pending") throw new InventoryError("This stock opname is already committed");
}

// Adds every batch of the product to the count sheet, with the counted quantity starting at the system quantity.
export async function addProductToOpname(tx: Tx, ctx: Ctx, opnameId: number, productId: number) {
  await requirePendingOpname(tx, ctx.pharmacyId, opnameId);
  const batches = await listBatches(tx, ctx.pharmacyId, productId);
  if (batches.length === 0) throw new InventoryError("This product has no batches to count yet");
  for (const b of batches) {
    await tx
      .insert(stockOpnameLines)
      .values({ pharmacyId: ctx.pharmacyId, stockOpnameId: opnameId, batchId: b.id, systemQtyBase: b.qtyOnHand, physicalQtyBase: b.qtyOnHand, unitCost: b.unitCost, differenceValue: "0", createdBy: ctx.userId })
      .onConflictDoNothing();
  }
}

// Saves the counted quantities. The system quantity is re-read at this moment, so the difference reflects the
// stock as it was when the count was entered.
export async function saveOpnameCounts(tx: Tx, ctx: Ctx, opnameId: number, counts: { lineId: number; physicalQty: number }[]) {
  await requirePendingOpname(tx, ctx.pharmacyId, opnameId);
  for (const c of counts) {
    if (!Number.isInteger(c.physicalQty) || c.physicalQty < 0) throw new InventoryError("Counted quantities must be whole numbers, 0 or more");
    const [line] = await tx
      .select({ batchId: stockOpnameLines.batchId, unitCost: stockOpnameLines.unitCost })
      .from(stockOpnameLines)
      .where(and(eq(stockOpnameLines.pharmacyId, ctx.pharmacyId), eq(stockOpnameLines.stockOpnameId, opnameId), eq(stockOpnameLines.id, c.lineId)));
    if (!line) throw new InventoryError("Line does not belong to this stock opname");
    const [batch] = await tx.select({ qty: productBatches.qtyOnHand }).from(productBatches).where(and(eq(productBatches.pharmacyId, ctx.pharmacyId), eq(productBatches.id, line.batchId)));
    const difference = new Decimal(toMoney(new Decimal(line.unitCost).mul(c.physicalQty - batch.qty)));
    await tx
      .update(stockOpnameLines)
      .set({ systemQtyBase: batch.qty, physicalQtyBase: c.physicalQty, differenceValue: difference.toFixed(2), updatedAt: new Date(), updatedBy: ctx.userId })
      .where(and(eq(stockOpnameLines.pharmacyId, ctx.pharmacyId), eq(stockOpnameLines.id, c.lineId)));
  }
}

export async function removeOpnameLine(tx: Tx, pharmacyId: number, opnameId: number, lineId: number) {
  await requirePendingOpname(tx, pharmacyId, opnameId);
  await tx.delete(stockOpnameLines).where(and(eq(stockOpnameLines.pharmacyId, pharmacyId), eq(stockOpnameLines.stockOpnameId, opnameId), eq(stockOpnameLines.id, lineId)));
}

export async function listOpnames(tx: Tx, pharmacyId: number) {
  return tx
    .select({ id: stockOpnames.id, opnameNo: stockOpnames.opnameNo, status: stockOpnames.status, totalDifferenceValue: stockOpnames.totalDifferenceValue, note: stockOpnames.note, createdAt: stockOpnames.createdAt })
    .from(stockOpnames)
    .where(eq(stockOpnames.pharmacyId, pharmacyId))
    .orderBy(desc(stockOpnames.id))
    .limit(100);
}

export async function getOpname(tx: Tx, pharmacyId: number, opnameId: number) {
  const [opname] = await tx.select().from(stockOpnames).where(and(eq(stockOpnames.pharmacyId, pharmacyId), eq(stockOpnames.id, opnameId)));
  if (!opname) return null;
  const lines = await tx
    .select({
      id: stockOpnameLines.id,
      productName: products.name,
      batchNo: productBatches.batchNo,
      expiryDate: productBatches.expiryDate,
      systemQty: stockOpnameLines.systemQtyBase,
      physicalQty: stockOpnameLines.physicalQtyBase,
      differenceValue: stockOpnameLines.differenceValue,
    })
    .from(stockOpnameLines)
    .innerJoin(productBatches, and(eq(productBatches.pharmacyId, stockOpnameLines.pharmacyId), eq(productBatches.id, stockOpnameLines.batchId)))
    .innerJoin(products, and(eq(products.pharmacyId, productBatches.pharmacyId), eq(products.id, productBatches.productId)))
    .where(and(eq(stockOpnameLines.pharmacyId, pharmacyId), eq(stockOpnameLines.stockOpnameId, opnameId)))
    .orderBy(asc(products.name), asc(stockOpnameLines.id));
  return { ...opname, lines };
}

// Applies each line's difference (counted − system at count time) to the CURRENT batch quantity, so sales made
// between counting and committing are kept (the legacy app overwrote stock with the counted number and lost them).
// All or nothing: if any batch would go below zero, nothing is applied and the lines must be recounted.
export async function commitOpname(tx: Tx, ctx: Ctx, opnameId: number, now = new Date()) {
  const locked = (await tx.execute(sql`select status from stock_opnames where pharmacy_id = ${ctx.pharmacyId} and id = ${opnameId} for update`)).rows as { status: string }[];
  if (locked.length === 0) throw new InventoryError("Stock opname not found");
  if (locked[0].status !== "pending") throw new InventoryError("This stock opname is already committed");

  const lines = await tx
    .select({ batchId: stockOpnameLines.batchId, system: stockOpnameLines.systemQtyBase, physical: stockOpnameLines.physicalQtyBase, differenceValue: stockOpnameLines.differenceValue })
    .from(stockOpnameLines)
    .where(and(eq(stockOpnameLines.pharmacyId, ctx.pharmacyId), eq(stockOpnameLines.stockOpnameId, opnameId)))
    .orderBy(asc(stockOpnameLines.batchId)); // fixed order: no deadlocks between concurrent commits
  if (lines.length === 0) throw new InventoryError("Add at least one product to count");

  let total = new Decimal(0);
  for (const l of lines) {
    total = total.add(l.differenceValue);
    const delta = l.physical - l.system;
    if (delta === 0) continue;
    try {
      await moveBatch(tx, ctx, l.batchId, delta, "stock_opname", opnameId);
    } catch (error) {
      if (error instanceof InventoryError) throw new InventoryError("Stock changed since counting and the difference no longer fits. Recount the batches and save again.");
      throw error;
    }
  }
  await tx
    .update(stockOpnames)
    .set({ status: "committed", totalDifferenceValue: toMoney(total), committedAt: now, committedBy: ctx.userId, updatedAt: now, updatedBy: ctx.userId })
    .where(and(eq(stockOpnames.pharmacyId, ctx.pharmacyId), eq(stockOpnames.id, opnameId)));
  return { totalDifferenceValue: toMoney(total) };
}
