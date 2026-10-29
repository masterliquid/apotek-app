import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, productBatches, products, productStatuses, saleLines, sales, suppliers, units } from "@/db/schema";
import { createPharmacyWithOwner } from "@/server/pharmacies";
import { withPharmacy } from "@/server/tenant";
import { connectTestDbs, postgresErrorOf, uniqueName } from "./helpers";

const dbs = connectTestDbs();
afterAll(() => dbs.close());

let pharmacyA: number;
let pharmacyB: number;

async function newPharmacy() {
  const { pharmacyId } = await createPharmacyWithOwner(
    dbs.app,
    { code: uniqueName("T"), name: uniqueName("Apotek "), owner: { username: uniqueName("o"), fullName: "Owner", password: "owner-password-1" } },
    null,
  );
  return pharmacyId;
}

// Creates a product (with its lookups) directly as the owner role, bypassing RLS, for test setup.
async function seedProduct(pharmacyId: number) {
  const [cat] = await dbs.admin.select({ id: categories.id }).from(categories).where(eq(categories.pharmacyId, pharmacyId)).limit(1);
  const [unit] = await dbs.admin.select({ id: units.id }).from(units).where(eq(units.pharmacyId, pharmacyId)).limit(1);
  const [status] = await dbs.admin.select({ id: productStatuses.id }).from(productStatuses).where(eq(productStatuses.pharmacyId, pharmacyId)).limit(1);
  const [product] = await dbs.admin
    .insert(products)
    .values({
      pharmacyId,
      code: uniqueName("P"),
      name: "Paracetamol 500mg",
      categoryId: cat.id,
      statusId: status.id,
      baseUnitId: unit.id,
      baseCost: "100",
      buyPrice: "110",
      marginPct: "20",
      recommendedPrice: "132",
      sellPrice: "150",
    })
    .returning({ id: products.id, baseUnitId: products.baseUnitId });
  return product;
}

beforeAll(async () => {
  pharmacyA = await newPharmacy();
  pharmacyB = await newPharmacy();
  await dbs.admin.insert(suppliers).values([
    { pharmacyId: pharmacyA, name: "Supplier of A" },
    { pharmacyId: pharmacyB, name: "Supplier of B" },
  ]);
});

describe("pharmacy data isolation (Row-Level Security)", () => {
  it("only shows the current pharmacy's rows, even without a WHERE clause", async () => {
    const rows = await withPharmacy(dbs.app, pharmacyA, (tx) => tx.select({ name: suppliers.name, pharmacyId: suppliers.pharmacyId }).from(suppliers));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.pharmacyId === pharmacyA)).toBe(true);
  });

  it("shows nothing when no pharmacy is set (fail closed)", async () => {
    const rows = await dbs.app.select().from(suppliers);
    expect(rows).toEqual([]);
  });

  it("rejects writing a row for another pharmacy", async () => {
    const error = await postgresErrorOf(withPharmacy(dbs.app, pharmacyA, (tx) => tx.insert(suppliers).values({ pharmacyId: pharmacyB, name: "sneaky" })));
    expect(error.code).toBe("42501");
    expect(error.message).toMatch(/row-level security/i);
  });

  it("cannot update or delete another pharmacy's rows", async () => {
    const updated = await withPharmacy(dbs.app, pharmacyA, (tx) =>
      tx.update(suppliers).set({ name: "hacked" }).where(eq(suppliers.pharmacyId, pharmacyB)).returning({ id: suppliers.id }),
    );
    expect(updated).toEqual([]);
    const deleted = await withPharmacy(dbs.app, pharmacyA, (tx) => tx.delete(suppliers).where(eq(suppliers.pharmacyId, pharmacyB)).returning({ id: suppliers.id }));
    expect(deleted).toEqual([]);
  });

  it("composite foreign keys stop a row from pointing at another pharmacy's data", async () => {
    const productOfB = await seedProduct(pharmacyB);
    const [saleOfA] = await dbs.admin.insert(sales).values({ pharmacyId: pharmacyA }).returning({ id: sales.id });
    // Even as the owner role (no RLS), the database refuses the cross-pharmacy reference.
    const error = await postgresErrorOf(
      dbs.admin.insert(saleLines).values({
        pharmacyId: pharmacyA,
        saleId: saleOfA.id,
        productId: productOfB.id,
        unitId: productOfB.baseUnitId,
        unitFactor: 1,
        qty: 1,
        qtyBase: 1,
        unitPrice: "150",
        lineTotal: "150",
      }),
    );
    expect(error.code).toBe("23503"); // foreign_key_violation
    expect(error.message).toMatch(/sale_lines_product_fk/);
  });

  it("every table with a pharmacy_id column has RLS enabled (except login tables)", async () => {
    const result = await dbs.adminPool.query<{ table_name: string; rls: boolean }>(`
      SELECT c.table_name, cl.relrowsecurity AS rls
      FROM information_schema.columns c
      JOIN pg_class cl ON cl.relname = c.table_name AND cl.relkind = 'r'
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      WHERE c.table_schema = 'public' AND c.column_name = 'pharmacy_id'
        AND c.table_name NOT IN ('memberships', 'sessions')
    `);
    expect(result.rows.length).toBeGreaterThan(25);
    expect(result.rows.filter((r) => !r.rls).map((r) => r.table_name)).toEqual([]);
  });

  it("the app role cannot bypass RLS", async () => {
    const [row] = (await dbs.app.execute(sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`)).rows as {
      rolsuper: boolean;
      rolbypassrls: boolean;
    }[];
    expect(row).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});

describe("stock integrity constraints", () => {
  it("batch stock can never go negative", async () => {
    const product = await seedProduct(pharmacyA);
    const [batch] = await dbs.admin
      .insert(productBatches)
      .values({ pharmacyId: pharmacyA, productId: product.id, batchNo: "B1", unitCost: "100", qtyOnHand: 5 })
      .returning({ id: productBatches.id });
    const error = await postgresErrorOf(
      withPharmacy(dbs.app, pharmacyA, (tx) => tx.update(productBatches).set({ qtyOnHand: sql`${productBatches.qtyOnHand} - 6` }).where(eq(productBatches.id, batch.id))),
    );
    expect(error.code).toBe("23514"); // check_violation
    expect(error.message).toMatch(/product_batches_qty_non_negative/);
  });

  it("the stock ledger is append-only for the app role", async () => {
    const error = await postgresErrorOf(withPharmacy(dbs.app, pharmacyA, (tx) => tx.execute(sql`delete from stock_movements`)));
    expect(error.code).toBe("42501"); // insufficient_privilege
    expect(error.message).toMatch(/permission denied/i);
  });
});
