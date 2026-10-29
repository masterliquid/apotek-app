import Decimal from "decimal.js";
import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { paymentMethods, productBatches, products, salePayments, sales } from "@/db/schema";
import { dayInPharmacyTime } from "./counters";
import { addDays, type DateRange } from "./dates";
import { toMoney } from "./money";

// All reports read committed documents only. Sales are dated by when they were completed (committed_at, Jakarta
// time) and never move; returns are dated by their own date. (The legacy report used "last updated" as the sale date,
// so a later return moved the sale to another day.)

const JAKARTA_DAY = (column: string) => sql.raw(`to_char(${column} at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`);

export async function salesReport(tx: Tx, pharmacyId: number, range: DateRange, onlyUserId?: number) {
  const saleRows = await tx
    .select({ id: sales.id, receiptNo: sales.receiptNo, customerName: sales.customerName, grandTotal: sales.grandTotal, changeAmount: sales.changeAmount, committedAt: sales.committedAt })
    .from(sales)
    .where(and(eq(sales.pharmacyId, pharmacyId), eq(sales.status, "committed"), sql`${sales.committedAt} >= ${range.start}`, sql`${sales.committedAt} < ${range.endExclusive}`, onlyUserId ? eq(sales.committedBy, onlyUserId) : undefined))
    .orderBy(asc(sales.committedAt));

  const paymentRows = saleRows.length
    ? await tx
        .select({ saleId: salePayments.saleId, method: paymentMethods.name, kind: paymentMethods.kind, amount: salePayments.amount })
        .from(salePayments)
        .innerJoin(paymentMethods, and(eq(paymentMethods.pharmacyId, salePayments.pharmacyId), eq(paymentMethods.id, salePayments.paymentMethodId)))
        .innerJoin(sales, and(eq(sales.pharmacyId, salePayments.pharmacyId), eq(sales.id, salePayments.saleId)))
        .where(and(eq(salePayments.pharmacyId, pharmacyId), eq(sales.status, "committed"), sql`${sales.committedAt} >= ${range.start}`, sql`${sales.committedAt} < ${range.endExclusive}`, onlyUserId ? eq(sales.committedBy, onlyUserId) : undefined))
        .orderBy(asc(salePayments.id))
    : [];

  // Money actually kept per method: the change given back comes out of the cash payments.
  const byMethod = new Map<string, Decimal>();
  const paymentsOfSale = Map.groupBy(paymentRows, (p) => p.saleId);
  for (const sale of saleRows) {
    let change = new Decimal(sale.changeAmount);
    for (const p of paymentsOfSale.get(sale.id) ?? []) {
      let kept = new Decimal(p.amount);
      if (p.kind === "cash" && change.greaterThan(0)) {
        const take = Decimal.min(change, kept);
        kept = kept.sub(take);
        change = change.sub(take);
      }
      byMethod.set(p.method, (byMethod.get(p.method) ?? new Decimal(0)).add(kept));
    }
  }

  const [ret] = await tx.execute(sql`
    select coalesce(sum(total_refund), 0)::text as refunds from sales_returns
    where pharmacy_id = ${pharmacyId} and created_at >= ${range.start} and created_at < ${range.endExclusive}
      ${onlyUserId ? sql`and created_by = ${onlyUserId}` : sql``}`).then((r) => r.rows as { refunds: string }[]);

  const gross = saleRows.reduce((sum, s) => sum.add(s.grandTotal), new Decimal(0));
  return {
    count: saleRows.length,
    gross: toMoney(gross),
    refunds: toMoney(ret.refunds),
    net: toMoney(gross.sub(ret.refunds)),
    byMethod: [...byMethod].map(([method, amount]) => ({ method, amount: toMoney(amount) })),
    sales: saleRows,
  };
}

