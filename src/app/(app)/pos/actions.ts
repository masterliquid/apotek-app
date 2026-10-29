"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth";
import { defaultPrinterId } from "@/lib/printing";
import { enqueuePrintJob } from "@/server/printers";
import { can } from "@/server/auth/permissions";
import { commitSale, holdSale, SalesError, voidPendingSale } from "@/server/sales";
import { ProductError } from "@/server/products";
import { withPharmacy } from "@/server/tenant";

export type PosResult = { error: string };

const id = z.number().int().positive();
const Cart = z.object({
  saleId: id.nullish(),
  customerName: z.string().trim().max(150).optional(),
  lines: z
    .array(z.object({ productId: id, unitId: id, qty: z.number().int().positive().max(1_000_000), discountPct: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/) }))
    .min(1, "Add at least one item")
    .max(200),
});
const Payments = z
  .array(z.object({ paymentMethodId: id, amount: z.string().regex(/^\d{1,13}(\.\d{1,2})?$/, "Enter a valid payment amount"), referenceNo: z.string().trim().max(100).optional(), confirmed: z.boolean() }))
  .max(10);

const known = (error: unknown) => (error instanceof SalesError || error instanceof ProductError ? error.message : null);

export async function holdSaleAction(cart: unknown): Promise<PosResult> {
  const session = await requirePermission("sales.sell");
  const parsed = Cart.safeParse(cart);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  try {
    await withPharmacy(getDb(), ctx.pharmacyId, (tx) => holdSale(tx, ctx, parsed.data));
  } catch (error) {
    const message = known(error);
    if (message) return { error: message };
    throw error;
  }
  revalidatePath("/sales");
  redirect("/sales");
}

export async function completeSaleAction(cart: unknown, payments: unknown): Promise<PosResult> {
  const session = await requirePermission("sales.sell");
  const parsedCart = Cart.safeParse(cart);
  if (!parsedCart.success) return { error: parsedCart.error.issues[0].message };
  const parsedPayments = Payments.safeParse(payments);
  if (!parsedPayments.success) return { error: parsedPayments.error.issues[0].message };
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };

  let saleId: number;
  try {
    ({ saleId } = await withPharmacy(getDb(), ctx.pharmacyId, async (tx) => {
      const sale = await commitSale(tx, ctx, parsedCart.data, parsedPayments.data);
      // Queue the receipt in the same transaction. This only writes a row, so a printer problem can never undo the sale.
      const printerId = await defaultPrinterId(tx, ctx.pharmacyId);
      if (printerId) await enqueuePrintJob(tx, ctx, { printerId, documentType: "sale_receipt", documentId: sale.saleId });
      return sale;
    }));
  } catch (error) {
    const message = known(error);
    if (message) return { error: message };
    throw error;
  }
  revalidatePath("/sales");
  revalidatePath("/products");
  redirect(`/sales/${saleId}`);
}

export async function voidSaleAction(formData: FormData) {
  const session = await requirePermission("sales.sell");
  const saleId = Number(formData.get("saleId"));
  if (!Number.isSafeInteger(saleId)) return;
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  try {
    await withPharmacy(getDb(), ctx.pharmacyId, (tx) => voidPendingSale(tx, ctx, saleId, can(session.role, "sales.void_any")));
  } catch (error) {
    if (!known(error)) throw error;
  }
  revalidatePath("/sales");
}
