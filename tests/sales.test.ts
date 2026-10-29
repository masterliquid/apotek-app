import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paymentMethods, productBatches, saleLineAllocations, saleLines, sales, stockMovements } from "@/db/schema";
import { listLookup } from "@/server/master-data";
import { createPharmacyWithOwner } from "@/server/pharmacies";
import { addPackUnit, createProduct, listProducts } from "@/server/products";
import { commitSale, getSale, holdSale, SalesError, voidPendingSale, type PaymentInput, type SaleLineInput } from "@/server/sales";
import { withPharmacy } from "@/server/tenant";
import { connectTestDbs, uniqueName } from "./helpers";

const dbs = connectTestDbs();
afterAll(() => dbs.close());

type Setup = { pharmacyId: number; userId: number; tabletId: number; stripId: number; categoryId: number; statusId: number; cashId: number; qrisId: number };

async function newPharmacy(): Promise<Setup> {
  const { pharmacyId, ownerUserId } = await createPharmacyWithOwner(
    dbs.app,
    { code: uniqueName("S"), name: uniqueName("Apotek "), owner: { username: uniqueName("o"), fullName: "Owner", password: "owner-password-1" } },
    null,
  );
  const methods = await dbs.admin.select().from(paymentMethods).where(eq(paymentMethods.pharmacyId, pharmacyId));
  return withPharmacy(dbs.app, pharmacyId, async (tx) => {
    const id = async (kind: "units" | "categories" | "statuses", name: string) => (await listLookup(tx, pharmacyId, kind)).find((r) => r.name === name)!.id;
    return {
      pharmacyId,
      userId: ownerUserId,
      tabletId: await id("units", "Tablet"),
      stripId: await id("units", "Strip"),
      categoryId: await id("categories", "Obat Bebas"),
      statusId: await id("statuses", "Ready-Stock"),
      cashId: methods.find((m) => m.name === "Tunai")!.id,
      qrisId: methods.find((m) => m.name === "QRIS")!.id,
    };
  });
}

// Product selling at 200 per tablet; 1 strip = 10 tablets. Batches are inserted directly: [batchNo, expiry|null, qty].
async function newProduct(s: Setup, batches: [string, string | null, number][]) {
  const productId = await withPharmacy(dbs.app, s.pharmacyId, async (tx) => {
    const id = await createProduct(tx, s, "10", { code: uniqueName("P"), name: "Paracetamol", categoryId: s.categoryId, statusId: s.statusId, baseUnitId: s.tabletId, baseCost: "100", marginPct: "20", sellPrice: "200" });
    await addPackUnit(tx, s, id, { unitId: s.stripId, factor: 10 });
    return id;
  });
  for (const [batchNo, expiryDate, qtyOnHand] of batches) {
    await dbs.admin.insert(productBatches).values({ pharmacyId: s.pharmacyId, productId, batchNo, expiryDate, qtyOnHand, unitCost: batchNo === "EARLY" ? "90" : "110" });
  }
  return productId;
}

const sellLine = (productId: number, unitId: number, qty: number, discountPct = "0"): SaleLineInput => ({ productId, unitId, qty, discountPct });
const cash = (s: Setup, amount: string): PaymentInput => ({ paymentMethodId: s.cashId, amount, confirmed: true });
const commit = (s: Setup, lines: SaleLineInput[], payments: PaymentInput[], saleId?: number) =>
  withPharmacy(dbs.app, s.pharmacyId, (tx) => commitSale(tx, s, { saleId, lines }, payments));
const stockOf = async (s: Setup, productId: number) => (await withPharmacy(dbs.app, s.pharmacyId, (tx) => listProducts(tx, s.pharmacyId))).find((p) => p.id === productId)!.stock;

let a: Setup;
let b: Setup;
beforeAll(async () => {
  a = await newPharmacy();
  b = await newPharmacy();
});

