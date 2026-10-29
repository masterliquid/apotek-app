"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type FormState, zodErrors, fieldError } from "@/lib/form";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth";
import { defaultPrinterId, setDefaultPrinterCookie } from "@/lib/printing";
import { isUniqueViolation } from "@/server/db-errors";
import { updatePharmacySettings } from "@/server/pharmacies";
import { createPrinter, enqueuePrintJob, PrintError, retryPrintJob, setPrinterActive, findActivePrinterByCode } from "@/server/printers";
import { withPharmacy } from "@/server/tenant";

export type SettingsFormState = FormState;

const id = z.coerce.number({ error: "Please choose an option" }).int().positive("Please choose an option");
const text = (max: number) => z.string().trim().max(max);

export async function createPrinterAction(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const session = await requirePermission("settings.manage");
  const parsed = z
    .object({
      code: text(30), name: text(100), type: z.enum(["thermal_escpos", "standard"]), connection: z.enum(["network", "os_printer"]),
      host: text(253).optional(), port: z.coerce.number().int().optional(), osPrinterName: text(100).optional(), paperWidthMm: z.coerce.number().int(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please fill in the form completely." };
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  try {
    await withPharmacy(getDb(), ctx.pharmacyId, (tx) => createPrinter(tx, ctx, { ...parsed.data, port: formData.get("port") ? parsed.data.port : undefined }));
  } catch (error) {
    if (error instanceof PrintError) return { error: error.message };
    if (isUniqueViolation(error)) return fieldError("code", "That printer code already exists.");
    throw error;
  }
  revalidatePath("/settings/printers");
  return { success: "Printer added." };
}

export async function togglePrinterAction(formData: FormData) {
  const session = await requirePermission("settings.manage");
  const parsed = z.object({ printerId: id, activate: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  await withPharmacy(getDb(), ctx.pharmacyId, (tx) => setPrinterActive(tx, ctx, parsed.data.printerId, parsed.data.activate === "true"));
  revalidatePath("/settings/printers");
}

export async function testPrintAction(formData: FormData) {
  const session = await requirePermission("settings.manage");
  const parsed = z.object({ printerId: id }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  try {
    await withPharmacy(getDb(), ctx.pharmacyId, (tx) => enqueuePrintJob(tx, ctx, { printerId: parsed.data.printerId, documentType: "test", documentId: parsed.data.printerId }));
  } catch (error) {
    if (!(error instanceof PrintError)) throw error;
  }
  revalidatePath("/settings/printers");
}

export async function setDefaultPrinterAction(formData: FormData) {
  const session = await requirePermission("sales.sell");
  const code = String(formData.get("code") ?? "");
  const printer = await withPharmacy(getDb(), session.pharmacy.id, (tx) => findActivePrinterByCode(tx, session.pharmacy.id, code));
  if (printer) await setDefaultPrinterCookie(printer.code);
  revalidatePath("/settings/printers");
}

export async function retryJobAction(formData: FormData) {
  const session = await requirePermission("sales.sell");
  const parsed = z.object({ jobId: id }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  try {
    await withPharmacy(getDb(), session.pharmacy.id, (tx) => retryPrintJob(tx, session.pharmacy.id, parsed.data.jobId));
  } catch (error) {
    if (!(error instanceof PrintError)) throw error;
  }
  revalidatePath("/settings/printers");
}

// Print (or reprint) a completed sale's receipt on this device's printer.
export async function printSaleAction(formData: FormData) {
  const session = await requirePermission("sales.sell");
  const parsed = z.object({ saleId: id }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const ctx = { pharmacyId: session.pharmacy.id, userId: session.user.id };
  try {
    await withPharmacy(getDb(), ctx.pharmacyId, async (tx) => {
      const printerId = await defaultPrinterId(tx, ctx.pharmacyId);
      if (printerId) await enqueuePrintJob(tx, ctx, { printerId, documentType: "sale_receipt", documentId: parsed.data.saleId });
    });
  } catch (error) {
    if (!(error instanceof PrintError)) throw error;
  }
  revalidatePath(`/sales/${parsed.data.saleId}`);
}

const Settings = z.object({
  name: text(150).min(1, "Name is required"),
  address: text(300).optional(), phone: text(50).optional(), receiptHeader: text(200).optional(), receiptFooter: text(200).optional(),
  buyPriceMarkupPct: z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/, "Markup must be a number like 10 or 12.5"),
  expiryWarningDays: z.coerce.number().int().min(1, "Warning days must be 1–730").max(730, "Warning days must be 1–730"),
});

export async function savePharmacySettingsAction(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const session = await requirePermission("settings.manage");
  const parsed = Settings.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const d = parsed.data;
  await updatePharmacySettings(getDb(), session.pharmacy.id, { ...d, address: d.address || null, phone: d.phone || null, receiptHeader: d.receiptHeader || null, receiptFooter: d.receiptFooter || null });
  revalidatePath("/settings/pharmacy");
  return { success: "Saved." };
}
