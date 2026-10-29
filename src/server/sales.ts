import Decimal from "decimal.js";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { paymentMethods, productBatches, products, productUnits, saleLineAllocations, saleLines, salePayments, sales, stockMovements, units } from "@/db/schema";
import { dayInPharmacyTime, nextDocumentNumber } from "./counters";
import { percentOf, toMoney } from "./money";
import { toBaseQty } from "./units";

export class SalesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesError";
  }
}

type Ctx = { pharmacyId: number; userId: number };

export type SaleLineInput = { productId: number; unitId: number; qty: number; discountPct: string };
export type SaleInput = { saleId?: number | null; customerName?: string | null; note?: string | null; lines: SaleLineInput[] };
// `confirmed` = the cashier saw the money arrive (cash in hand, transfer received, QRIS paid).
export type PaymentInput = { paymentMethodId: number; amount: string; referenceNo?: string | null; confirmed: boolean };

type PricedLine = SaleLineInput & { productName: string; unitFactor: number; qtyBase: number; unitPrice: string; gross: Decimal; lineTotal: Decimal };

// Prices always come from the database (product or pack-unit selling price); the browser never sends a price.
// This fixes a legacy weakness where line prices and totals were calculated in the browser and trusted.
async function priceLines(tx: Tx, ctx: Ctx, lines: SaleLineInput[]): Promise<PricedLine[]> {
  if (lines.length === 0) throw new SalesError("Add at least one item");
  const priced: PricedLine[] = [];
  for (const line of lines) {
    const discount = new Decimal(line.discountPct || "0");
    if (discount.isNegative() || discount.greaterThan(100)) throw new SalesError("Discount must be between 0 and 100%");

    const [product] = await tx
      .select({ name: products.name, sellPrice: products.sellPrice, baseUnitId: products.baseUnitId, isActive: products.isActive })
      .from(products)
      .where(and(eq(products.pharmacyId, ctx.pharmacyId), eq(products.id, line.productId)));
    if (!product) throw new SalesError("Product not found");
    if (!product.isActive) throw new SalesError(`${product.name} is not active`);

    let unitFactor = 1;
    let unitPrice = new Decimal(product.sellPrice);
    if (line.unitId !== product.baseUnitId) {
      const [pack] = await tx
        .select({ factor: productUnits.factor, sellPrice: productUnits.sellPrice })
        .from(productUnits)
        .where(and(eq(productUnits.pharmacyId, ctx.pharmacyId), eq(productUnits.productId, line.productId), eq(productUnits.unitId, line.unitId)));
      if (!pack) throw new SalesError(`${product.name}: that unit is not defined for this product`);
      unitFactor = pack.factor;
      unitPrice = pack.sellPrice ? new Decimal(pack.sellPrice) : unitPrice.mul(pack.factor);
    }

    const qtyBase = toBaseQty(line.qty, unitFactor);
    const gross = unitPrice.mul(line.qty);
    const lineTotal = new Decimal(toMoney(gross.sub(percentOf(gross, discount))));
    priced.push({ ...line, discountPct: discount.toFixed(2), productName: product.name, unitFactor, qtyBase, unitPrice: toMoney(unitPrice), gross, lineTotal });
  }
  return priced;
}

function totalsOf(priced: PricedLine[]) {
  const subtotal = priced.reduce((sum, l) => sum.add(l.gross), new Decimal(0));
  const grandTotal = priced.reduce((sum, l) => sum.add(l.lineTotal), new Decimal(0));
  return { subtotal: new Decimal(toMoney(subtotal)), grandTotal, discountTotal: new Decimal(toMoney(subtotal)).sub(grandTotal) };
}

// Creates a pending sale, or replaces the lines of an existing pending one. Never touches stock.
async function writePendingSale(tx: Tx, ctx: Ctx, input: SaleInput, priced: PricedLine[]): Promise<{ saleId: number; lineIds: number[] }> {
  const totals = totalsOf(priced);
  const values = {
    customerName: input.customerName?.trim() || null,
    note: input.note?.trim() || null,
    subtotal: toMoney(totals.subtotal),
    discountTotal: toMoney(totals.discountTotal),
    grandTotal: toMoney(totals.grandTotal),
  };

  let saleId: number;
  if (input.saleId) {
    const [existing] = await tx.select({ status: sales.status }).from(sales).where(and(eq(sales.pharmacyId, ctx.pharmacyId), eq(sales.id, input.saleId)));
    if (!existing) throw new SalesError("Sale not found");
    if (existing.status !== "pending") throw new SalesError("Only a pending sale can be changed");
    await tx.update(sales).set({ ...values, updatedAt: new Date(), updatedBy: ctx.userId }).where(and(eq(sales.pharmacyId, ctx.pharmacyId), eq(sales.id, input.saleId)));
    await tx.delete(saleLines).where(and(eq(saleLines.pharmacyId, ctx.pharmacyId), eq(saleLines.saleId, input.saleId)));
    saleId = input.saleId;
  } else {
    const [created] = await tx.insert(sales).values({ pharmacyId: ctx.pharmacyId, ...values, createdBy: ctx.userId }).returning({ id: sales.id });
    saleId = created.id;
  }

  const lineIds: number[] = [];
  for (const l of priced) {
    const [row] = await tx
      .insert(saleLines)
      .values({ pharmacyId: ctx.pharmacyId, saleId, productId: l.productId, unitId: l.unitId, unitFactor: l.unitFactor, qty: l.qty, qtyBase: l.qtyBase, unitPrice: l.unitPrice, discountPct: l.discountPct, lineTotal: toMoney(l.lineTotal), createdBy: ctx.userId })
      .returning({ id: saleLines.id });
    lineIds.push(row.id);
  }
  return { saleId, lineIds };
}

