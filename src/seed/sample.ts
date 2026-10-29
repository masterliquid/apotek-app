import Decimal from "decimal.js";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { pharmacies } from "@/db/schema";
import { dayInPharmacyTime } from "@/server/counters";
import { addDays } from "@/server/dates";
import { createLookup, createPartner, listLookup, listPartners } from "@/server/master-data";
import { toMoney } from "@/server/money";
import { createPharmacyForExistingUser } from "@/server/pharmacies";
import { addPackUnit, createProduct } from "@/server/products";
import { addPurchaseOrderLine, createPurchaseOrder, receiveGoods, type ReceiptLineInput } from "@/server/purchasing";
import { withPharmacy } from "@/server/tenant";
import { EXTRA_CATEGORIES, EXTRA_UNITS, SAMPLE_CUSTOMERS, SAMPLE_PHARMACY, SAMPLE_PRODUCTS, SAMPLE_SUPPLIERS, type SampleProduct } from "./sample-data";

export class SampleAlreadyExistsError extends Error {
  constructor() {
    super(`A pharmacy with code ${SAMPLE_PHARMACY.code} already exists; nothing was changed.`);
  }
}

// Same legacy pricing chain the app uses: buy price = cost + 10%, recommended = buy price + margin.
// Sample margin is 25%, so cost = selling price / (1.10 × 1.25).
const MARGIN_PCT = "25";
const MARKUP_PCT = "10.00";

