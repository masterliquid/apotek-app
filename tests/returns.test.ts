import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paymentMethods, productBatches, saleLines, salesReturnLines, sales, stockMovements } from "@/db/schema";
import { listLookup, createPartner, listPartners } from "@/server/master-data";
import { createPharmacyWithOwner } from "@/server/pharmacies";
import { addPackUnit, createProduct } from "@/server/products";
import { addPurchaseOrderLine, createPurchaseOrder, receiveGoods } from "@/server/purchasing";
import { createPurchaseReturn, createSalesReturn, findCommittedSaleByReceipt, getReturnableReceiptLines, getReturnableSaleLines, ReturnError } from "@/server/returns";
import { commitSale, getSale, holdSale } from "@/server/sales";
import { withPharmacy } from "@/server/tenant";
import { connectTestDbs, uniqueName } from "./helpers";

const dbs = connectTestDbs();
afterAll(() => dbs.close());

type Setup = { pharmacyId: number; userId: number; tabletId: number; stripId: number; categoryId: number; statusId: number; cashId: number; supplierId: number };

async function newPharmacy(): Promise<Setup> {
  const { pharmacyId, ownerUserId } = await createPharmacyWithOwner(
    dbs.app,
    { code: uniqueName("R"), name: uniqueName("Apotek "), owner: { username: uniqueName("o"), fullName: "Owner", password: "owner-password-1" } },
    null,
  );
  const methods = await dbs.admin.select().from(paymentMethods).where(eq(paymentMethods.pharmacyId, pharmacyId));
  return withPharmacy(dbs.app, pharmacyId, async (tx) => {
    const id = async (kind: "units" | "categories" | "statuses", name: string) => (await listLookup(tx, pharmacyId, kind)).find((r) => r.name === name)!.id;
    await createPartner(tx, pharmacyId, ownerUserId, "suppliers", { name: "PBF" });
    return {
      pharmacyId, userId: ownerUserId,
      tabletId: await id("units", "Tablet"), stripId: await id("units", "Strip"), categoryId: await id("categories", "Obat Bebas"), statusId: await id("statuses", "Ready-Stock"),
      cashId: methods.find((m) => m.name === "Tunai")!.id,
      supplierId: (await listPartners(tx, pharmacyId, "suppliers"))[0].id,
    };
  });
}

async function newProduct(s: Setup, batches: [string, string | null, number][] = []) {
  const productId = await withPharmacy(dbs.app, s.pharmacyId, async (tx) => {
    const id = await createProduct(tx, s, "10", { code: uniqueName("P"), name: "Paracetamol", categoryId: s.categoryId, statusId: s.statusId, baseUnitId: s.tabletId, baseCost: "100", marginPct: "20", sellPrice: "200" });
    await addPackUnit(tx, s, id, { unitId: s.stripId, factor: 10 });
    return id;
  });
  for (const [batchNo, expiryDate, qtyOnHand] of batches) await dbs.admin.insert(productBatches).values({ pharmacyId: s.pharmacyId, productId, batchNo, expiryDate, qtyOnHand, unitCost: "100" });
  return productId;
}

const sell = (s: Setup, productId: number, unitId: number, qty: number, discountPct = "0") =>
  withPharmacy(dbs.app, s.pharmacyId, (tx) => commitSale(tx, s, { lines: [{ productId, unitId, qty, discountPct }] }, [{ paymentMethodId: s.cashId, amount: "100000", confirmed: true }]));
const doReturn = (s: Setup, saleId: number, items: { lineId: number; qty: number }[]) => withPharmacy(dbs.app, s.pharmacyId, (tx) => createSalesReturn(tx, s, { saleId, reason: "wrong item", items }));
const lineIdOf = async (saleId: number) => (await dbs.admin.select().from(saleLines).where(eq(saleLines.saleId, saleId)))[0].id;
const batchQtys = async (productId: number) => Object.fromEntries((await dbs.admin.select().from(productBatches).where(eq(productBatches.productId, productId))).map((b) => [b.batchNo, b.qtyOnHand]));

let a: Setup;
let b: Setup;
beforeAll(async () => {
  a = await newPharmacy();
  b = await newPharmacy();
});