export async function holdSale(tx: Tx, ctx: Ctx, input: SaleInput): Promise<number> {
  const priced = await priceLines(tx, ctx, input.lines);
  return (await writePendingSale(tx, ctx, input, priced)).saleId;
}

// A sale may only be committed when every payment is confirmed as received and the payments cover the total.
// Cash may exceed the total (the difference is change); non-cash may not.
async function checkPayments(tx: Tx, ctx: Ctx, grandTotal: Decimal, payments: PaymentInput[]) {
  if (payments.length === 0) throw new SalesError("Add a payment");
  let paid = new Decimal(0);
  let cash = new Decimal(0);
  for (const p of payments) {
    const amount = new Decimal(p.amount);
    if (!amount.greaterThan(0)) throw new SalesError("Payment amounts must be above 0");
    if (!p.confirmed) throw new SalesError("Confirm that every payment has been received before completing the sale");
    const [method] = await tx
      .select({ kind: paymentMethods.kind, isActive: paymentMethods.isActive })
      .from(paymentMethods)
      .where(and(eq(paymentMethods.pharmacyId, ctx.pharmacyId), eq(paymentMethods.id, p.paymentMethodId)));
    if (!method || !method.isActive) throw new SalesError("Payment method not available");
    paid = paid.add(amount);
    if (method.kind === "cash") cash = cash.add(amount);
  }
  if (paid.lessThan(grandTotal)) throw new SalesError(`Payment is short by ${toMoney(grandTotal.sub(paid))}`);
  const change = paid.sub(grandTotal);
  if (change.greaterThan(cash)) throw new SalesError("Non-cash payments cannot exceed the total");
  return { paid, change };
}

type BatchRow = { id: number; qty_on_hand: number; unit_cost: string };

// First-expiry-first-out. Rows are locked (FOR UPDATE), so two sales taking the same stock queue up and the
// second one sees the first one's result. Expired batches are never sold; batches without an expiry date
// (imported legacy stock) are sold last. The CHECK (qty_on_hand >= 0) constraint is the final backstop.
async function takeStockFefo(tx: Tx, ctx: Ctx, saleId: number, lineId: number, line: PricedLine, today: string) {
  const batches = (
    await tx.execute(sql`
      select id, qty_on_hand, unit_cost from product_batches
      where pharmacy_id = ${ctx.pharmacyId} and product_id = ${line.productId} and qty_on_hand > 0
        and (expiry_date is null or expiry_date > ${today})
      order by expiry_date asc nulls last, id asc
      for update`)
  ).rows as BatchRow[];

  const available = batches.reduce((sum, b) => sum + b.qty_on_hand, 0);
  if (available < line.qtyBase) throw new SalesError(`Not enough stock for ${line.productName}: needs ${line.qtyBase}, available ${available}`);

  let remaining = line.qtyBase;
  for (const batch of batches) {
    if (remaining === 0) break;
    const take = Math.min(remaining, batch.qty_on_hand);
    await tx
      .update(productBatches)
      .set({ qtyOnHand: sql`${productBatches.qtyOnHand} - ${take}`, updatedAt: new Date(), updatedBy: ctx.userId })
      .where(and(eq(productBatches.pharmacyId, ctx.pharmacyId), eq(productBatches.id, batch.id)));
    // Cost is remembered per allocation so profit reports use the cost at the time of sale.
    await tx.insert(saleLineAllocations).values({ pharmacyId: ctx.pharmacyId, saleLineId: lineId, batchId: batch.id, qtyBase: take, unitCost: batch.unit_cost });
    await tx.insert(stockMovements).values({ pharmacyId: ctx.pharmacyId, productId: line.productId, batchId: batch.id, type: "sale", qtyChange: -take, documentId: saleId, createdBy: ctx.userId });
    remaining -= take;
  }
}

// Receipt number keeps the legacy format: ddmmyyyy + 3-digit sequence for the day (e.g. 29102026001).
function receiptNumber(day: string, sequence: number): string {
  const [year, month, date] = day.split("-");
  return `${date}${month}${year}${String(sequence).padStart(3, "0")}`;
}

