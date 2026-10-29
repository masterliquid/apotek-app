import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPharmacyWithOwner } from "@/server/pharmacies";
import { createLookup, createPartner, listLookup, listPartners, updateLookup } from "@/server/master-data";
import { addPackUnit, createProduct, getProductPackUnits, listProducts, ProductError, updateProductPrices } from "@/server/products";
import { withPharmacy } from "@/server/tenant";
import { connectTestDbs, postgresErrorOf, uniqueName } from "./helpers";

const dbs = connectTestDbs();
afterAll(() => dbs.close());

type Setup = { pharmacyId: number; userId: number; categoryId: number; statusId: number; tabletId: number; stripId: number };

async function newPharmacy(): Promise<Setup> {
  const { pharmacyId, ownerUserId } = await createPharmacyWithOwner(
    dbs.app,
    { code: uniqueName("M"), name: uniqueName("Apotek "), owner: { username: uniqueName("o"), fullName: "Owner", password: "owner-password-1" } },
    null,
  );
  const pick = (rows: { id: number; name: string }[], name: string) => rows.find((r) => r.name === name)!.id;
  return withPharmacy(dbs.app, pharmacyId, async (tx) => ({
    pharmacyId,
    userId: ownerUserId,
    categoryId: pick(await listLookup(tx, pharmacyId, "categories"), "Obat Bebas"),
    statusId: pick(await listLookup(tx, pharmacyId, "statuses"), "Ready-Stock"),
    tabletId: pick(await listLookup(tx, pharmacyId, "units"), "Tablet"),
    stripId: pick(await listLookup(tx, pharmacyId, "units"), "Strip"),
  }));
}

const productInput = (s: Setup, code: string) => ({
  code,
  name: "Paracetamol 500mg",
  categoryId: s.categoryId,
  statusId: s.statusId,
  baseUnitId: s.tabletId,
  baseCost: "1000",
  marginPct: "20",
  sellPrice: "1500",
});

let a: Setup;
let b: Setup;
beforeAll(async () => {
  a = await newPharmacy();
  b = await newPharmacy();
});

describe("products", () => {
  it("derives buy and recommended price from the pharmacy markup (legacy rule)", async () => {
    const code = uniqueName("P");
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => createProduct(tx, a, "10.00", productInput(a, code)));
    const [p] = (await withPharmacy(dbs.app, a.pharmacyId, (tx) => listProducts(tx, a.pharmacyId, code)));
    expect(p).toMatchObject({ buyPrice: "1100.00", recommendedPrice: "1320.00", sellPrice: "1500.00", stock: 0 });
  });

  it("recomputes derived prices when the cost changes", async () => {
    const code = uniqueName("P");
    const id = await withPharmacy(dbs.app, a.pharmacyId, (tx) => createProduct(tx, a, "10.00", productInput(a, code)));
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => updateProductPrices(tx, a, "10.00", id, { baseCost: "2000", marginPct: "10", sellPrice: "2500" }));
    const [p] = await withPharmacy(dbs.app, a.pharmacyId, (tx) => listProducts(tx, a.pharmacyId, code));
    expect(p).toMatchObject({ baseCost: "2000.00", buyPrice: "2200.00", recommendedPrice: "2420.00" });
  });

  it("product code is unique within a pharmacy but reusable in another", async () => {
    const code = uniqueName("DUP");
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => createProduct(tx, a, "10", productInput(a, code)));
    const error = await postgresErrorOf(withPharmacy(dbs.app, a.pharmacyId, (tx) => createProduct(tx, a, "10", productInput(a, code))));
    expect(error.code).toBe("23505");
    await expect(withPharmacy(dbs.app, b.pharmacyId, (tx) => createProduct(tx, b, "10", productInput(b, code)))).resolves.toBeTypeOf("number");
  });

  it("a pharmacy cannot use another pharmacy's category", async () => {
    const error = await postgresErrorOf(withPharmacy(dbs.app, b.pharmacyId, (tx) => createProduct(tx, b, "10", { ...productInput(b, uniqueName("X")), categoryId: a.categoryId })));
    expect(error.code).toBe("23503");
  });

  it("each pharmacy only lists its own products", async () => {
    const code = uniqueName("ONLYA");
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => createProduct(tx, a, "10", productInput(a, code)));
    expect(await withPharmacy(dbs.app, b.pharmacyId, (tx) => listProducts(tx, b.pharmacyId, code))).toEqual([]);
  });
});

