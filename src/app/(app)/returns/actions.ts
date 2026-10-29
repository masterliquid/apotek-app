"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type FormState } from "@/lib/form";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth";
import { createPurchaseReturn, createSalesReturn, getReturnableReceiptLines, getReturnableSaleLines, ReturnError, type ReturnItem } from "@/server/returns";
import { withPharmacy } from "@/server/tenant";

export type ReturnFormState = FormState;

const id = z.coerce.number({ error: "Please choose an option" }).int().positive("Please choose an option");
const header = z.object({ documentId: id, reason: z.string().trim().max(300).optional() });

// Quantities are read for the lines the server knows about; the browser cannot add lines of other documents.
function itemsFrom(formData: FormData, lineIds: number[]): ReturnItem[] {
  return lineIds.map((lineId) => ({ lineId, qty: Number(formData.get(`qty_${lineId}`) || 0) }));
}

export async function createSalesReturnAction(_prev: ReturnFormState, formData: FormData): Promise<ReturnFormState> {
  const session = await requirePermission("sales.return");
  const parsed = header.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request" };
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  let result: { returnNo: string };
  try {
    result = await withPharmacy(getDb(), ctx.pharmacyId, async (tx) => {
      const lines = await getReturnableSaleLines(tx, ctx.pharmacyId, parsed.data.documentId);
      return createSalesReturn(tx, ctx, { saleId: parsed.data.documentId, reason: parsed.data.reason, items: itemsFrom(formData, lines.map((l) => l.id)) });
    });
  } catch (error) {
    if (error instanceof ReturnError) return { error: error.message };
    throw error;
  }
  revalidatePath("/returns");
  revalidatePath("/products");
  redirect(`/returns?done=${encodeURIComponent(result.returnNo)}`);
}

export async function createPurchaseReturnAction(_prev: ReturnFormState, formData: FormData): Promise<ReturnFormState> {
  const session = await requirePermission("purchasing.manage");
  const parsed = header.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request" };
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  let result: { returnNo: string };
  try {
    result = await withPharmacy(getDb(), ctx.pharmacyId, async (tx) => {
      const lines = await getReturnableReceiptLines(tx, ctx.pharmacyId, parsed.data.documentId);
      return createPurchaseReturn(tx, ctx, { goodsReceiptId: parsed.data.documentId, reason: parsed.data.reason, items: itemsFrom(formData, lines.map((l) => l.id)) });
    });
  } catch (error) {
    if (error instanceof ReturnError) return { error: error.message };
    throw error;
  }
  revalidatePath("/purchase-returns");
  revalidatePath("/products");
  redirect(`/purchase-returns?done=${encodeURIComponent(result.returnNo)}`);
}
