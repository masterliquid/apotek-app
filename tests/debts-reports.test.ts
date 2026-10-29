import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paymentMethods, productBatches } from "@/db/schema";
import { dayInPharmacyTime } from "@/server/counters";
import { addDays, DateRangeError, dayRange, todayRange } from "@/server/dates";
import { createDebt, DebtError, listDebts, recordDebtPayment, totalOutstanding } from "@/server/debts";
import { createPartner, listLookup, listPartners } from "@/server/master-data";
import { createPharmacyWithOwner } from "@/server/pharmacies";
import { createProduct } from "@/server/products";
import { createSalesReturn } from "@/server/returns";
import { expiryReport, profitReport, salesReport, stockReport } from "@/server/reports";
import { commitSale, getSale } from "@/server/sales";
import { dailyRevenue, pendingSalesCount, stockAlerts, todaySummary } from "@/server/dashboard";
import { withPharmacy } from "@/server/tenant";
import { connectTestDbs, uniqueName } from "./helpers";

const dbs = connectTestDbs();
afterAll(() => dbs.close());

type Setup = { pharmacyId: number; userId: number; tabletId: number; categoryId: number; statusId: number; cashId: number; qrisId: number; supplierId: number; customerId: number };

async function newPharmacy(): Promise<Setup> {
  const { pharmacyId, ownerUserId } = await createPharmacyWithOwner(
    dbs.app,
    { code: uniqueName("D"), name: uniqueName("Apotek "), owner: { username: uniqueName("o"), fullName: "Owner", password: "owner-password-1" } },
    null,
  );
  const methods = await dbs.admin.select().from(paymentMethods).where(eq(paymentMethods.pharmacyId, pharmacyId));
  return withPharmacy(dbs.app, pharmacyId, async (tx) => {
    const id = async (kind: "units" | "categories" | "statuses", name: string) => (await listLookup(tx, pharmacyId, kind)).find((r) => r.name === name)!.id;
    await createPartner(tx, pharmacyId, ownerUserId, "suppliers", { name: "PBF" });
    await createPartner(tx, pharmacyId, ownerUserId, "customers", { name: "Budi" });
    return {
      pharmacyId, userId: ownerUserId, tabletId: await id("units", "Tablet"), categoryId: await id("categories", "Obat Bebas"), statusId: await id("statuses", "Ready-Stock"),
      cashId: methods.find((m) => m.name === "Tunai")!.id, qrisId: methods.find((m) => m.name === "QRIS")!.id,
      supplierId: (await listPartners(tx, pharmacyId, "suppliers"))[0].id, customerId: (await listPartners(tx, pharmacyId, "customers"))[0].id,
    };
  });
}

// Cost 100/tablet on the batch, sells at 200.
async function newProduct(s: Setup, batches: [string, string | null, number][]) {
  const productId = await withPharmacy(dbs.app, s.pharmacyId, (tx) =>
    createProduct(tx, s, "10", { code: uniqueName("P"), name: uniqueName("Obat "), categoryId: s.categoryId, statusId: s.statusId, baseUnitId: s.tabletId, baseCost: "100", marginPct: "20", sellPrice: "200" }),
  );
  for (const [batchNo, expiryDate, qtyOnHand] of batches) await dbs.admin.insert(productBatches).values({ pharmacyId: s.pharmacyId, productId, batchNo, expiryDate, qtyOnHand, unitCost: "100" });
  return productId;
}

const sell = (s: Setup, productId: number, qty: number, payments: { paymentMethodId: number; amount: string }[]) =>
  withPharmacy(dbs.app, s.pharmacyId, (tx) => commitSale(tx, s, { lines: [{ productId, unitId: s.tabletId, qty, discountPct: "0" }] }, payments.map((p) => ({ ...p, confirmed: true }))));

