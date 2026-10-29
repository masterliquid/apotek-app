import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { memberships, paymentMethods, productBatches, products, purchaseOrders, stockMovements, users } from "@/db/schema";
import { SAMPLE_PRODUCTS } from "@/seed/sample-data";
import { sampleEan13, SampleAlreadyExistsError, seedSamplePharmacy } from "@/seed/sample";
import { listProducts } from "@/server/products";
import { commitSale } from "@/server/sales";
import { withPharmacy } from "@/server/tenant";
import { connectTestDbs, uniqueName } from "./helpers";

const dbs = connectTestDbs();
afterAll(() => dbs.close());

describe("sample data seed", () => {
  it("creates a pharmacy owned by the given user, with consistent opening stock", async () => {
    const [owner] = await dbs.admin.insert(users).values({ username: uniqueName("admin"), fullName: "Admin", passwordHash: "x", isPlatformAdmin: true }).returning({ id: users.id });
    const summary = await seedSamplePharmacy(dbs.app, owner.id);
    const pharmacyId = summary.pharmacyId;

    expect(summary).toMatchObject({ products: SAMPLE_PRODUCTS.length, suppliers: 5, customers: 8 });
    expect(SAMPLE_PRODUCTS.length).toBeGreaterThanOrEqual(50);
    expect((await dbs.admin.select().from(memberships).where(eq(memberships.pharmacyId, pharmacyId)))[0]).toMatchObject({ userId: owner.id, role: "owner" });

    // Every PO was received, every product has stock, and the ledger adds up to the batches (no stock without history).
    const orders = await dbs.admin.select().from(purchaseOrders).where(eq(purchaseOrders.pharmacyId, pharmacyId));
    expect(orders.length).toBe(summary.purchaseOrders);
    expect(orders.every((o) => o.status === "received")).toBe(true);
    const list = await withPharmacy(dbs.app, pharmacyId, (tx) => listProducts(tx, pharmacyId));
    expect(list).toHaveLength(SAMPLE_PRODUCTS.length);
    expect(list.every((p) => p.stock > 0 && Number(p.sellPrice) > 0)).toBe(true);
    const mismatches = await dbs.adminPool.query(
      `select b.id from product_batches b where b.pharmacy_id = $1 and b.qty_on_hand <> coalesce((select sum(qty_change) from stock_movements m where m.batch_id = b.id), 0)`,
      [pharmacyId],
    );
    expect(mismatches.rows).toEqual([]);
    const movements = await dbs.admin.select().from(stockMovements).where(eq(stockMovements.pharmacyId, pharmacyId));
    expect(movements.every((m) => m.type === "goods_receipt")).toBe(true);

    // Some batches expire soon (shows the dashboard alert); none are expired.
    const batches = await dbs.admin.select().from(productBatches).where(eq(productBatches.pharmacyId, pharmacyId));
    const today = new Date().toISOString().slice(0, 10);
    expect(batches.every((b) => b.expiryDate! > today)).toBe(true);
    expect(batches.some((b) => b.expiryDate! < new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10))).toBe(true);

    // The sample catalogue is sellable end to end, selling the earlier-expiring batch first.
    const strip = await dbs.adminPool.query(`select p.id, p.sell_price from products p where p.pharmacy_id = $1 and p.name = 'Paracetamol 500 mg'`, [pharmacyId]);
    const unitRows = await dbs.adminPool.query(`select pu.unit_id from product_units pu where pu.product_id = $1`, [strip.rows[0].id]);
    const cash = (await dbs.admin.select().from(paymentMethods).where(eq(paymentMethods.pharmacyId, pharmacyId))).find((m) => m.name === "Tunai")!;
    const sale = await withPharmacy(dbs.app, pharmacyId, (tx) =>
      commitSale(tx, { pharmacyId, userId: owner.id }, { lines: [{ productId: strip.rows[0].id, unitId: unitRows.rows[0].unit_id, qty: 2, discountPct: "0" }] }, [{ paymentMethodId: cash.id, amount: "7000", confirmed: true }]),
    );
    expect(sale.grandTotal).toBe("7000.00"); // 2 strips × Rp 3.500
    const taken = await dbs.adminPool.query(`select b.batch_no, b.expiry_date from stock_movements m join product_batches b on b.id = m.batch_id where m.type = 'sale' and m.document_id = $1`, [sale.saleId]);
    const earliest = (await dbs.admin.select().from(productBatches).where(eq(productBatches.productId, strip.rows[0].id))).sort((a, b) => a.expiryDate!.localeCompare(b.expiryDate!))[0];
    expect(taken.rows[0].batch_no).toBe(earliest.batchNo);

    // Running it again changes nothing.
    await expect(seedSamplePharmacy(dbs.app, owner.id)).rejects.toBeInstanceOf(SampleAlreadyExistsError);
    expect((await dbs.admin.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.pharmacyId, pharmacyId)))[0].n).toBe(SAMPLE_PRODUCTS.length);
  });

  it("generates valid, unique EAN-13 sample barcodes", () => {
    const codes = SAMPLE_PRODUCTS.map((_, i) => sampleEan13(i + 1));
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^899\d{10}$/);
      const sum = [...code.slice(0, 12)].reduce((t, d, i) => t + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
      expect(Number(code[12])).toBe((10 - (sum % 10)) % 10);
    }
  });
});
