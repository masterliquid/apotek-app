import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { productBatches, productUnits, products, units } from "@/db/schema";
import { computeProductPrices } from "./pricing";

export class ProductError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductError";
  }
}

export type NewProductInput = {
  code: string;
  name: string;
  categoryId: number;
  statusId: number;
  baseUnitId: number;
  baseCost: string;
  marginPct: string;
  sellPrice: string;
};

type Ctx = { pharmacyId: number; userId: number };

// buy price and recommended price are derived from base cost + the pharmacy's markup + the product margin
// (legacy rule, see pricing.ts). Only sellPrice is typed in by the user and used at the POS.
export async function createProduct(tx: Tx, ctx: Ctx, markupPct: string, input: NewProductInput) {
  const { buyPrice, recommendedPrice } = computeProductPrices({ baseCost: input.baseCost, markupPct, marginPct: input.marginPct });
  const [row] = await tx
    .insert(products)
    .values({
      pharmacyId: ctx.pharmacyId,
      code: input.code.trim(),
      name: input.name.trim(),
      categoryId: input.categoryId,
      statusId: input.statusId,
      baseUnitId: input.baseUnitId,
      baseCost: input.baseCost,
      buyPrice,
      marginPct: input.marginPct,
      recommendedPrice,
      sellPrice: input.sellPrice,
      createdBy: ctx.userId,
    })
    .returning({ id: products.id });
  return row.id;
}

export async function updateProductDetails(tx: Tx, ctx: Ctx, productId: number, patch: { name: string; categoryId: number; statusId: number; isActive: boolean }) {
  await tx
    .update(products)
    .set({ name: patch.name.trim(), categoryId: patch.categoryId, statusId: patch.statusId, isActive: patch.isActive, updatedAt: new Date(), updatedBy: ctx.userId })
    .where(and(eq(products.pharmacyId, ctx.pharmacyId), eq(products.id, productId)));
}

export async function updateProductPrices(tx: Tx, ctx: Ctx, markupPct: string, productId: number, patch: { baseCost: string; marginPct: string; sellPrice: string }) {
  const { buyPrice, recommendedPrice } = computeProductPrices({ baseCost: patch.baseCost, markupPct, marginPct: patch.marginPct });
  await tx
    .update(products)
    .set({ baseCost: patch.baseCost, buyPrice, marginPct: patch.marginPct, recommendedPrice, sellPrice: patch.sellPrice, updatedAt: new Date(), updatedBy: ctx.userId })
    .where(and(eq(products.pharmacyId, ctx.pharmacyId), eq(products.id, productId)));
}

// Screens that list products for browsing show the first 500 matches (the user narrows with search). Screens that must
// reach EVERY product (POS, pickers, price list) pass ALL_PRODUCTS.
export const ALL_PRODUCTS = 20000;

export async function listProducts(tx: Tx, pharmacyId: number, search?: string, limit = 500) {
  const term = search?.trim();
  const stock = sql<number>`coalesce(sum(${productBatches.qtyOnHand}), 0)::int`;
  return tx
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      baseUnitId: products.baseUnitId,
      baseUnitName: units.name,
      baseCost: products.baseCost,
      buyPrice: products.buyPrice,
      marginPct: products.marginPct,
      recommendedPrice: products.recommendedPrice,
      sellPrice: products.sellPrice,
      isActive: products.isActive,
      stock,
    })
    .from(products)
    .innerJoin(units, and(eq(units.pharmacyId, products.pharmacyId), eq(units.id, products.baseUnitId)))
    .leftJoin(productBatches, and(eq(productBatches.pharmacyId, products.pharmacyId), eq(productBatches.productId, products.id)))
    .where(and(eq(products.pharmacyId, pharmacyId), term ? or(ilike(products.name, `%${term}%`), ilike(products.code, `%${term}%`)) : undefined))
    .groupBy(products.id, units.name)
    .orderBy(asc(products.name))
    .limit(limit);
}

export async function getProductPackUnits(tx: Tx, pharmacyId: number, productId: number) {
  return tx
    .select({ id: productUnits.id, unitId: productUnits.unitId, unitName: units.name, factor: productUnits.factor, sellPrice: productUnits.sellPrice })
    .from(productUnits)
    .innerJoin(units, and(eq(units.pharmacyId, productUnits.pharmacyId), eq(units.id, productUnits.unitId)))
    .where(and(eq(productUnits.pharmacyId, pharmacyId), eq(productUnits.productId, productId)))
    .orderBy(asc(productUnits.factor));
}

export async function addPackUnit(tx: Tx, ctx: Ctx, productId: number, input: { unitId: number; factor: number; sellPrice?: string | null }) {
  const [product] = await tx
    .select({ baseUnitId: products.baseUnitId })
    .from(products)
    .where(and(eq(products.pharmacyId, ctx.pharmacyId), eq(products.id, productId)));
  if (!product) throw new ProductError("Product not found");
  if (product.baseUnitId === input.unitId) throw new ProductError("That is already the base unit");
  await tx.insert(productUnits).values({ pharmacyId: ctx.pharmacyId, productId, unitId: input.unitId, factor: input.factor, sellPrice: input.sellPrice || null, createdBy: ctx.userId });
}

export async function removePackUnit(tx: Tx, pharmacyId: number, packUnitId: number) {
  await tx.delete(productUnits).where(and(eq(productUnits.pharmacyId, pharmacyId), eq(productUnits.id, packUnitId)));
}

export async function getProduct(tx: Tx, pharmacyId: number, productId: number) {
  const [row] = await tx
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      baseUnitId: products.baseUnitId,
      baseUnitName: units.name,
      baseCost: products.baseCost,
      buyPrice: products.buyPrice,
      marginPct: products.marginPct,
      recommendedPrice: products.recommendedPrice,
      sellPrice: products.sellPrice,
    })
    .from(products)
    .innerJoin(units, and(eq(units.pharmacyId, products.pharmacyId), eq(units.id, products.baseUnitId)))
    .where(and(eq(products.pharmacyId, pharmacyId), eq(products.id, productId)));
  return row ?? null;
}

// How many base units one unit of `unitId` is worth for this product: 1 for the base unit, the pack factor otherwise.
export async function resolveUnitFactor(tx: Tx, pharmacyId: number, productId: number, unitId: number): Promise<number> {
  const [product] = await tx
    .select({ baseUnitId: products.baseUnitId })
    .from(products)
    .where(and(eq(products.pharmacyId, pharmacyId), eq(products.id, productId)));
  if (!product) throw new ProductError("Product not found");
  if (product.baseUnitId === unitId) return 1;
  const [pack] = await tx
    .select({ factor: productUnits.factor })
    .from(productUnits)
    .where(and(eq(productUnits.pharmacyId, pharmacyId), eq(productUnits.productId, productId), eq(productUnits.unitId, unitId)));
  if (!pack) throw new ProductError("That unit is not defined for this product");
  return pack.factor;
}

// All pack units of a pharmacy, for screens that need every product's units at once (POS).
export async function listAllPackUnits(tx: Tx, pharmacyId: number) {
  return tx
    .select({ productId: productUnits.productId, unitId: productUnits.unitId, unitName: units.name, factor: productUnits.factor, sellPrice: productUnits.sellPrice })
    .from(productUnits)
    .innerJoin(units, and(eq(units.pharmacyId, productUnits.pharmacyId), eq(units.id, productUnits.unitId)))
    .where(eq(productUnits.pharmacyId, pharmacyId))
    .orderBy(asc(productUnits.factor));
}