describe("debts", () => {
  let a: Setup;
  let b: Setup;
  beforeAll(async () => {
    a = await newPharmacy();
    b = await newPharmacy();
  });

  it("tracks payments against a payable and shows what is still owed", async () => {
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => createDebt(tx, a, "payables", { partyId: a.supplierId, amount: "1000000", note: "invoice 7" }));
    const [debt] = await withPharmacy(dbs.app, a.pharmacyId, (tx) => listDebts(tx, a.pharmacyId, "payables"));
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => recordDebtPayment(tx, a, "payables", debt.id, "250000.50"));
    const [after] = await withPharmacy(dbs.app, a.pharmacyId, (tx) => listDebts(tx, a.pharmacyId, "payables"));
    expect(after).toMatchObject({ partyName: "PBF", paidAmount: "250000.50", outstanding: "749999.50" });
    expect(await withPharmacy(dbs.app, a.pharmacyId, (tx) => totalOutstanding(tx, a.pharmacyId, "payables"))).toBe("749999.50");
  });

  it("never lets payments exceed the amount, also for two simultaneous payments", async () => {
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => createDebt(tx, a, "receivables", { partyId: a.customerId, amount: "100" }));
    const debt = (await withPharmacy(dbs.app, a.pharmacyId, (tx) => listDebts(tx, a.pharmacyId, "receivables")))[0];
    await expect(withPharmacy(dbs.app, a.pharmacyId, (tx) => recordDebtPayment(tx, a, "receivables", debt.id, "100.01"))).rejects.toBeInstanceOf(DebtError);
    const results = await Promise.allSettled([60, 60].map((n) => withPharmacy(dbs.app, a.pharmacyId, (tx) => recordDebtPayment(tx, a, "receivables", debt.id, String(n)))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await withPharmacy(dbs.app, a.pharmacyId, (tx) => listDebts(tx, a.pharmacyId, "receivables")))[0].paidAmount).toBe("60.00");
  });

  it("rejects zero amounts and other pharmacies' records", async () => {
    await expect(withPharmacy(dbs.app, a.pharmacyId, (tx) => createDebt(tx, a, "payables", { partyId: a.supplierId, amount: "0" }))).rejects.toBeInstanceOf(DebtError);
    const debt = (await withPharmacy(dbs.app, a.pharmacyId, (tx) => listDebts(tx, a.pharmacyId, "payables")))[0];
    await expect(withPharmacy(dbs.app, b.pharmacyId, (tx) => recordDebtPayment(tx, b, "payables", debt.id, "1"))).rejects.toBeInstanceOf(DebtError);
    expect(await withPharmacy(dbs.app, b.pharmacyId, (tx) => listDebts(tx, b.pharmacyId, "payables"))).toEqual([]);
  });
});