// Completes a sale in ONE transaction (the caller's): prices, stock, ledger, payments and receipt number
// are all saved, or nothing is. Works for a brand-new cart or a pending sale (input.saleId).
export async function commitSale(tx: Tx, ctx: Ctx, input: SaleInput, payments: PaymentInput[], now = new Date()) {
  const priced = await priceLines(tx, ctx, input.lines);
  const { grandTotal } = totalsOf(priced);
  const { paid, change } = await checkPayments(tx, ctx, grandTotal, payments);
  const day = dayInPharmacyTime(now);

  const { saleId, lineIds } = await writePendingSale(tx, ctx, input, priced);

  // Lock stock in a fixed product order so two sales with several products cannot deadlock each other.
  const order = priced.map((line, index) => ({ line, lineId: lineIds[index] })).sort((x, y) => x.line.productId - y.line.productId);
  for (const { line, lineId } of order) await takeStockFefo(tx, ctx, saleId, lineId, line, day);

  for (const p of payments) {
    await tx.insert(salePayments).values({
      pharmacyId: ctx.pharmacyId,
      saleId,
      paymentMethodId: p.paymentMethodId,
      amount: toMoney(p.amount),
      referenceNo: p.referenceNo?.trim() || null,
      status: "paid",
      confirmedAt: now,
      confirmedBy: ctx.userId,
      createdBy: ctx.userId,
    });
  }

  // Taken last: the counter row stays locked until commit, and a rolled-back sale does not burn a number.
  const receiptNo = receiptNumber(day, await nextDocumentNumber(tx, ctx.pharmacyId, "SALE", day));
  await tx
    .update(sales)
    .set({ status: "committed", receiptNo, paidTotal: toMoney(paid), changeAmount: toMoney(change), committedAt: now, committedBy: ctx.userId, updatedAt: now, updatedBy: ctx.userId })
    .where(and(eq(sales.pharmacyId, ctx.pharmacyId), eq(sales.id, saleId)));

  return { saleId, receiptNo, grandTotal: toMoney(grandTotal), changeAmount: toMoney(change) };
}

// Only pending sales can be voided (no stock was taken). Committed sales are corrected with a sales return.
export async function voidPendingSale(tx: Tx, ctx: Ctx, saleId: number, canVoidAny: boolean) {
  const [sale] = await tx.select({ status: sales.status, createdBy: sales.createdBy }).from(sales).where(and(eq(sales.pharmacyId, ctx.pharmacyId), eq(sales.id, saleId)));
  if (!sale) throw new SalesError("Sale not found");
  if (sale.status !== "pending") throw new SalesError("Only a pending sale can be voided; use a return for a completed sale");
  if (!canVoidAny && sale.createdBy !== ctx.userId) throw new SalesError("You can only void your own pending sales");
  await tx.update(sales).set({ status: "void", updatedAt: new Date(), updatedBy: ctx.userId }).where(and(eq(sales.pharmacyId, ctx.pharmacyId), eq(sales.id, saleId)));
}

export async function listSales(tx: Tx, pharmacyId: number, onlyCreatedBy?: number) {
  return tx
    .select({ id: sales.id, receiptNo: sales.receiptNo, status: sales.status, customerName: sales.customerName, grandTotal: sales.grandTotal, createdAt: sales.createdAt, committedAt: sales.committedAt })
    .from(sales)
    .where(and(eq(sales.pharmacyId, pharmacyId), onlyCreatedBy ? eq(sales.createdBy, onlyCreatedBy) : undefined))
    .orderBy(desc(sales.id))
    .limit(200);
}

export async function getSale(tx: Tx, pharmacyId: number, saleId: number) {
  const [sale] = await tx.select().from(sales).where(and(eq(sales.pharmacyId, pharmacyId), eq(sales.id, saleId)));
  if (!sale) return null;
  const lines = await tx
    .select({
      id: saleLines.id,
      productId: saleLines.productId,
      productName: products.name,
      unitId: saleLines.unitId,
      unitName: units.name,
      qty: saleLines.qty,
      unitPrice: saleLines.unitPrice,
      discountPct: saleLines.discountPct,
      lineTotal: saleLines.lineTotal,
    })
    .from(saleLines)
    .innerJoin(products, and(eq(products.pharmacyId, saleLines.pharmacyId), eq(products.id, saleLines.productId)))
    .innerJoin(units, and(eq(units.pharmacyId, saleLines.pharmacyId), eq(units.id, saleLines.unitId)))
    .where(and(eq(saleLines.pharmacyId, pharmacyId), eq(saleLines.saleId, saleId)))
    .orderBy(asc(saleLines.id));
  const payments = await tx
    .select({ method: paymentMethods.name, amount: salePayments.amount, referenceNo: salePayments.referenceNo })
    .from(salePayments)
    .innerJoin(paymentMethods, and(eq(paymentMethods.pharmacyId, salePayments.pharmacyId), eq(paymentMethods.id, salePayments.paymentMethodId)))
    .where(and(eq(salePayments.pharmacyId, pharmacyId), eq(salePayments.saleId, saleId)))
    .orderBy(asc(salePayments.id));
  return { ...sale, lines, payments };
}

export async function listPaymentMethods(tx: Tx, pharmacyId: number) {
  return tx
    .select({ id: paymentMethods.id, name: paymentMethods.name, kind: paymentMethods.kind })
    .from(paymentMethods)
    .where(and(eq(paymentMethods.pharmacyId, pharmacyId), eq(paymentMethods.isActive, true)))
    .orderBy(asc(paymentMethods.id));
}