// Profit per day = (sales − refunds) − (cost of goods sold − cost of goods returned).
// Cost is the batch cost recorded when the sale was made, so later price changes do not rewrite history.
export async function profitReport(tx: Tx, pharmacyId: number, range: DateRange) {
  const saleDays = (
    await tx.execute(sql`
      select ${JAKARTA_DAY("s.committed_at")} as day, count(*)::int as sales, sum(s.grand_total)::text as revenue, coalesce(sum(c.cost), 0)::text as cost
      from sales s
      left join lateral (
        select sum(a.qty_base * a.unit_cost) as cost from sale_line_allocations a
        join sale_lines l on l.pharmacy_id = a.pharmacy_id and l.id = a.sale_line_id
        where l.pharmacy_id = s.pharmacy_id and l.sale_id = s.id) c on true
      where s.pharmacy_id = ${pharmacyId} and s.status = 'committed' and s.committed_at >= ${range.start} and s.committed_at < ${range.endExclusive}
      group by 1 order by 1`)
  ).rows as { day: string; sales: number; revenue: string; cost: string }[];

  const returnDays = (
    await tx.execute(sql`
      select ${JAKARTA_DAY("r.created_at")} as day, sum(r.total_refund)::text as refunds, coalesce(sum(c.cost), 0)::text as cost
      from sales_returns r
      left join lateral (
        select sum(rl.qty_base * a.unit_cost) as cost from sales_return_lines rl
        join sale_line_allocations a on a.pharmacy_id = rl.pharmacy_id and a.id = rl.sale_line_allocation_id
        where rl.pharmacy_id = r.pharmacy_id and rl.sales_return_id = r.id) c on true
      where r.pharmacy_id = ${pharmacyId} and r.created_at >= ${range.start} and r.created_at < ${range.endExclusive}
      group by 1 order by 1`)
  ).rows as { day: string; refunds: string; cost: string }[];

  const days = new Map<string, { sales: number; revenue: Decimal; cost: Decimal }>();
  const slot = (day: string) => days.get(day) ?? days.set(day, { sales: 0, revenue: new Decimal(0), cost: new Decimal(0) }).get(day)!;
  for (const d of saleDays) { const s = slot(d.day); s.sales = d.sales; s.revenue = s.revenue.add(d.revenue); s.cost = s.cost.add(d.cost); }
  for (const d of returnDays) { const s = slot(d.day); s.revenue = s.revenue.sub(d.refunds); s.cost = s.cost.sub(d.cost); }

  const rows = [...days].sort(([x], [y]) => x.localeCompare(y)).map(([day, v]) => ({ day, sales: v.sales, revenue: toMoney(v.revenue), cost: toMoney(v.cost), profit: toMoney(v.revenue.sub(v.cost)) }));
  const sum = (key: "revenue" | "cost" | "profit") => toMoney(rows.reduce((t, r) => t.add(r[key]), new Decimal(0)));
  return { rows, totals: { revenue: sum("revenue"), cost: sum("cost"), profit: sum("profit") } };
}

// Stock on hand per product, valued at batch cost (what the pharmacy paid) and at selling price.
export async function stockReport(tx: Tx, pharmacyId: number) {
  const rows = (
    await tx.execute(sql`
      select p.id, p.code, p.name, p.sell_price::text as sell_price, u.name as unit_name,
             coalesce(sum(b.qty_on_hand), 0)::int as stock,
             coalesce(sum(b.qty_on_hand * b.unit_cost), 0)::text as cost_value
      from products p
      join units u on u.pharmacy_id = p.pharmacy_id and u.id = p.base_unit_id
      left join product_batches b on b.pharmacy_id = p.pharmacy_id and b.product_id = p.id
      where p.pharmacy_id = ${pharmacyId} and p.is_active
      group by p.id, u.name order by p.name`)
  ).rows as { id: number; code: string; name: string; sell_price: string; unit_name: string; stock: number; cost_value: string }[];
  const withValues = rows.map((r) => ({ id: r.id, code: r.code, name: r.name, unitName: r.unit_name, stock: r.stock, costValue: toMoney(r.cost_value), sellValue: toMoney(new Decimal(r.sell_price).mul(r.stock)) }));
  return { rows: withValues, totalCost: toMoney(withValues.reduce((t, r) => t.add(r.costValue), new Decimal(0))), totalSell: toMoney(withValues.reduce((t, r) => t.add(r.sellValue), new Decimal(0))) };
}

// Batches with stock that are expired or expire within `withinDays` days. Batches without an expiry date
// (imported legacy stock) are not listed.
export async function expiryReport(tx: Tx, pharmacyId: number, withinDays: number, now = new Date()) {
  const today = dayInPharmacyTime(now);
  const rows = await tx
    .select({ batchId: productBatches.id, productName: products.name, productCode: products.code, batchNo: productBatches.batchNo, expiryDate: productBatches.expiryDate, qtyOnHand: productBatches.qtyOnHand })
    .from(productBatches)
    .innerJoin(products, and(eq(products.pharmacyId, productBatches.pharmacyId), eq(products.id, productBatches.productId)))
    .where(and(eq(productBatches.pharmacyId, pharmacyId), gt(productBatches.qtyOnHand, 0), lte(productBatches.expiryDate, addDays(today, withinDays))))
    .orderBy(asc(productBatches.expiryDate), asc(products.name));
  return rows.map((r) => ({ ...r, expired: r.expiryDate !== null && r.expiryDate <= today }));
}
