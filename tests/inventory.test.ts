import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adjustmentReasons, paymentMethods, productBatches, stockMovements, stockOpnames } from "@/db/schema";
import { createAdjustment, addProductToOpname, commitOpname, createOpname, getOpname, InventoryError, listBatches, removeOpnameLine, saveOpnameCounts } from "@/server/inventory";
import { listLookup } from "@/server/master-data";
import { createPharmacyWithOwner } from "@/server/pharmacies";
import { createProduct } from "@/server/products";
import { commitSale } from "@/server/sales";
import { withPharmacy } from "@/server/tenant";
import { connectTestDbs, uniqueName } from "./helpers";

const dbs = connectTestDbs();
afterAll(() => dbs.close());

type Setup = { pharmacyId: number; userId: number; tabletId: number; categoryId: number; statusId: number; cashId: number; reasonId: number };

async function newPharmacy(): Promise<Setup> {
  const { pharmacyId, ownerUserId } = await createPharmacyWithOwner(
    dbs.app,
    { code: uniqueName("I"), name: uniqueName("Apotek "), owner: { username: uniqueName("o"), fullName: "Owner", password: "owner-password-1" } },
    null,
  );
  const methods = await dbs.admin.select().from(paymentMethods).where(eq(paymentMethods.pharmacyId, pharmacyId));
  const [reason] = await dbs.admin.select().from(adjustmentReasons).where(eq(adjustmentReasons.pharmacyId, pharmacyId));
  return withPharmacy(dbs.app, pharmacyId, async (tx) => {
    const id = async (kind: "units" | "categories" | "statuses", name: string) => (await listLookup(tx, pharmacyId, kind)).find((r) => r.name === name)!.id;
    return { pharmacyId, userId: ownerUserId, tabletId: await id("units", "Tablet"), categoryId: await id("categories", "Obat Bebas"), statusId: await id("statuses", "Ready-Stock"), cashId: methods.find((m) => m.name === "Tunai")!.id, reasonId: reason.id };
  });
}

// Product (cost 100/tablet, sells 200) with batches given as [batchNo, qty]; returns product id and batch ids by number.
async function newProduct(s: Setup, batches: [string, number][]) {
  const productId = await withPharmacy(dbs.app, s.pharmacyId, (tx) =>
    createProduct(tx, s, "10", { code: uniqueName("P"), name: "Paracetamol", categoryId: s.categoryId, statusId: s.statusId, baseUnitId: s.tabletId, baseCost: "100", marginPct: "20", sellPrice: "200" }),
  );
  const ids: Record<string, number> = {};
  for (const [batchNo, qtyOnHand] of batches) {
    const [row] = await dbs.admin.insert(productBatches).values({ pharmacyId: s.pharmacyId, productId, batchNo, expiryDate: "2099-12-31", qtyOnHand, unitCost: "100" }).returning({ id: productBatches.id });
    ids[batchNo] = row.id;
  }
  return { productId, ids };
}

const qty = async (batchId: number) => (await dbs.admin.select().from(productBatches).where(eq(productBatches.id, batchId)))[0].qtyOnHand;
const adjust = (s: Setup, batchId: number, qtyChange: number) => withPharmacy(dbs.app, s.pharmacyId, (tx) => createAdjustment(tx, s, { batchId, reasonId: s.reasonId, qtyChange, note: "test" }));
const sellTablets = (s: Setup, productId: number, n: number) =>
  withPharmacy(dbs.app, s.pharmacyId, (tx) => commitSale(tx, s, { lines: [{ productId, unitId: s.tabletId, qty: n, discountPct: "0" }] }, [{ paymentMethodId: s.cashId, amount: "100000", confirmed: true }]));
const opnameOf = (s: Setup, id: number) => withPharmacy(dbs.app, s.pharmacyId, (tx) => getOpname(tx, s.pharmacyId, id));

let a: Setup;
let b: Setup;
beforeAll(async () => {
  a = await newPharmacy();
  b = await newPharmacy();
});

describe("stock adjustments", () => {
  it("adds or removes stock on a batch and writes the ledger", async () => {
    const { ids } = await newProduct(a, [["B1", 10]]);
    const lostId = await adjust(a, ids.B1, -3);
    await adjust(a, ids.B1, 5);
    expect(await qty(ids.B1)).toBe(12);
    const moves = await dbs.admin.select().from(stockMovements).where(eq(stockMovements.batchId, ids.B1));
    expect(moves.map((m) => [m.type, m.qtyChange])).toEqual([["adjustment", -3], ["adjustment", 5]]);
    expect(moves[0].documentId).toBe(lostId);
  });

  it("refuses to go below zero or to adjust by 0, leaving stock unchanged", async () => {
    const { ids } = await newProduct(a, [["B1", 4]]);
    await expect(adjust(a, ids.B1, -5)).rejects.toThrow(/below zero/);
    await expect(adjust(a, ids.B1, 0)).rejects.toBeInstanceOf(InventoryError);
    expect(await qty(ids.B1)).toBe(4);
    expect(await dbs.admin.select().from(stockMovements).where(eq(stockMovements.batchId, ids.B1))).toEqual([]);
  });

  it("cannot touch another pharmacy's batch", async () => {
    const { ids } = await newProduct(a, [["B1", 4]]);
    await expect(adjust(b, ids.B1, 1)).rejects.toThrow();
    expect(await qty(ids.B1)).toBe(4);
  });
});

