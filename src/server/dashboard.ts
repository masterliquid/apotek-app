import Decimal from "decimal.js";
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { sales } from "@/db/schema";
import { dayInPharmacyTime } from "./counters";
import { addDays, dayRange, todayRange } from "./dates";
import { toMoney } from "./money";
import { expiryReport, salesReport, stockReport } from "./reports";

const JAKARTA_DAY = (column: string) => sql.raw(`to_char(${column} at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`);

// Revenue per day after returns (sales dated by completion, returns by their own date), for the last `days` days.
export async function dailyRevenue(tx: Tx, pharmacyId: number, days: number, now = new Date()) {
  const today = dayInPharmacyTime(now);
  const from = addDays(today, -(days - 1));
  const range = dayRange(from, today);
  const salesByDay = (await tx.execute(sql`
    select ${JAKARTA_DAY("committed_at")} as day, sum(grand_total)::text as total from sales
    where pharmacy_id = ${pharmacyId} and status = 'committed' and committed_at >= ${range.start} and committed_at < ${range.endExclusive} group by 1`)).rows as { day: string; total: string }[];
  const refundsByDay = (await tx.execute(sql`
    select ${JAKARTA_DAY("created_at")} as day, sum(total_refund)::text as total from sales_returns
    where pharmacy_id = ${pharmacyId} and created_at >= ${range.start} and created_at < ${range.endExclusive} group by 1`)).rows as { day: string; total: string }[];
  const net = new Map<string, Decimal>();
  for (const r of salesByDay) net.set(r.day, new Decimal(r.total));
  for (const r of refundsByDay) net.set(r.day, (net.get(r.day) ?? new Decimal(0)).sub(r.total));
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(from, i);
    return { day, net: toMoney(net.get(day) ?? 0) };
  });
}

export async function pendingSalesCount(tx: Tx, pharmacyId: number, onlyUserId?: number): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(sales)
    .where(and(eq(sales.pharmacyId, pharmacyId), eq(sales.status, "pending"), onlyUserId ? eq(sales.createdBy, onlyUserId) : undefined));
  return row.n;
}

// Today's numbers for the dashboard. `onlyUserId` limits sales to one cashier.
export async function todaySummary(tx: Tx, pharmacyId: number, onlyUserId?: number) {
  const today = await salesReport(tx, pharmacyId, todayRange(), onlyUserId);
  return { count: today.count, gross: today.gross, refunds: today.refunds, net: today.net, pending: await pendingSalesCount(tx, pharmacyId, onlyUserId) };
}

export async function stockAlerts(tx: Tx, pharmacyId: number, expiryWarningDays: number) {
  const [expiring, stock] = await Promise.all([expiryReport(tx, pharmacyId, expiryWarningDays), stockReport(tx, pharmacyId)]);
  return { expired: expiring.filter((b) => b.expired).length, expiringSoon: expiring.filter((b) => !b.expired).length, outOfStock: stock.rows.filter((r) => r.stock === 0).length };
}