// Sample EAN-13: "899" + 9 digits + check digit. Valid for scanners, but not the real product barcodes.
export function sampleEan13(sequence: number): string {
  const body = `899${String(1000_00000 + sequence).padStart(9, "0")}`;
  const sum = [...body].reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

function priceFor(p: SampleProduct) {
  const factor = p.priceUnit ? (p.packs ?? []).find(([unit]) => unit === p.priceUnit)?.[1] ?? 1 : 1;
  const baseSell = new Decimal(p.price).div(factor);
  return { baseSell: toMoney(baseSell), baseCost: toMoney(baseSell.div(new Decimal(1.1).mul(1.25))) };
}

// Splits a product's stock into batches. Most products get an older (earlier-expiry) batch and a newer one, so the
// POS visibly sells the older batch first (FEFO); products flagged "soon" get a batch expiring in a few weeks.
function batchesFor(p: SampleProduct, index: number, today: string): { batchNo: string; expiryDate: string; qty: number }[] {
  const tag = `${today.slice(2, 4)}${today.slice(5, 7)}-${String(index + 1).padStart(2, "0")}`;
  if (p.stock < 5) return [{ batchNo: `${tag}A`, expiryDate: addDays(today, 540), qty: p.stock }];
  const earlyShare = p.expiry === "soon" ? 0.4 : 0.3;
  const early = Math.max(1, Math.floor(p.stock * earlyShare));
  const earlyDays = p.expiry === "soon" ? 15 + ((index * 7) % 40) : 60 + ((index * 53) % 150);
  return [
    { batchNo: `${tag}A`, expiryDate: addDays(today, earlyDays), qty: early },
    { batchNo: `${tag}B`, expiryDate: addDays(today, 300 + ((index * 37) % 400)), qty: p.stock - early },
  ];
}

export type SeedSummary = { pharmacyId: number; products: number; suppliers: number; customers: number; purchaseOrders: number; batches: number };

// Creates the "Apotek Contoh Sehat" pharmacy owned by `ownerUserId` and fills it with sample master data and opening
// stock. Everything goes through the normal services (products, purchase orders, goods receipts), so the stock ledger,
// batches and costs are exactly what the app itself would have produced.
export async function seedSamplePharmacy(db: Db, ownerUserId: number, now = new Date()): Promise<SeedSummary> {
  const [existing] = await db.select({ id: pharmacies.id }).from(pharmacies).where(eq(pharmacies.code, SAMPLE_PHARMACY.code));
  if (existing) throw new SampleAlreadyExistsError();

  const { pharmacyId } = await createPharmacyForExistingUser(db, SAMPLE_PHARMACY, ownerUserId);
  const ctx = { pharmacyId, userId: ownerUserId };
  const today = dayInPharmacyTime(now);

  // 1. Lookups, suppliers, customers
  await withPharmacy(db, pharmacyId, async (tx) => {
    for (const name of EXTRA_CATEGORIES) await createLookup(tx, pharmacyId, ownerUserId, "categories", name);
    for (const name of EXTRA_UNITS) await createLookup(tx, pharmacyId, ownerUserId, "units", name);
    for (const s of SAMPLE_SUPPLIERS) await createPartner(tx, pharmacyId, ownerUserId, "suppliers", s);
    for (const c of SAMPLE_CUSTOMERS) await createPartner(tx, pharmacyId, ownerUserId, "customers", c);
  });

  // 2. Products with pack units
  const productIds: number[] = [];
  await withPharmacy(db, pharmacyId, async (tx) => {
    const idOf = async (kind: "categories" | "units" | "statuses", name: string) => {
      const row = (await listLookup(tx, pharmacyId, kind)).find((r) => r.name === name);
      if (!row) throw new Error(`Sample data refers to a missing ${kind} entry: ${name}`);
      return row.id;
    };
    const statusId = await idOf("statuses", "Ready-Stock");
    for (const [index, p] of SAMPLE_PRODUCTS.entries()) {
      const { baseSell, baseCost } = priceFor(p);
      const id = await createProduct(tx, ctx, MARKUP_PCT, {
        code: sampleEan13(index + 1),
        name: p.name,
        categoryId: await idOf("categories", p.category),
        statusId,
        baseUnitId: await idOf("units", p.base),
        baseCost,
        marginPct: MARGIN_PCT,
        sellPrice: baseSell,
      });
      for (const [unit, factor] of p.packs ?? []) {
        // The pack that carries the quoted price gets that exact price; other packs follow the base price automatically.
        await addPackUnit(tx, ctx, id, { unitId: await idOf("units", unit), factor, sellPrice: unit === p.priceUnit ? toMoney(p.price) : null });
      }
      productIds.push(id);
    }
  });

  // 3. Opening stock: one purchase order + goods receipt per supplier, with batches and expiry dates
  let purchaseOrders = 0;
  let batches = 0;
  const suppliers = await withPharmacy(db, pharmacyId, (tx) => listPartners(tx, pharmacyId, "suppliers"));
  const supplierIds = new Map(SAMPLE_SUPPLIERS.map((s, i) => [i, suppliers.find((x) => x.name === s.name)!.id]));
  const baseUnitIds = await withPharmacy(db, pharmacyId, async (tx) => {
    const all = await listLookup(tx, pharmacyId, "units");
    return new Map(all.map((u) => [u.name, u.id]));
  });

  for (const [supplierIndex, supplierId] of supplierIds) {
    const items = SAMPLE_PRODUCTS.map((p, i) => ({ p, i })).filter(({ p }) => p.supplier === supplierIndex);
    if (items.length === 0) continue;
    await withPharmacy(db, pharmacyId, async (tx) => {
      const po = await createPurchaseOrder(tx, ctx, { supplierId, note: "Sample opening stock" }, now);
      const lines: ReceiptLineInput[] = [];
      for (const { p, i } of items) {
        const unitId = baseUnitIds.get(p.base)!;
        await addPurchaseOrderLine(tx, ctx, po.id, { productId: productIds[i], unitId, qty: p.stock });
        for (const b of batchesFor(p, i, today)) {
          lines.push({ productId: productIds[i], unitId, qty: b.qty, unitPrice: priceFor(p).baseCost, discountPct: "0", batchNo: b.batchNo, expiryDate: b.expiryDate });
          batches += 1;
        }
      }
      await receiveGoods(tx, ctx, MARKUP_PCT, { purchaseOrderId: po.id, supplierInvoiceNo: `INV-SAMPLE-${supplierIndex + 1}`, note: "Sample opening stock", lines }, now);
    });
    purchaseOrders += 1;
  }

  return { pharmacyId, products: productIds.length, suppliers: SAMPLE_SUPPLIERS.length, customers: SAMPLE_CUSTOMERS.length, purchaseOrders, batches };
}
