import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { goodsReceiptLines, productBatches, purchaseOrders, stockMovements } from "@/db/schema";
import { createPartner, listLookup, listPartners } from "@/server/master-data";
import { createPharmacyWithOwner } from "@/server/pharmacies";
import { addPackUnit, createProduct, listProducts } from "@/server/products";
import { addPurchaseOrderLine, cancelPurchaseOrder, closePurchaseOrder, createPurchaseOrder, getPurchaseOrder, listPurchaseOrders, PurchasingError, receiveGoods, removePurchaseOrderLine, setPurchaseOrderLineQty, type ReceiptLineInput } from "@/server/purchasing";
import { withPharmacy } from "@/server/tenant";
import { connectTestDbs, uniqueName } from "./helpers";

const dbs = connectTestDbs();
afterAll(() => dbs.close());

type Setup = { pharmacyId: number; userId: number; supplierId: number; tabletId: number; stripId: number; categoryId: number; statusId: number };

async function newPharmacy(): Promise<Setup> {
  const { pharmacyId, ownerUserId } = await createPharmacyWithOwner(
    dbs.app,
    { code: uniqueName("R"), name: uniqueName("Apotek "), owner: { username: uniqueName("o"), fullName: "Owner", password: "owner-password-1" } },
    null,
  );
  return withPharmacy(dbs.app, pharmacyId, async (tx) => {
    const id = async (kind: "units" | "categories" | "statuses", name: string) => (await listLookup(tx, pharmacyId, kind)).find((r) => r.name === name)!.id;
    await createPartner(tx, pharmacyId, ownerUserId, "suppliers", { name: "PBF Test" });
    const supplierId = (await listPartners(tx, pharmacyId, "suppliers"))[0].id;
    return { pharmacyId, userId: ownerUserId, supplierId, tabletId: await id("units", "Tablet"), stripId: await id("units", "Strip"), categoryId: await id("categories", "Obat Bebas"), statusId: await id("statuses", "Ready-Stock") };
  });
}

// A product with base cost 100/tablet and 1 strip = 10 tablets.
async function newProduct(s: Setup, baseCost = "100") {
  return withPharmacy(dbs.app, s.pharmacyId, async (tx) => {
    const id = await createProduct(tx, s, "10", { code: uniqueName("P"), name: "Paracetamol", categoryId: s.categoryId, statusId: s.statusId, baseUnitId: s.tabletId, baseCost, marginPct: "20", sellPrice: "200" });
    await addPackUnit(tx, s, id, { unitId: s.stripId, factor: 10 });
    return id;
  });
}

async function newPo(s: Setup, lines: { productId: number; unitId: number; qty: number }[] = []) {
  return withPharmacy(dbs.app, s.pharmacyId, async (tx) => {
    const po = await createPurchaseOrder(tx, s, { supplierId: s.supplierId });
    for (const l of lines) await addPurchaseOrderLine(tx, s, po.id, l);
    return po;
  });
}

const FUTURE = "2099-12-31";
const line = (productId: number, unitId: number, over: Partial<ReceiptLineInput> = {}): ReceiptLineInput => ({ productId, unitId, qty: 2, unitPrice: "1000", discountPct: "0", batchNo: "B1", expiryDate: FUTURE, ...over });
const receive = (s: Setup, poId: number, lines: ReceiptLineInput[]) => withPharmacy(dbs.app, s.pharmacyId, (tx) => receiveGoods(tx, s, "10", { purchaseOrderId: poId, supplierInvoiceNo: "INV-1", lines }));
const stockOf = async (s: Setup, productId: number) => (await withPharmacy(dbs.app, s.pharmacyId, (tx) => listProducts(tx, s.pharmacyId))).find((p) => p.id === productId)!;

let a: Setup;
let b: Setup;
beforeAll(async () => {
  a = await newPharmacy();
  b = await newPharmacy();
});

