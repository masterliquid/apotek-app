"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type FormState, zodErrors, fieldError } from "@/lib/form";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth";
import { isUniqueViolation } from "@/server/db-errors";
import { getPharmacy } from "@/server/pharmacies";
import { addPackUnit, createProduct, removePackUnit, updateProductPrices } from "@/server/products";
import { withPharmacy } from "@/server/tenant";

export type ProductFormState = FormState;

const money = z.string().trim().regex(/^\d{1,13}(\.\d{1,2})?$/, "Enter an amount like 1500 or 1500.50");
const percent = z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/, "Margin must be 0–100, e.g. 20 or 12.5").refine((v) => Number(v) <= 100, "Margin must be 0–100");
const id = z.coerce.number({ error: "Please choose an option" }).int().positive("Please choose an option");

const NewProduct = z.object({
  code: z.string().trim().min(1, "Code is required").max(60),
  name: z.string().trim().min(1, "Name is required").max(200),
  categoryId: id,
  statusId: id,
  baseUnitId: id,
  baseCost: money,
  marginPct: percent,
  sellPrice: money,
});

async function markupOf(pharmacyId: number): Promise<string> {
  const pharmacy = await getPharmacy(getDb(), pharmacyId);
  return pharmacy?.buyPriceMarkupPct ?? "10.00";
}

export async function createProductAction(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const session = await requirePermission("products.edit_prices"); // creating a product sets its prices
  const parsed = NewProduct.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  const markup = await markupOf(ctx.pharmacyId);
  try {
    await withPharmacy(getDb(), ctx.pharmacyId, (tx) => createProduct(tx, ctx, markup, parsed.data));
  } catch (error) {
    if (isUniqueViolation(error)) return fieldError("code", "That product code already exists. Use a different code.");
    throw error;
  }
  revalidatePath("/products");
  return { success: `${parsed.data.name} added.` };
}

const PriceUpdate = z.object({ productId: id, baseCost: money, marginPct: percent, sellPrice: money });

export async function updatePricesAction(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const session = await requirePermission("products.edit_prices");
  const parsed = PriceUpdate.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  const markup = await markupOf(ctx.pharmacyId);
  await withPharmacy(getDb(), ctx.pharmacyId, (tx) => updateProductPrices(tx, ctx, markup, parsed.data.productId, parsed.data));
  revalidatePath("/products");
  revalidatePath(`/products/${parsed.data.productId}`);
  return { success: "Prices updated." };
}

const PackUnit = z.object({
  productId: id,
  unitId: id,
  factor: z.coerce.number().int("Factor must be a whole number").min(2, "Factor must be at least 2").max(100000),
  sellPrice: z.union([money, z.literal("")]).optional(),
});

export async function addPackUnitAction(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const session = await requirePermission("products.edit_details");
  const parsed = PackUnit.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  try {
    await withPharmacy(getDb(), ctx.pharmacyId, (tx) => addPackUnit(tx, ctx, parsed.data.productId, { unitId: parsed.data.unitId, factor: parsed.data.factor, sellPrice: parsed.data.sellPrice }));
  } catch (error) {
    if (isUniqueViolation(error)) return fieldError("unitId", "That unit is already set for this product.");
    if (error instanceof Error && error.name === "ProductError") return { error: error.message };
    throw error;
  }
  revalidatePath(`/products/${parsed.data.productId}`);
  return { success: "Pack unit added." };
}

export async function removePackUnitAction(formData: FormData) {
  const session = await requirePermission("products.edit_details");
  const packUnitId = Number(formData.get("packUnitId"));
  const productId = Number(formData.get("productId"));
  if (!Number.isSafeInteger(packUnitId) || !Number.isSafeInteger(productId)) redirect("/products");
  await withPharmacy(getDb(), session.pharmacy.id, (tx) => removePackUnit(tx, session.pharmacy.id, packUnitId));
  revalidatePath(`/products/${productId}`);
}
