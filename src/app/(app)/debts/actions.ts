"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type FormState, zodErrors } from "@/lib/form";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth";
import { createDebt, DebtError, recordDebtPayment } from "@/server/debts";
import { withPharmacy } from "@/server/tenant";

export type DebtFormState = FormState;

const kind = z.enum(["payables", "receivables"]);
const id = z.coerce.number({ error: "Please choose an option" }).int().positive("Please choose an option");
const money = z.string().trim().regex(/^\d{1,13}(\.\d{1,2})?$/, "Enter an amount like 150000 or 150000.50");

export async function createDebtAction(_prev: DebtFormState, formData: FormData): Promise<DebtFormState> {
  const session = await requirePermission("debts.manage");
  const parsed = z.object({ kind, partyId: id, amount: money, note: z.string().trim().max(300).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  try {
    await withPharmacy(getDb(), ctx.pharmacyId, (tx) => createDebt(tx, ctx, parsed.data.kind, parsed.data));
  } catch (error) {
    if (error instanceof DebtError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/debts/${parsed.data.kind}`);
  return { success: "Saved." };
}

export async function payDebtAction(_prev: DebtFormState, formData: FormData): Promise<DebtFormState> {
  const session = await requirePermission("debts.manage");
  const parsed = z.object({ kind, debtId: id, amount: money }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  try {
    await withPharmacy(getDb(), ctx.pharmacyId, (tx) => recordDebtPayment(tx, ctx, parsed.data.kind, parsed.data.debtId, parsed.data.amount));
  } catch (error) {
    if (error instanceof DebtError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/debts/${parsed.data.kind}`);
  return { success: "Payment recorded." };
}