describe("purchase orders", () => {
  it("numbers POs sequentially per day and pharmacy", async () => {
    const one = await newPo(a);
    const two = await newPo(a);
    const other = await newPo(b);
    const seq = (n: string) => Number(n.split("-")[2]);
    expect(one.poNo).toMatch(/^PO-\d{8}-\d{3}$/);
    expect(seq(two.poNo)).toBe(seq(one.poNo) + 1);
    expect(other.poNo.split("-")[2]).toBe("001");
  });

  it("stores pack unit lines with their factor and rejects units the product lacks", async () => {
    const productId = await newProduct(a);
    const po = await newPo(a, [{ productId, unitId: a.stripId, qty: 3 }]);
    const detail = await withPharmacy(dbs.app, a.pharmacyId, (tx) => getPurchaseOrder(tx, a.pharmacyId, po.id));
    expect(detail?.lines).toMatchObject([{ unitName: "Strip", unitFactor: 10, qty: 3 }]);

    const boxId = await withPharmacy(dbs.app, a.pharmacyId, async (tx) => (await listLookup(tx, a.pharmacyId, "units")).find((u) => u.name === "Box")!.id);
    await expect(newPo(a, [{ productId, unitId: boxId, qty: 1 }])).rejects.toThrow(/not defined/);
  });
});

describe("goods receipt", () => {
  it("adds stock in base units, writes the ledger, closes the PO", async () => {
    const productId = await newProduct(a);
    const po = await newPo(a, [{ productId, unitId: a.stripId, qty: 2 }]);
    const result = await receive(a, po.id, [line(productId, a.stripId, { qty: 2, unitPrice: "1000", discountPct: "10" })]);

    expect(result.grandTotal).toBe("1800.00"); // 2 × 1000, minus 10%
    expect((await stockOf(a, productId)).stock).toBe(20); // 2 strips × 10 tablets

    const [batch] = await dbs.admin.select().from(productBatches).where(eq(productBatches.productId, productId));
    expect(batch).toMatchObject({ batchNo: "B1", qtyOnHand: 20, expiryDate: FUTURE, unitCost: "90.00" }); // 1000 less 10%, per tablet ÷ 10
    const movements = await dbs.admin.select().from(stockMovements).where(eq(stockMovements.productId, productId));
    expect(movements).toMatchObject([{ type: "goods_receipt", qtyChange: 20, documentId: result.receiptId }]);
    const [poRow] = await dbs.admin.select().from(purchaseOrders).where(eq(purchaseOrders.id, po.id));
    expect(poRow.status).toBe("received");
  });

  it("raises base cost when the new price is higher, never lowers it (legacy rule)", async () => {
    const productId = await newProduct(a, "100");
    // 1 strip at 1500 = 150 per tablet > 100 → cost goes up, derived prices follow
    await receive(a, (await newPo(a)).id, [line(productId, a.stripId, { qty: 1, unitPrice: "1500", batchNo: "UP" })]);
    expect(await stockOf(a, productId)).toMatchObject({ baseCost: "150.00", buyPrice: "165.00", recommendedPrice: "198.00" });
    // cheaper delivery: 1 strip at 800 = 80 per tablet → cost stays
    await receive(a, (await newPo(a)).id, [line(productId, a.stripId, { qty: 1, unitPrice: "800", batchNo: "DOWN" })]);
    expect((await stockOf(a, productId)).baseCost).toBe("150.00");
  });

  it("a PO can be received only once", async () => {
    const productId = await newProduct(a);
    const po = await newPo(a);
    await receive(a, po.id, [line(productId, a.tabletId)]);
    await expect(receive(a, po.id, [line(productId, a.tabletId, { batchNo: "B2" })])).rejects.toThrow(/no longer open/);
    expect((await stockOf(a, productId)).stock).toBe(2);
  });

  it("the same batch number adds to the batch; a different expiry is refused", async () => {
    const productId = await newProduct(a);
    await receive(a, (await newPo(a)).id, [line(productId, a.tabletId, { qty: 5, batchNo: "SAME" })]);
    await receive(a, (await newPo(a)).id, [line(productId, a.tabletId, { qty: 7, batchNo: "SAME" })]);
    const batches = await dbs.admin.select().from(productBatches).where(eq(productBatches.productId, productId));
    expect(batches).toMatchObject([{ batchNo: "SAME", qtyOnHand: 12 }]);
    await expect(receive(a, (await newPo(a)).id, [line(productId, a.tabletId, { batchNo: "SAME", expiryDate: "2098-01-01" })])).rejects.toThrow(/different expiry/);
  });

  it("rolls everything back when one line is invalid (expired batch)", async () => {
    const productId = await newProduct(a);
    const po = await newPo(a);
    await expect(
      receive(a, po.id, [line(productId, a.tabletId, { batchNo: "OK" }), line(productId, a.tabletId, { batchNo: "OLD", expiryDate: "2020-01-01" })]),
    ).rejects.toBeInstanceOf(PurchasingError);
    expect((await stockOf(a, productId)).stock).toBe(0);
    const [poRow] = await dbs.admin.select().from(purchaseOrders).where(eq(purchaseOrders.id, po.id));
    expect(poRow.status).toBe("open");
    expect(await dbs.admin.select().from(goodsReceiptLines).where(and(eq(goodsReceiptLines.productId, productId)))).toEqual([]);
  });

  it("requires batch number, expiry date and at least one line", async () => {
    const productId = await newProduct(a);
    const po = await newPo(a);
    await expect(receive(a, po.id, [])).rejects.toThrow(/at least one/);
    await expect(receive(a, po.id, [line(productId, a.tabletId, { batchNo: " " })])).rejects.toThrow(/Batch number/);
    await expect(receive(a, po.id, [line(productId, a.tabletId, { expiryDate: "" })])).rejects.toThrow(/Expiry/);
  });

  it("another pharmacy cannot receive against this pharmacy's PO", async () => {
    const productOfB = await newProduct(b);
    const poOfA = await newPo(a);
    await expect(receive(b, poOfA.id, [line(productOfB, b.tabletId)])).rejects.toThrow(/not found/);
  });
});

