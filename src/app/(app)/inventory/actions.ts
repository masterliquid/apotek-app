"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type FormState, zodErrors } from "@/lib/form";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth";
import { addProductToOpname, commitOpname, createAdjustment, createOpname, InventoryError, removeOpnameLine, saveOpnameCounts } from "@/server/inventory";
import { withPharmacy } from "@/server/tenant";

export type InventoryFormState = FormState;

const id = z.coerce.number({ error: "Please choose an option" }).int().positive("Please choose an option");
const known = (error: unknown) => (error instanceof InventoryError ? error.message : null);

export async function createAdjustmentAction(_prev: InventoryFormState, formData: FormData): Promise<InventoryFormState> {
  const session = await requirePermission("inventory.adjust");
  const parsed = z.object({ batchId: id, reasonId: id, qtyChange: z.coerce.number().int("Enter a whole number"), note: z.string().trim().max(300).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  try {
    await withPharmacy(getDb(), ctx.pharmacyId, (tx) => createAdjustment(tx, ctx, parsed.data));
  } catch (error) {
    const message = known(error);
    if (message) return { error: message };
    throw error;
  }
  revalidatePath("/inventory/adjustments");
  revalidatePath("/products");
  return { success: "Stock adjusted." };
}

export async function createOpnameAction(formData: FormData) {
  const session = await requirePermission("inventory.adjust");
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  const note = String(formData.get("note") ?? "");
  const opname = await withPharmacy(getDb(), ctx.pharmacyId, (tx) => createOpname(tx, ctx, note));
  redirect(`/inventory/opname/${opname.id}`);
}

export async function addOpnameProductAction(_prev: InventoryFormState, formData: FormData): Promise<InventoryFormState> {
  const session = await requirePermission("inventory.adjust");
  const parsed = z.object({ opnameId: id, productId: id }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a product." };
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  try {
    await withPharmacy(getDb(), ctx.pharmacyId, (tx) => addProductToOpname(tx, ctx, parsed.data.opnameId, parsed.data.productId));
  } catch (error) {
    const message = known(error);
    if (message) return { error: message };
    throw error;
  }
  revalidatePath(`/inventory/opname/${parsed.data.opnameId}`);
  return {};
}

export async function removeOpnameLineAction(formData: FormData) {
  const session = await requirePermission("inventory.adjust");
  const parsed = z.object({ opnameId: id, lineId: id }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  try {
    await withPharmacy(getDb(), session.pharmacy.id, (tx) => removeOpnameLine(tx, session.pharmacy.id, parsed.data.opnameId, parsed.data.lineId));
  } catch (error) {
    if (!known(error)) throw error;
  }
  revalidatePath(`/inventory/opname/${parsed.data.opnameId}`);
}

// One form, two buttons: "save" stores the counts, "commit" stores them and applies the differences to stock.
export async function saveOrCommitOpnameAction(_prev: InventoryFormState, formData: FormData): Promise<InventoryFormState> {
  const session = await requirePermission("inventory.adjust");
  const opnameId = id.safeParse(formData.get("opnameId"));
  if (!opnameId.success) return { error: "Invalid request" };
  const commit = formData.get("intent") === "commit";
  if (commit) await requirePermission("inventory.commit_opname");

  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  const counts = [...formData.keys()]
    .filter((k) => k.startsWith("count_"))
    .map((k) => ({ lineId: Number(k.slice(6)), physicalQty: Number(formData.get(k)) }));
  if (counts.some((c) => !Number.isSafeInteger(c.lineId) || !Number.isFinite(c.physicalQty))) return { error: "Counted quantities must be whole numbers." };

  try {
    await withPharmacy(getDb(), ctx.pharmacyId, async (tx) => {
      await saveOpnameCounts(tx, ctx, opnameId.data, counts);
      if (commit) await commitOpname(tx, ctx, opnameId.data);
    });
  } catch (error) {
    const message = known(error);
    if (message) return { error: message };
    throw error;
  }
  revalidatePath(`/inventory/opname/${opnameId.data}`);
  revalidatePath("/inventory/opname");
  revalidatePath("/products");
  return { success: commit ? "Stock opname committed. Stock updated." : "Counts saved." };
}
