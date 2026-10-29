import fs from "node:fs";
import pg from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paymentMethods, pharmacies, users } from "@/db/schema";
import { importLegacy, type ImportOptions } from "@/import/legacy-import";
import { parseMysqlDump } from "@/import/mysql-dump";
import { authenticate } from "@/server/auth/login";
import { hashPassword } from "@/server/auth/password";
import { createPharmacyWithOwner } from "@/server/pharmacies";
import { createProduct } from "@/server/products";
import { listProducts } from "@/server/products";
import { listLookup } from "@/server/master-data";
import { commitSale } from "@/server/sales";
import { withPharmacy } from "@/server/tenant";
import { connectTestDbs, uniqueName } from "./helpers";

const dbs = connectTestDbs();
const data = parseMysqlDump(fs.readFileSync("tests/fixtures/legacy-sample.sql", "utf8"));
const legacy = (table: string) => data.get(table) ?? [];
let client: pg.Client;
let passwordHash: string;

beforeAll(async () => {
  client = new pg.Client({ connectionString: process.env.TEST_DATABASE_ADMIN_URL });
  await client.connect();
  passwordHash = await hashPassword("test-owner-password");
});
afterAll(async () => {
  await client.end();
  await dbs.close();
});

const options = (over: Partial<ImportOptions> = {}): ImportOptions => ({
  pharmacyCode: uniqueName("IMP").toUpperCase(),
  pharmacyName: "Imported test",
  owner: { username: uniqueName("owner"), fullName: "Owner", passwordHash },
  restoreReturnsFrom: "2017-04-01",
  dryRun: false,
  ...over,
});
const count = async (table: string, pharmacyId: number) => Number((await client.query(`select count(*) as n from "${table}" where pharmacy_id = $1`, [pharmacyId])).rows[0].n);
const pharmacyIdOf = async (code: string) => (await dbs.admin.select().from(pharmacies).where(eq(pharmacies.code, code)))[0].id;