describe("commit sale", () => {
  it("takes stock first-expiry-first-out across batches, with ledger and cost at sale", async () => {
    const p = await newProduct(a, [["LATE", "2099-12-31", 10], ["EARLY", "2090-01-01", 5], ["NOEXP", null, 10]]);
    const result = await commit(a, [sellLine(p, a.tabletId, 8)], [cash(a, "2000")]);

    const batches = Object.fromEntries((await dbs.admin.select().from(productBatches).where(eq(productBatches.productId, p))).map((x) => [x.batchNo, x.qtyOnHand]));
    expect(batches).toEqual({ EARLY: 0, LATE: 7, NOEXP: 10 }); // EARLY first (5), then LATE (3); no-expiry stock last

    const movements = await dbs.admin.select().from(stockMovements).where(eq(stockMovements.productId, p));
    expect(movements.map((m) => m.qtyChange).sort()).toEqual([-3, -5]);
    expect(movements.every((m) => m.type === "sale" && m.documentId === result.saleId)).toBe(true);

    const allocations = await dbs.admin.select().from(saleLineAllocations).where(eq(saleLineAllocations.pharmacyId, a.pharmacyId));
    const mine = allocations.filter((x) => movements.some((m) => m.batchId === x.batchId));
    expect(mine.map((x) => [x.qtyBase, x.unitCost]).sort()).toEqual([[3, "110.00"], [5, "90.00"]]);
  });

  it("prices lines on the server (pack unit factor, discount) and calculates change", async () => {
    const p = await newProduct(a, [["B", "2099-12-31", 100]]);
    // 2 strips = 20 tablets × 200 = 4000, minus 10% = 3600; paid 5000 cash → change 1400
    const r = await commit(a, [sellLine(p, a.stripId, 2, "10")], [cash(a, "5000")]);
    expect(r).toMatchObject({ grandTotal: "3600.00", changeAmount: "1400.00" });
    expect(await stockOf(a, p)).toBe(80);
    const sale = await withPharmacy(dbs.app, a.pharmacyId, (tx) => getSale(tx, a.pharmacyId, r.saleId));
    expect(sale).toMatchObject({ status: "committed", subtotal: "4000.00", discountTotal: "400.00", paidTotal: "5000.00" });
    expect(sale?.lines).toMatchObject([{ unitName: "Strip", qty: 2, unitPrice: "2000.00", lineTotal: "3600.00" }]);
  });

  it("numbers receipts ddmmyyyy + daily sequence, without gaps after a failed sale", async () => {
    const p = await newProduct(a, [["B", "2099-12-31", 3]]);
    const one = await commit(a, [sellLine(p, a.tabletId, 1)], [cash(a, "200")]);
    await expect(commit(a, [sellLine(p, a.tabletId, 99)], [cash(a, "99999")])).rejects.toBeInstanceOf(SalesError);
    const two = await commit(a, [sellLine(p, a.tabletId, 1)], [cash(a, "200")]);
    expect(one.receiptNo).toMatch(/^\d{8}\d{3}$/);
    expect(Number(two.receiptNo)).toBe(Number(one.receiptNo) + 1);
  });

  it("refuses to sell more than the stock and leaves everything unchanged", async () => {
    const p = await newProduct(a, [["B", "2099-12-31", 4]]);
    await expect(commit(a, [sellLine(p, a.tabletId, 5)], [cash(a, "1000")])).rejects.toThrow(/Not enough stock/);
    expect(await stockOf(a, p)).toBe(4);
    expect(await dbs.admin.select().from(saleLines).where(eq(saleLines.productId, p))).toEqual([]);
  });

  it("never sells expired batches", async () => {
    const p = await newProduct(a, [["OLD", "2020-01-01", 50]]);
    await expect(commit(a, [sellLine(p, a.tabletId, 1)], [cash(a, "200")])).rejects.toThrow(/Not enough stock/);
  });

  it("two cashiers selling the last unit at the same time: exactly one succeeds", async () => {
    const p = await newProduct(a, [["LAST", "2099-12-31", 1]]);
    const results = await Promise.allSettled([commit(a, [sellLine(p, a.tabletId, 1)], [cash(a, "200")]), commit(a, [sellLine(p, a.tabletId, 1)], [cash(a, "200")])]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await stockOf(a, p)).toBe(0);
  });
});