describe("sales returns", () => {
  it("returns goods to the batches they came from and leaves the original sale untouched", async () => {
    const p = await newProduct(a, [["EARLY", "2090-01-01", 5], ["LATE", "2099-12-31", 10]]);
    const sale = await sell(a, p, a.tabletId, 8); // EARLY 5 + LATE 3
    expect(await batchQtys(p)).toEqual({ EARLY: 0, LATE: 7 });
    const lineId = await lineIdOf(sale.saleId);

    const r = await doReturn(a, sale.saleId, [{ lineId, qty: 6 }]);
    expect(r.totalRefund).toBe("1200.00"); // 6 × 200
    expect(await batchQtys(p)).toEqual({ EARLY: 5, LATE: 8 }); // 5 back to EARLY (first allocation), 1 to LATE

    const original = await withPharmacy(dbs.app, a.pharmacyId, (tx) => getSale(tx, a.pharmacyId, sale.saleId));
    expect(original).toMatchObject({ status: "committed", grandTotal: "1600.00", receiptNo: sale.receiptNo });
    expect(original?.lines[0]).toMatchObject({ qty: 8, lineTotal: "1600.00" });

    const moves = await dbs.admin.select().from(stockMovements).where(eq(stockMovements.documentId, r.returnId));
    expect(moves.filter((m) => m.type === "sales_return").map((m) => m.qtyChange).sort()).toEqual([1, 5]);
  });

  it("never lets the total returned exceed what was sold, across several returns", async () => {
    const p = await newProduct(a, [["B", "2099-12-31", 20]]);
    const sale = await sell(a, p, a.tabletId, 8);
    const lineId = await lineIdOf(sale.saleId);
    await doReturn(a, sale.saleId, [{ lineId, qty: 5 }]);
    await expect(doReturn(a, sale.saleId, [{ lineId, qty: 4 }])).rejects.toThrow(/more than was sold \(3 left/);
    await doReturn(a, sale.saleId, [{ lineId, qty: 3 }]);
    expect((await batchQtys(p)).B).toBe(20);
    const lines = await withPharmacy(dbs.app, a.pharmacyId, (tx) => getReturnableSaleLines(tx, a.pharmacyId, sale.saleId));
    expect(lines[0]).toMatchObject({ returnedQty: 8, returnableQty: 0 });
  });

  it("refunds add up to exactly the line total even when the discount makes cents awkward", async () => {
    const p = await newProduct(a, [["B", "2099-12-31", 20]]);
    const sale = await sell(a, p, a.tabletId, 3, "33.33"); // 600 − 33.33% = 400.02
    const lineId = await lineIdOf(sale.saleId);
    const refunds = [];
    for (let i = 0; i < 3; i++) refunds.push((await doReturn(a, sale.saleId, [{ lineId, qty: 1 }])).totalRefund);
    expect(refunds).toEqual(["133.34", "133.34", "133.34"]);
    const lineRows = await dbs.admin.select().from(salesReturnLines).where(eq(salesReturnLines.pharmacyId, a.pharmacyId));
    expect(lineRows.length).toBeGreaterThan(0);
  });

  it("returns in the unit of the original line (strips)", async () => {
    const p = await newProduct(a, [["B", "2099-12-31", 100]]);
    const sale = await sell(a, p, a.stripId, 2); // 20 tablets, 4000
    const lineId = await lineIdOf(sale.saleId);
    await expect(doReturn(a, sale.saleId, [{ lineId, qty: 3 }])).rejects.toThrow(/more than was sold/);
    const r = await doReturn(a, sale.saleId, [{ lineId, qty: 1 }]);
    expect(r.totalRefund).toBe("2000.00");
    expect((await batchQtys(p)).B).toBe(90); // 100 − 20 sold + 10 returned
  });

  it("only completed sales can be returned, and only within the same pharmacy", async () => {
    const p = await newProduct(a, [["B", "2099-12-31", 10]]);
    const pendingId = await withPharmacy(dbs.app, a.pharmacyId, (tx) => holdSale(tx, a, { lines: [{ productId: p, unitId: a.tabletId, qty: 1, discountPct: "0" }] }));
    const pendingLine = await lineIdOf(pendingId);
    await expect(doReturn(a, pendingId, [{ lineId: pendingLine, qty: 1 }])).rejects.toThrow(/completed/);

    const sale = await sell(a, p, a.tabletId, 1);
    await expect(doReturn(b, sale.saleId, [{ lineId: await lineIdOf(sale.saleId), qty: 1 }])).rejects.toThrow(/Sale not found/);
    expect(await withPharmacy(dbs.app, b.pharmacyId, (tx) => findCommittedSaleByReceipt(tx, b.pharmacyId, sale.receiptNo))).toBeNull();
    expect((await withPharmacy(dbs.app, a.pharmacyId, (tx) => findCommittedSaleByReceipt(tx, a.pharmacyId, sale.receiptNo)))?.id).toBe(sale.saleId);
  });

  it("two simultaneous returns of the same goods: only one succeeds", async () => {
    const p = await newProduct(a, [["B", "2099-12-31", 10]]);
    const sale = await sell(a, p, a.tabletId, 4);
    const lineId = await lineIdOf(sale.saleId);
    const results = await Promise.allSettled([doReturn(a, sale.saleId, [{ lineId, qty: 4 }]), doReturn(a, sale.saleId, [{ lineId, qty: 4 }])]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await batchQtys(p)).B).toBe(10);
  });

  it("rejects an empty return and lines from another sale", async () => {
    const p = await newProduct(a, [["B", "2099-12-31", 10]]);
    const one = await sell(a, p, a.tabletId, 1);
    const two = await sell(a, p, a.tabletId, 1);
    await expect(doReturn(a, one.saleId, [{ lineId: await lineIdOf(one.saleId), qty: 0 }])).rejects.toThrow(/Enter a quantity/);
    await expect(doReturn(a, one.saleId, [{ lineId: await lineIdOf(two.saleId), qty: 1 }])).rejects.toBeInstanceOf(ReturnError);
    expect((await dbs.admin.select().from(sales).where(eq(sales.id, one.saleId)))[0].status).toBe("committed");
  });
});