describe("legacy import", () => {
  it("a dry run reports what would be imported and writes nothing", async () => {
    const o = options({ dryRun: true });
    const report = await importLegacy(client, data, o);
    expect(report.counts.products).toBe(legacy("t2_barang").length);
    expect(report.counts.sales).toBe(legacy("t3_penjualan").length);
    expect((await dbs.admin.select().from(pharmacies).where(eq(pharmacies.code, o.pharmacyCode))).length).toBe(0);
  });

  it("imports master data, stock, sales, returns, purchasing and opname and reconciles", async () => {
    const o = options();
    const report = await importLegacy(client, data, o);
    const pharmacyId = await pharmacyIdOf(o.pharmacyCode);

    expect(report.reconciliation.some((l) => l.includes("must be 0"))).toBe(true);
    expect(await count("products", pharmacyId)).toBe(legacy("t2_barang").length);
    expect(await count("suppliers", pharmacyId)).toBe(legacy("t1_supplier").length);
    expect(await count("customers", pharmacyId)).toBe(legacy("t2_costumer").length);
    expect(await count("sales", pharmacyId)).toBe(legacy("t3_penjualan").length);
    expect(await count("sale_lines", pharmacyId)).toBe(legacy("t3_penjualan_item").length);
    expect(await count("sales_returns", pharmacyId)).toBe(legacy("t3_retur_penjualan").length);
    expect(await count("purchase_orders", pharmacyId)).toBe(legacy("t3_purchase_order").length);
    expect(await count("goods_receipts", pharmacyId)).toBe(legacy("t3_purchase_units").length);
    expect(await count("goods_receipt_lines", pharmacyId)).toBe(legacy("t3_purchase_units_item").length);
    expect(await count("stock_opnames", pharmacyId)).toBe(legacy("t3_stock_opname").length);

    // every product has its LEGACY batch; stock equals the legacy stock numbers
    const legacyStock = legacy("t2_barang").reduce((t, b) => t + Math.max(Number(b.BARANG_JUMLAH_STOCK__), 0), 0);
    expect(Number((await client.query("select sum(qty_on_hand) as n from product_batches where pharmacy_id = $1", [pharmacyId])).rows[0].n)).toBe(legacyStock);
    expect((await client.query("select count(*)::int as n from product_batches where pharmacy_id = $1 and batch_no = 'LEGACY' and expiry_date is null", [pharmacyId])).rows[0].n).toBe(legacy("t2_barang").length);

    // completed sales keep their receipt numbers and totals; each has stock allocations
    const first = legacy("t3_penjualan").find((s) => s.FLAG_PK__ === "2")!;
    const row = (await client.query("select status, grand_total::text as grand, paid_total::text as paid from sales where pharmacy_id = $1 and receipt_no = $2", [pharmacyId, first.PENJUALAN_NO_STRUK__])).rows[0];
    expect(row.status).toBe("committed");
    expect(Number(row.grand)).toBeCloseTo(Number(first.PENJUALAN_GRAND_TOTAL__), 2);
    expect((await client.query("select count(*)::int as n from sale_lines l join sales s on s.id = l.sale_id where s.pharmacy_id = $1 and s.status = 'committed' and not exists (select 1 from sale_line_allocations a where a.sale_line_id = l.id)", [pharmacyId])).rows[0].n).toBe(0);

    // received orders are linked to their deliveries, and no order is left "waiting" when a delivery exists
    expect((await client.query("select count(*)::int as n from purchase_orders p where p.pharmacy_id = $1 and p.status = 'open' and exists (select 1 from goods_receipts r where r.purchase_order_id = p.id)", [pharmacyId])).rows[0].n).toBe(0);
  });

  it("the owner can log in, and the imported pharmacy works with the normal app code", async () => {
    const o = options();
    await importLegacy(client, data, o);
    const pharmacyId = await pharmacyIdOf(o.pharmacyCode);
    const owner = (await dbs.admin.select().from(users).where(eq(users.username, o.owner.username)))[0];
    expect(await authenticate(dbs.app, o.owner.username, "test-owner-password")).toEqual({ userId: owner.id });
    expect(await authenticate(dbs.app, o.owner.username, "wrong")).toBeNull();

    // list and sell an imported product (selling from the LEGACY batch, which has no expiry date)
    const list = await withPharmacy(dbs.app, pharmacyId, (tx) => listProducts(tx, pharmacyId));
    expect(list).toHaveLength(legacy("t2_barang").length);
    const product = list.find((p) => p.stock >= 2 && Number(p.sellPrice) > 0)!;
    const cash = (await dbs.admin.select().from(paymentMethods).where(eq(paymentMethods.pharmacyId, pharmacyId))).find((m) => m.name === "Tunai")!;
    const ctx = { pharmacyId, userId: owner.id };
    const sale = await withPharmacy(dbs.app, pharmacyId, (tx) => commitSale(tx, ctx, { lines: [{ productId: product.id, unitId: product.baseUnitId, qty: 2, discountPct: "0" }] }, [{ paymentMethodId: cash.id, amount: String(Number(product.sellPrice) * 2 + 1000), confirmed: true }]));
    expect(sale.receiptNo).toMatch(/^\d{11}$/);
    expect((await withPharmacy(dbs.app, pharmacyId, (tx) => listProducts(tx, pharmacyId))).find((p) => p.id === product.id)!.stock).toBe(product.stock - 2);

    // identity sequences were moved past the imported ids, so creating new rows works
    const units = await withPharmacy(dbs.app, pharmacyId, (tx) => listLookup(tx, pharmacyId, "units"));
    const cats = await withPharmacy(dbs.app, pharmacyId, (tx) => listLookup(tx, pharmacyId, "categories"));
    const statuses = await withPharmacy(dbs.app, pharmacyId, (tx) => listLookup(tx, pharmacyId, "statuses"));
    await expect(withPharmacy(dbs.app, pharmacyId, (tx) => createProduct(tx, ctx, "10", { code: "NEW-1", name: "New", categoryId: cats[0].id, statusId: statuses[0].id, baseUnitId: units[0].id, baseCost: "1", marginPct: "10", sellPrice: "2" }))).resolves.toBeTypeOf("number");
  });

  it("restores the original quantity of lines that later returns had reduced (legacy patch v1.8)", async () => {
    const early = options({ restoreReturnsFrom: "2015-01-01" }); // treat every return as made after the patch
    const late = options();
    const reportEarly = await importLegacy(client, data, early);
    await importLegacy(client, data, late);
    const idEarly = await pharmacyIdOf(early.pharmacyCode);
    const idLate = await pharmacyIdOf(late.pharmacyCode);
    const qty = async (id: number) => Number((await client.query("select sum(qty) as n from sale_lines where pharmacy_id = $1", [id])).rows[0].n);
    const returned = legacy("t3_retur_penjualan").reduce((t, r) => t + Number(r.RETUR_JUAL_JUMLAH__), 0);
    expect(await qty(idEarly)).toBe((await qty(idLate)) + returned);
    expect(reportEarly.notes.join("\n")).toMatch(/\d+ sales had their original quantities restored/);
    // a return never exceeds what was sold
    expect((await client.query("select count(*)::int as n from sales_return_lines r join sale_line_allocations a on a.id = r.sale_line_allocation_id where r.pharmacy_id = $1 and r.qty_base > a.qty_base", [idEarly])).rows[0].n).toBe(0);
  });

  it("refuses to import into a pharmacy code that exists and changes nothing", async () => {
    const o = options();
    await importLegacy(client, data, o);
    const before = await count("products", await pharmacyIdOf(o.pharmacyCode));
    await expect(importLegacy(client, data, { ...o, owner: { ...o.owner, username: uniqueName("other") } })).rejects.toThrow(/already exists/);
    expect(await count("products", await pharmacyIdOf(o.pharmacyCode))).toBe(before);
  });

  it("fills an existing empty pharmacy, reusing same-named units and payment methods, and refuses a pharmacy that already has data", async () => {
    const { pharmacyId } = await createPharmacyWithOwner(dbs.app, { code: uniqueName("EX"), name: "Existing", owner: { username: uniqueName("o"), fullName: "Owner", password: "owner-password-1" } }, null);
    const code = (await dbs.admin.select().from(pharmacies).where(eq(pharmacies.id, pharmacyId)))[0].code;
    const o = options({ existingPharmacy: true, pharmacyCode: code });
    const report = await importLegacy(client, data, o);
    expect(report.notes.join("\n")).toMatch(/Imported into the existing pharmacy "Existing"/);
    expect(await count("products", pharmacyId)).toBe(legacy("t2_barang").length);
    expect(await count("payment_methods", pharmacyId)).toBe(4); // Tunai, Transfer Bank, QRIS, Kartu Debit were reused, not duplicated
    for (const table of ["units", "categories", "product_statuses"]) {
      const row = (await client.query(`select count(*)::int as n, count(distinct lower(name))::int as d from "${table}" where pharmacy_id = $1`, [pharmacyId])).rows[0];
      expect(row.n).toBe(row.d);
    }
    expect((await client.query("select count(*)::int as n from sale_payments p join payment_methods m on m.id = p.payment_method_id where p.pharmacy_id = $1 and m.name = 'Tunai'", [pharmacyId])).rows[0].n).toBeGreaterThan(0);
    await expect(importLegacy(client, data, o)).rejects.toThrow(/already has products/);
    await expect(importLegacy(client, data, options({ existingPharmacy: true, pharmacyCode: "NO-SUCH" }))).rejects.toThrow(/no pharmacy with code/);
  });
});
