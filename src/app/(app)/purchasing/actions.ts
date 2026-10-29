"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth";
import { type FormState, zodErrors } from "@/lib/form";
import { getPharmacy } from "@/server/pharmacies";
import { ProductError } from "@/server/products";
import {
  addPurchaseOrderLine, cancelPurchaseOrder, closePurchaseOrder, createPurchaseOrder, PurchasingError, receiveGoods, removePurchaseOrderLine,
  setPurchaseOrderLineQty, type ReceiptLineInput,
} from "@/server/purchasing";
import { withPharmacy } from "@/server/tenant";

export type PurchasingFormState = FormState;

const id = z.coerce.number({ error: "Please choose an option" }).int().positive("Please choose an option");
const qtyField = z.coerce.number({ error: "Enter a whole number" }).int("Enter a whole number").positive("Must be above 0");
const money = z.string().trim().regex(/^\d{1,13}(\.\d{1,2})?$/, "Enter an amount like 15000 or 15000.50");

function problem(error: unknown): FormState | null {
  if (error instanceof PurchasingError || error instanceof ProductError) return { error: error.message };
  return null;
}

export async function createPurchaseOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission("purchasing.manage");
  const parsed = z.object({ supplierId: id, note: z.string().trim().max(500).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  const po = await withPharmacy(getDb(), ctx.pharmacyId, (tx) => createPurchaseOrder(tx, ctx, parsed.data));
  redirect(`/purchasing/${po.id}`);
}

export async function addLineAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission("purchasing.manage");
  const parsed = z.object({ purchaseOrderId: id, productId: id, unitId: id, qty: qtyField }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  try {
    await withPharmacy(getDb(), ctx.pharmacyId, (tx) => addPurchaseOrderLine(tx, ctx, parsed.data.purchaseOrderId, parsed.data));
  } catch (error) {
    const known = problem(error);
    if (known) return known;
    throw error;
  }
  revalidatePath(`/purchasing/${parsed.data.purchaseOrderId}`);
  return { success: "Item added to the order." };
}

export async function updateLineQtyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission("purchasing.manage");
  const parsed = z.object({ purchaseOrderId: id, lineId: id, qty: qtyField }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  try {
    await withPharmacy(getDb(), ctx.pharmacyId, (tx) => setPurchaseOrderLineQty(tx, ctx, parsed.data.purchaseOrderId, parsed.data.lineId, parsed.data.qty));
  } catch (error) {
    const known = problem(error);
    if (known) return { ...known, fieldErrors: { qty: known.error! } };
    throw error;
  }
  revalidatePath(`/purchasing/${parsed.data.purchaseOrderId}`);
  return { success: "Saved." };
}

export async function removeLineAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission("purchasing.manage");
  const parsed = z.object({ purchaseOrderId: id, lineId: id }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  try {
    await withPharmacy(getDb(), ctx.pharmacyId, (tx) => removePurchaseOrderLine(tx, ctx, parsed.data.purchaseOrderId, parsed.data.lineId));
  } catch (error) {
    const known = problem(error);
    if (known) return known;
    throw error;
  }
  revalidatePath(`/purchasing/${parsed.data.purchaseOrderId}`);
  return {};
}

export async function closeOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission("purchasing.manage");
  const parsed = z.object({ purchaseOrderId: id, action: z.enum(["close", "cancel"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  try {
    await withPharmacy(getDb(), ctx.pharmacyId, (tx) => (parsed.data.action === "close" ? closePurchaseOrder(tx, ctx, parsed.data.purchaseOrderId) : cancelPurchaseOrder(tx, ctx, parsed.data.purchaseOrderId)));
  } catch (error) {
    const known = problem(error);
    if (known) return known;
    throw error;
  }
  revalidatePath("/purchasing");
  revalidatePath(`/purchasing/${parsed.data.purchaseOrderId}`);
  return {};
}

// Receive one delivery. Input names: qty_<orderLineId>_<n>, price_…, discount_…, batch_…, expiry_… — n lets one ordered
// item arrive in several batches. Rows with quantity 0 or empty are "did not arrive" and are ignored.
export async function receiveGoodsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission("purchasing.manage");
  const header = z
    .object({
      purchaseOrderId: id,
      supplierInvoiceNo: z.string().trim().min(1, "Enter the supplier's invoice or delivery note number").max(100),
      note: z.string().trim().max(300).optional(),
    })
    .safeParse(Object.fromEntries(formData));

  const fieldErrors: Record<string, string> = header.success ? {} : zodErrors(header.error).fieldErrors!;
  const lines: ReceiptLineInput[] = [];
  for (const key of formData.keys()) {
    const match = /^qty_(\d+)_(\d+)$/.exec(key);
    if (!match) continue;
    const [, lineId, n] = match;
    const get = (name: string) => String(formData.get(`${name}_${lineId}_${n}`) ?? "").trim();
    if (get("qty") === "" || Number(get("qty")) === 0) continue; // this item did not arrive
    const qty = qtyField.safeParse(get("qty"));
    if (!qty.success) fieldErrors[key] = qty.error.issues[0].message;
    const price = money.safeParse(get("price"));
    if (!price.success) fieldErrors[`price_${lineId}_${n}`] = price.error.issues[0].message;
    const discount = get("discount") === "" ? "0" : get("discount");
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(discount) || Number(discount) > 100) fieldErrors[`discount_${lineId}_${n}`] = "0 to 100";
    if (!get("batch")) fieldErrors[`batch_${lineId}_${n}`] = "Enter the batch number printed on the box";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(get("expiry"))) fieldErrors[`expiry_${lineId}_${n}`] = "Choose the expiry date";
    if (qty.success && price.success) lines.push({ purchaseOrderLineId: Number(lineId), qty: qty.data, unitPrice: price.data, discountPct: discount, batchNo: get("batch"), expiryDate: get("expiry") });
  }
  if (Object.keys(fieldErrors).length > 0) return { error: "Please check the fields marked in red.", fieldErrors };
  if (lines.length === 0 || !header.success) return { error: "Enter the quantity that arrived for at least one item. Items that did not arrive stay at 0 and remain on the order." };

  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  const pharmacy = await getPharmacy(getDb(), ctx.pharmacyId);
  let receiptNo: string;
  try {
    ({ receiptNo } = await withPharmacy(getDb(), ctx.pharmacyId, (tx) =>
      receiveGoods(tx, ctx, pharmacy?.buyPriceMarkupPct ?? "10.00", { purchaseOrderId: header.data.purchaseOrderId, supplierInvoiceNo: header.data.supplierInvoiceNo, note: header.data.note, lines }),
    ));
  } catch (error) {
    if (error instanceof PurchasingError || error instanceof ProductError) {
      const lineId = error instanceof PurchasingError ? error.lineId : undefined;
      return { error: error.message, fieldErrors: lineId ? { [`qty_${lineId}_0`]: error.message } : undefined };
    }
    throw error;
  }
  revalidatePath("/purchasing");
  revalidatePath(`/purchasing/${header.data.purchaseOrderId}`);
  revalidatePath("/products");
  redirect(`/purchasing/${header.data.purchaseOrderId}?received=${encodeURIComponent(receiptNo)}`);
}