describe("payment rules", () => {
  it("requires confirmed payments that cover the total", async () => {
    const p = await newProduct(a, [["B", "2099-12-31", 50]]);
    const line = [sellLine(p, a.tabletId, 5)]; // total 1000
    await expect(commit(a, line, [])).rejects.toThrow(/Add a payment/);
    await expect(commit(a, line, [{ ...cash(a, "1000"), confirmed: false }])).rejects.toThrow(/Confirm/);
    await expect(commit(a, line, [cash(a, "999.99")])).rejects.toThrow(/short by 0.01/);
    expect(await stockOf(a, p)).toBe(50);
  });

  it("allows split payments, but non-cash can not overpay", async () => {
    const p = await newProduct(a, [["B", "2099-12-31", 50]]);
    const line = [sellLine(p, a.tabletId, 5)];
    await expect(commit(a, line, [{ paymentMethodId: a.qrisId, amount: "1200", confirmed: true }])).rejects.toThrow(/Non-cash/);
    const r = await commit(a, line, [{ paymentMethodId: a.qrisId, amount: "600", referenceNo: "QR123", confirmed: true }, cash(a, "500")]);
    expect(r.changeAmount).toBe("100.00");
  });

  it("rejects payment methods of another pharmacy", async () => {
    const p = await newProduct(a, [["B", "2099-12-31", 5]]);
    await expect(commit(a, [sellLine(p, a.tabletId, 1)], [{ paymentMethodId: b.cashId, amount: "200", confirmed: true }])).rejects.toThrow(/not available/);
  });
});

describe("pending sales", () => {
  it("hold does not touch stock; commit of the held sale takes it; committed sales cannot be voided", async () => {
    const p = await newProduct(a, [["B", "2099-12-31", 10]]);
    const saleId = await withPharmacy(dbs.app, a.pharmacyId, (tx) => holdSale(tx, a, { lines: [sellLine(p, a.tabletId, 3)] }));
    expect(await stockOf(a, p)).toBe(10);
    expect((await dbs.admin.select().from(sales).where(eq(sales.id, saleId)))[0]).toMatchObject({ status: "pending", receiptNo: null });

    const r = await commit(a, [sellLine(p, a.tabletId, 4)], [cash(a, "800")], saleId); // cart was changed before paying
    expect(r.saleId).toBe(saleId);
    expect(await stockOf(a, p)).toBe(6);
    await expect(withPharmacy(dbs.app, a.pharmacyId, (tx) => voidPendingSale(tx, a, saleId, true))).rejects.toThrow(/only a pending sale/i);
  });

  it("a cashier can void only their own pending sale", async () => {
    const p = await newProduct(a, [["B", "2099-12-31", 10]]);
    const saleId = await withPharmacy(dbs.app, a.pharmacyId, (tx) => holdSale(tx, a, { lines: [sellLine(p, a.tabletId, 1)] }));
    const other = { ...a, userId: a.userId + 999999 };
    await expect(withPharmacy(dbs.app, a.pharmacyId, (tx) => voidPendingSale(tx, other, saleId, false))).rejects.toThrow(/your own/);
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => voidPendingSale(tx, a, saleId, false));
    expect((await dbs.admin.select().from(sales).where(eq(sales.id, saleId)))[0].status).toBe("void");
  });
});

describe("pharmacy isolation", () => {
  it("cannot sell another pharmacy's product", async () => {
    const productOfA = await newProduct(a, [["B", "2099-12-31", 10]]);
    await expect(commit(b, [sellLine(productOfA, b.tabletId, 1)], [cash(b, "200")])).rejects.toThrow(/Product not found/);
  });
});
