import Decimal from "decimal.js";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { customers, payables, receivables, suppliers } from "@/db/schema";
import { toMoney } from "./money";

export class DebtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DebtError";
  }
}

type Ctx = { pharmacyId: number; userId: number };

// Legacy parity: payables (we owe a supplier) and receivables (a customer owes us) are manual records, not linked
// to purchase or sales documents. New: a payment can never exceed what is still owed.
export type DebtKind = "payables" | "receivables";

export function isDebtKind(value: string): value is DebtKind {
  return value === "payables" || value === "receivables";
}

export async function createDebt(tx: Tx, ctx: Ctx, kind: DebtKind, input: { partyId: number; amount: string; note?: string | null }) {
  const amount = new Decimal(input.amount);
  if (!amount.greaterThan(0)) throw new DebtError("Amount must be above 0");
  if (kind === "payables") {
    await tx.insert(payables).values({ pharmacyId: ctx.pharmacyId, supplierId: input.partyId, amount: toMoney(amount), note: input.note?.trim() || null, createdBy: ctx.userId });
  } else {
    await tx.insert(receivables).values({ pharmacyId: ctx.pharmacyId, customerId: input.partyId, amount: toMoney(amount), note: input.note?.trim() || null, createdBy: ctx.userId });
  }
}

export async function recordDebtPayment(tx: Tx, ctx: Ctx, kind: DebtKind, debtId: number, paymentAmount: string) {
  const payment = new Decimal(paymentAmount);
  if (!payment.greaterThan(0)) throw new DebtError("Payment must be above 0");
  const table = kind === "payables" ? payables : receivables;
  // Atomic: only succeeds while the payment still fits in what is owed.
  const updated = await tx
    .update(table)
    .set({ paidAmount: sql`${table.paidAmount} + ${toMoney(payment)}::numeric`, updatedAt: new Date(), updatedBy: ctx.userId })
    .where(and(eq(table.pharmacyId, ctx.pharmacyId), eq(table.id, debtId), sql`${table.paidAmount} + ${toMoney(payment)}::numeric <= ${table.amount}`))
    .returning({ id: table.id });
  if (updated.length === 0) throw new DebtError("Payment is more than what is still owed (or the record does not exist)");
}

export async function listDebts(tx: Tx, pharmacyId: number, kind: DebtKind) {
  const rows =
    kind === "payables"
      ? await tx
          .select({ id: payables.id, partyName: suppliers.name, amount: payables.amount, paidAmount: payables.paidAmount, note: payables.note, createdAt: payables.createdAt })
          .from(payables)
          .innerJoin(suppliers, and(eq(suppliers.pharmacyId, payables.pharmacyId), eq(suppliers.id, payables.supplierId)))
          .where(eq(payables.pharmacyId, pharmacyId))
          .orderBy(desc(payables.id))
          .limit(300)
      : await tx
          .select({ id: receivables.id, partyName: customers.name, amount: receivables.amount, paidAmount: receivables.paidAmount, note: receivables.note, createdAt: receivables.createdAt })
          .from(receivables)
          .innerJoin(customers, and(eq(customers.pharmacyId, receivables.pharmacyId), eq(customers.id, receivables.customerId)))
          .where(eq(receivables.pharmacyId, pharmacyId))
          .orderBy(desc(receivables.id))
          .limit(300);
  return rows.map((r) => ({ ...r, outstanding: toMoney(new Decimal(r.amount).sub(r.paidAmount)) }));
}

export async function totalOutstanding(tx: Tx, pharmacyId: number, kind: DebtKind): Promise<string> {
  const table = kind === "payables" ? payables : receivables;
  const [row] = await tx.select({ total: sql<string>`coalesce(sum(${table.amount} - ${table.paidAmount}), 0)::text` }).from(table).where(eq(table.pharmacyId, pharmacyId));
  return toMoney(row.total);
}