describe("purchase returns", () => {
  async function receive(s: Setup, productId: number, qty: number, batchNo: string) {
    return withPharmacy(dbs.app, s.pharmacyId, async (tx) => {
      const po = await createPurchaseOrder(tx, s, { supplierId: s.supplierId });
      await addPurchaseOrderLine(tx, s, po.id, { productId, unitId: s.tabletId, qty });
      return receiveGoods(tx, s, "10", { purchaseOrderId: po.id, supplierInvoiceNo: "INV", lines: [{ productId, unitId: s.tabletId, qty, unitPrice: "100", discountPct: "0", batchNo, expiryDate: "2099-12-31" }] });
    });
  }
  const receiptLineId = async (s: Setup, receiptId: number) => (await withPharmacy(dbs.app, s.pharmacyId, (tx) => getReturnableReceiptLines(tx, s.pharmacyId, receiptId)))[0];
  const sendBack = (s: Setup, receiptId: number, lineId: number, qty: number) => withPharmacy(dbs.app, s.pharmacyId, (tx) => createPurchaseReturn(tx, s, { goodsReceiptId: receiptId, reason: "damaged", items: [{ lineId, qty }] }));

  it("takes stock out of the received batch, not more than received", async () => {
    const p = await newProduct(a);
    const { receiptId } = await receive(a, p, 10, "R1");
    const line = await receiptLineId(a, receiptId);
    await sendBack(a, receiptId, line.id, 4);
    expect((await batchQtys(p)).R1).toBe(6);
    await expect(sendBack(a, receiptId, line.id, 7)).rejects.toThrow(/more than was received/);
    expect((await batchQtys(p)).R1).toBe(6);
  });

  it("cannot return goods that were already sold", async () => {
    const p = await newProduct(a);
    const { receiptId } = await receive(a, p, 10, "R2");
    await sell(a, p, a.tabletId, 8);
    const line = await receiptLineId(a, receiptId);
    expect(line.returnableQty).toBe(2);
    await expect(sendBack(a, receiptId, line.id, 5)).rejects.toThrow(/already sold/);
    await sendBack(a, receiptId, line.id, 2);
    expect((await batchQtys(p)).R2).toBe(0);
  });

  it("another pharmacy cannot return against this receipt", async () => {
    const p = await newProduct(a);
    const { receiptId } = await receive(a, p, 5, "R3");
    const line = await receiptLineId(a, receiptId);
    await expect(sendBack(b, receiptId, line.id, 1)).rejects.toThrow(/not found/);
  });
});