describe("product list limits", () => {
  it("browsing lists are capped, pickers can ask for everything", async () => {
    for (let i = 0; i < 3; i++) await withPharmacy(dbs.app, b.pharmacyId, (tx) => createProduct(tx, b, "10", productInput(b, uniqueName("LIM"))));
    const capped = await withPharmacy(dbs.app, b.pharmacyId, (tx) => listProducts(tx, b.pharmacyId, undefined, 2));
    const all = await withPharmacy(dbs.app, b.pharmacyId, (tx) => listProducts(tx, b.pharmacyId, undefined, 20000));
    expect(capped).toHaveLength(2);
    expect(all.length).toBeGreaterThanOrEqual(3);
  });
});

describe("pack units", () => {
  it("stores a pack factor and rejects invalid ones", async () => {
    const id = await withPharmacy(dbs.app, a.pharmacyId, (tx) => createProduct(tx, a, "10", productInput(a, uniqueName("PK"))));
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => addPackUnit(tx, a, id, { unitId: a.stripId, factor: 10 }));
    expect(await withPharmacy(dbs.app, a.pharmacyId, (tx) => getProductPackUnits(tx, a.pharmacyId, id))).toMatchObject([{ unitName: "Strip", factor: 10 }]);

    const badFactor = await postgresErrorOf(withPharmacy(dbs.app, a.pharmacyId, (tx) => addPackUnit(tx, a, id, { unitId: a.stripId, factor: 1 })));
    expect(badFactor.code).toBe("23514");
    await expect(withPharmacy(dbs.app, a.pharmacyId, (tx) => addPackUnit(tx, a, id, { unitId: a.tabletId, factor: 5 }))).rejects.toBeInstanceOf(ProductError);
  });
});

describe("master data", () => {
  it("lookup names are unique per pharmacy and can be renamed or deactivated", async () => {
    const name = uniqueName("Kategori ");
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => createLookup(tx, a.pharmacyId, a.userId, "categories", name));
    const error = await postgresErrorOf(withPharmacy(dbs.app, a.pharmacyId, (tx) => createLookup(tx, a.pharmacyId, a.userId, "categories", name)));
    expect(error.code).toBe("23505");
    const row = (await withPharmacy(dbs.app, a.pharmacyId, (tx) => listLookup(tx, a.pharmacyId, "categories"))).find((r) => r.name === name)!;
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => updateLookup(tx, a.pharmacyId, a.userId, "categories", row.id, { isActive: false }));
    const after = (await withPharmacy(dbs.app, a.pharmacyId, (tx) => listLookup(tx, a.pharmacyId, "categories"))).find((r) => r.id === row.id)!;
    expect(after.isActive).toBe(false);
  });

  it("suppliers are not visible to another pharmacy", async () => {
    const name = uniqueName("Sup ");
    await withPharmacy(dbs.app, a.pharmacyId, (tx) => createPartner(tx, a.pharmacyId, a.userId, "suppliers", { name, phone: "021" }));
    expect((await withPharmacy(dbs.app, b.pharmacyId, (tx) => listPartners(tx, b.pharmacyId, "suppliers"))).some((s) => s.name === name)).toBe(false);
    expect((await withPharmacy(dbs.app, a.pharmacyId, (tx) => listPartners(tx, a.pharmacyId, "suppliers"))).some((s) => s.name === name)).toBe(true);
  });
});