describe("reports", () => {
  let s: Setup;
  beforeAll(async () => {
    s = await newPharmacy();
  });

  it("profit uses cost at the time of sale and subtracts returns (revenue and returned cost)", async () => {
    const p = await newProduct(s, [["B", "2099-12-31", 50]]);
    const sale = await sell(s, p, 8, [{ paymentMethodId: s.cashId, amount: "1600" }]); // revenue 1600, cost 800
    const detail = await withPharmacy(dbs.app, s.pharmacyId, (tx) => getSale(tx, s.pharmacyId, sale.saleId));
    await withPharmacy(dbs.app, s.pharmacyId, (tx) => createSalesReturn(tx, s, { saleId: sale.saleId, items: [{ lineId: detail!.lines[0].id, qty: 6 }] })); // refund 1200, cost back 600
    await dbs.admin.update(productBatches).set({ unitCost: "999" }).where(eq(productBatches.productId, p)); // later cost change must not rewrite history

    const report = await withPharmacy(dbs.app, s.pharmacyId, (tx) => profitReport(tx, s.pharmacyId, todayRange()));
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ sales: 1, revenue: "400.00", cost: "200.00", profit: "200.00" });
    expect(report.totals).toEqual({ revenue: "400.00", cost: "200.00", profit: "200.00" });
  });

  it("sales report: gross, refunds, net and money kept per payment method (change comes out of cash)", async () => {
    const fresh = await newPharmacy();
    const p = await newProduct(fresh, [["B", "2099-12-31", 50]]);
    await sell(fresh, p, 5, [{ paymentMethodId: fresh.cashId, amount: "1500" }]); // total 1000, change 500
    await sell(fresh, p, 2, [{ paymentMethodId: fresh.qrisId, amount: "400" }]); // total 400

    const report = await withPharmacy(dbs.app, fresh.pharmacyId, (tx) => salesReport(tx, fresh.pharmacyId, todayRange()));
    expect(report).toMatchObject({ count: 2, gross: "1400.00", refunds: "0.00", net: "1400.00" });
    expect(Object.fromEntries(report.byMethod.map((m) => [m.method, m.amount]))).toEqual({ Tunai: "1000.00", QRIS: "400.00" });
    const none = await withPharmacy(dbs.app, fresh.pharmacyId, (tx) => salesReport(tx, fresh.pharmacyId, todayRange(), 999999));
    expect(none.count).toBe(0);
  });

  it("dashboard numbers match the reports: today's net, 7-day series, pending sales, alerts", async () => {
    // pharmacy `s` already has the 1600 sale and 1200 return from the profit test: net 400 today
    const today = await withPharmacy(dbs.app, s.pharmacyId, (tx) => todaySummary(tx, s.pharmacyId));
    expect(today).toMatchObject({ count: 1, gross: "1600.00", refunds: "1200.00", net: "400.00", pending: 0 });
    const week = await withPharmacy(dbs.app, s.pharmacyId, (tx) => dailyRevenue(tx, s.pharmacyId, 7));
    expect(week).toHaveLength(7);
    expect(week.at(-1)).toEqual({ day: dayInPharmacyTime(), net: "400.00" });
    expect(week.slice(0, 6).every((d) => d.net === "0.00")).toBe(true);
    expect(await withPharmacy(dbs.app, s.pharmacyId, (tx) => pendingSalesCount(tx, s.pharmacyId, 999999))).toBe(0);
    const alerts = await withPharmacy(dbs.app, s.pharmacyId, (tx) => stockAlerts(tx, s.pharmacyId, 90));
    expect(alerts).toMatchObject({ expired: 0, expiringSoon: 0 });
  });

  it("reports only the requested days", async () => {
    const yesterday = addDays(dayInPharmacyTime(), -1);
    const report = await withPharmacy(dbs.app, s.pharmacyId, (tx) => profitReport(tx, s.pharmacyId, dayRange(yesterday, yesterday)));
    expect(report.rows).toEqual([]);
  });

  it("stock report values stock at batch cost and selling price", async () => {
    const fresh = await newPharmacy();
    await newProduct(fresh, [["B1", "2099-12-31", 10], ["B2", null, 5]]);
    const report = await withPharmacy(dbs.app, fresh.pharmacyId, (tx) => stockReport(tx, fresh.pharmacyId));
    expect(report.rows[0]).toMatchObject({ stock: 15, costValue: "1500.00", sellValue: "3000.00" });
    expect(report).toMatchObject({ totalCost: "1500.00", totalSell: "3000.00" });
  });

  it("expiry report lists expired and soon-to-expire batches that still have stock", async () => {
    const fresh = await newPharmacy();
    const today = dayInPharmacyTime();
    await newProduct(fresh, [["OLD", addDays(today, -5), 3], ["SOON", addDays(today, 20), 4], ["FAR", addDays(today, 400), 5], ["EMPTY", addDays(today, 1), 0], ["NOEXP", null, 9]]);
    const rows = await withPharmacy(dbs.app, fresh.pharmacyId, (tx) => expiryReport(tx, fresh.pharmacyId, 90));
    expect(rows.map((r) => [r.batchNo, r.expired])).toEqual([["OLD", true], ["SOON", false]]);
  });
});

describe("date ranges", () => {
  it("are inclusive Jakarta days and validated", () => {
    const r = dayRange("2026-10-29", "2026-10-30");
    expect(r.start.toISOString()).toBe("2026-10-28T17:00:00.000Z");
    expect(r.endExclusive.toISOString()).toBe("2026-10-30T17:00:00.000Z");
    expect(() => dayRange("2026-10-30", "2026-10-29")).toThrow(DateRangeError);
    expect(() => dayRange("2026-1-1", "2026-10-29")).toThrow(DateRangeError);
    expect(() => dayRange("2025-01-01", "2026-12-31")).toThrow(/one year/);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});