describe("stock opname", () => {
  it("counts, commits the difference, values it at batch cost and writes the ledger", async () => {
    const { productId, ids } = await newProduct(a, [["B1", 10], ["B2", 5]]);
    const { id, opnameNo } = await withPharmacy(dbs.app, a.pharmacyId, (tx) => createOpname(tx, a));
    expect(opnameNo).toMatch(/^SO-\d{8}-\d{3}$/);
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => addProductToOpname(tx, a, id, productId));

    let o = (await opnameOf(a, id))!;
    expect(o.lines.map((l) => [l.batchNo, l.systemQty, l.physicalQty])).toEqual([["B1", 10, 10], ["B2", 5, 5]]);
    const line = (no: string) => o.lines.find((l) => l.batchNo === no)!.id;
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => saveOpnameCounts(tx, a, id, [{ lineId: line("B1"), physicalQty: 8 }, { lineId: line("B2"), physicalQty: 7 }]));

    const result = await withPharmacy(dbs.app, a.pharmacyId, (tx) => commitOpname(tx, a, id));
    expect(result.totalDifferenceValue).toBe("0.00"); // −2×100 + 2×100
    expect([await qty(ids.B1), await qty(ids.B2)]).toEqual([8, 7]);
    o = (await opnameOf(a, id))!;
    expect(o.status).toBe("committed");
    const moves = await dbs.admin.select().from(stockMovements).where(eq(stockMovements.documentId, id));
    expect(moves.filter((m) => m.type === "stock_opname").map((m) => m.qtyChange).sort()).toEqual([-2, 2]);
  });

  it("keeps sales made between counting and committing (applies the difference, not the counted number)", async () => {
    const { productId, ids } = await newProduct(a, [["B1", 10]]);
    const { id } = await withPharmacy(dbs.app, a.pharmacyId, (tx) => createOpname(tx, a));
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => addProductToOpname(tx, a, id, productId));
    const lineId = (await opnameOf(a, id))!.lines[0].id;
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => saveOpnameCounts(tx, a, id, [{ lineId, physicalQty: 8 }])); // 2 missing

    await sellTablets(a, productId, 3); // system now 7
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => commitOpname(tx, a, id));
    expect(await qty(ids.B1)).toBe(5); // 7 − 2, not 8
  });

  it("applies nothing and asks for a recount when stock changed so much that the difference no longer fits", async () => {
    const { productId, ids } = await newProduct(a, [["B1", 10], ["B2", 10]]);
    const { id } = await withPharmacy(dbs.app, a.pharmacyId, (tx) => createOpname(tx, a));
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => addProductToOpname(tx, a, id, productId));
    const o = (await opnameOf(a, id))!;
    const counts = o.lines.map((l) => ({ lineId: l.id, physicalQty: l.batchNo === "B1" ? 11 : 0 })); // B1 +1, B2 −10
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => saveOpnameCounts(tx, a, id, counts));
    await adjust(a, ids.B2, -4); // B2 now 6: removing 10 would go negative

    await expect(withPharmacy(dbs.app, a.pharmacyId, (tx) => commitOpname(tx, a, id))).rejects.toThrow(/Recount/);
    expect([await qty(ids.B1), await qty(ids.B2)]).toEqual([10, 6]); // B1's +1 was rolled back too
    expect((await opnameOf(a, id))!.status).toBe("pending");
  });

  it("can be committed once only, even when two people press commit together", async () => {
    const { productId, ids } = await newProduct(a, [["B1", 10]]);
    const { id } = await withPharmacy(dbs.app, a.pharmacyId, (tx) => createOpname(tx, a));
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => addProductToOpname(tx, a, id, productId));
    const lineId = (await opnameOf(a, id))!.lines[0].id;
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => saveOpnameCounts(tx, a, id, [{ lineId, physicalQty: 7 }]));

    const results = await Promise.allSettled([withPharmacy(dbs.app, a.pharmacyId, (tx) => commitOpname(tx, a, id)), withPharmacy(dbs.app, a.pharmacyId, (tx) => commitOpname(tx, a, id))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await qty(ids.B1)).toBe(7);
    await expect(withPharmacy(dbs.app, a.pharmacyId, (tx) => saveOpnameCounts(tx, a, id, [{ lineId, physicalQty: 1 }]))).rejects.toThrow(/already committed/);
  });

  it("an empty opname cannot be committed; lines can be removed while pending", async () => {
    const { productId } = await newProduct(a, [["B1", 3]]);
    const { id } = await withPharmacy(dbs.app, a.pharmacyId, (tx) => createOpname(tx, a));
    await expect(withPharmacy(dbs.app, a.pharmacyId, (tx) => commitOpname(tx, a, id))).rejects.toThrow(/at least one/);
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => addProductToOpname(tx, a, id, productId));
    const lineId = (await opnameOf(a, id))!.lines[0].id;
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => removeOpnameLine(tx, a.pharmacyId, id, lineId));
    expect((await opnameOf(a, id))!.lines).toEqual([]);
  });

  it("another pharmacy cannot see or commit it", async () => {
    const { productId } = await newProduct(a, [["B1", 3]]);
    const { id } = await withPharmacy(dbs.app, a.pharmacyId, (tx) => createOpname(tx, a));
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => addProductToOpname(tx, a, id, productId));
    expect(await opnameOf(b, id)).toBeNull();
    await expect(withPharmacy(dbs.app, b.pharmacyId, (tx) => commitOpname(tx, b, id))).rejects.toThrow(/not found/);
    expect((await dbs.admin.select().from(stockOpnames).where(eq(stockOpnames.id, id)))[0].status).toBe("pending");
    expect((await withPharmacy(dbs.app, b.pharmacyId, (tx) => listBatches(tx, b.pharmacyId))).some((x) => x.productId === productId)).toBe(false);
  });
});