describe("partial receiving", () => {
  const detail = (id: number) => withPharmacy(dbs.app, a.pharmacyId, (tx) => getPurchaseOrder(tx, a.pharmacyId, id));
  const ordered1000 = async () => {
    const productId = await newProduct(a);
    const po = await newPo(a, [{ productId, unitId: a.tabletId, qty: 1000 }]);
    return { productId, po, lineId: (await detail(po.id))!.lines[0].id };
  };

  it("receiving 500 of 1000 leaves the order partially received with 500 still to come, and the rest can be received later", async () => {
    const { productId, po } = await ordered1000();
    const first = await receive(a, po.id, [line(productId, a.tabletId, { qty: 500, batchNo: "P1" })]);
    expect(first.status).toBe("partial");
    expect(first.receiptNo).toMatch(/^GR-\d{8}-\d{3}$/);

    let d = (await detail(po.id))!;
    expect(d.status).toBe("partial");
    expect(d.lines[0]).toMatchObject({ qty: 1000, receivedQty: 500, remainingQty: 500 });
    expect(d.receipts).toHaveLength(1);
    expect((await stockOf(a, productId)).stock).toBe(500);

    const second = await receive(a, po.id, [line(productId, a.tabletId, { qty: 500, batchNo: "P2" })]);
    expect(second.status).toBe("received");
    d = (await detail(po.id))!;
    expect(d.lines[0]).toMatchObject({ receivedQty: 1000, remainingQty: 0 });
    expect(d.receipts.map((r) => r.lines.map((l) => [l.batchNo, l.qty]))).toEqual([[["P1", 500]], [["P2", 500]]]);
    expect((await stockOf(a, productId)).stock).toBe(1000);
  });

  it("refuses to receive more than what is left and says how much that is; nothing is saved", async () => {
    const { productId, po } = await ordered1000();
    await receive(a, po.id, [line(productId, a.tabletId, { qty: 500, batchNo: "P1" })]);
    await expect(receive(a, po.id, [line(productId, a.tabletId, { qty: 700, batchNo: "P2" })])).rejects.toThrow(/1000 ordered, 500 already received, so only 500 can still be received/);
    expect((await stockOf(a, productId)).stock).toBe(500);
    expect((await detail(po.id))!.receipts).toHaveLength(1);
  });

  it("accepts two batches of one ordered item in a single delivery", async () => {
    const { productId, po, lineId } = await ordered1000();
    await receive(a, po.id, [
      { ...line(productId, a.tabletId, { qty: 300, batchNo: "X1" }), purchaseOrderLineId: lineId },
      { ...line(productId, a.tabletId, { qty: 200, batchNo: "X2" }), purchaseOrderLineId: lineId },
    ]);
    expect((await detail(po.id))!.lines[0]).toMatchObject({ receivedQty: 500, remainingQty: 500 });
    expect(await dbs.admin.select().from(productBatches).where(eq(productBatches.productId, productId))).toHaveLength(2);
  });

  it("records an item that arrived but was not ordered as an extra, without changing the order's progress", async () => {
    const wanted = await newProduct(a);
    const extra = await newProduct(a);
    const po = await newPo(a, [{ productId: wanted, unitId: a.tabletId, qty: 10 }]);
    const r = await receive(a, po.id, [line(wanted, a.tabletId, { qty: 4, batchNo: "W" }), line(extra, a.tabletId, { qty: 3, batchNo: "E" })]);
    expect(r.status).toBe("partial");
    const d = (await detail(po.id))!;
    expect(d.lines[0]).toMatchObject({ receivedQty: 4, remainingQty: 6 });
    expect(d.receipts[0].lines.map((l) => l.planned).sort()).toEqual([false, true]);
    expect((await stockOf(a, extra)).stock).toBe(3);
  });

  it("can be closed when the supplier will not send the rest, and cancelled only before anything arrived", async () => {
    const { productId, po } = await ordered1000();
    await expect(closePurchaseOrder_(po.id)).rejects.toThrow(/Nothing was received yet/);
    await receive(a, po.id, [line(productId, a.tabletId, { qty: 400, batchNo: "C1" })]);
    await expect(cancel(po.id)).rejects.toThrow(/Close the order instead/);
    await closePurchaseOrder_(po.id);
    expect((await detail(po.id))!.status).toBe("closed");
    await expect(receive(a, po.id, [line(productId, a.tabletId, { qty: 1, batchNo: "C2" })])).rejects.toThrow(/no longer open \(it is closed\)/);

    const fresh = await ordered1000();
    await cancel(fresh.po.id);
    expect((await detail(fresh.po.id))!.status).toBe("cancelled");
  });

  it("lets the ordered quantity be corrected, but never below what was received, and keeps received lines", async () => {
    const { productId, po, lineId } = await ordered1000();
    await receive(a, po.id, [line(productId, a.tabletId, { qty: 500, batchNo: "Q1" })]);
    const setQty = (qty: number) => withPharmacy(dbs.app, a.pharmacyId, (tx) => setPurchaseOrderLineQty(tx, a, po.id, lineId, qty));
    await expect(setQty(400)).rejects.toThrow(/500 were already received/);
    await expect(withPharmacy(dbs.app, a.pharmacyId, (tx) => removePurchaseOrderLine(tx, a, po.id, lineId))).rejects.toThrow(/already received/);
    await setQty(500); // nothing is missing any more
    expect((await detail(po.id))!.status).toBe("received");
    await expect(setQty(800)).rejects.toBeInstanceOf(PurchasingError); // a completed order is not edited
  });

  it("two people receiving at the same moment cannot receive more than was ordered", async () => {
    const { productId, po } = await ordered1000();
    const results = await Promise.allSettled([
      receive(a, po.id, [line(productId, a.tabletId, { qty: 600, batchNo: "R1" })]),
      receive(a, po.id, [line(productId, a.tabletId, { qty: 600, batchNo: "R2" })]),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await stockOf(a, productId)).stock).toBe(600);
  });

  it("the order list shows how much of each order has arrived", async () => {
    const { productId, po } = await ordered1000();
    await receive(a, po.id, [line(productId, a.tabletId, { qty: 250, batchNo: "L1" })]);
    const row = (await withPharmacy(dbs.app, a.pharmacyId, (tx) => listPurchaseOrders(tx, a.pharmacyId))).find((o) => o.id === po.id)!;
    expect(row).toMatchObject({ status: "partial", orderedBase: 1000, receivedBase: 250 });
  });

  const closePurchaseOrder_ = (id: number) => withPharmacy(dbs.app, a.pharmacyId, (tx) => closePurchaseOrder(tx, a, id));
  const cancel = (id: number) => withPharmacy(dbs.app, a.pharmacyId, (tx) => cancelPurchaseOrder(tx, a, id));
});
