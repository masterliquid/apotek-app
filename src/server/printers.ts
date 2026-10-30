import { and, asc, desc, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { printers, printJobs, sales } from "@/db/schema";
import { OS_PRINTER_NAME_RE } from "@/server/printing/os-printers";

export class PrintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrintError";
  }
}

type Ctx = { pharmacyId: number; userId: number };

export const PAPER_WIDTHS = [58, 80, 210] as const;

export type PrinterInput = {
  code: string;
  name: string;
  type: "thermal_escpos" | "standard";
  connection: "network" | "os_printer";
  host?: string | null;
  port?: number | null;
  osPrinterName?: string | null;
  paperWidthMm: number;
};

export async function createPrinter(tx: Tx, ctx: Ctx, input: PrinterInput) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,30}$/.test(code)) throw new PrintError("Code: 1–30 letters, numbers, dash or underscore");
  if (!input.name.trim()) throw new PrintError("Name is required");
  if (!(PAPER_WIDTHS as readonly number[]).includes(input.paperWidthMm)) throw new PrintError("Paper width must be 58, 80 or 210 mm");

  let host: string | null = null;
  let port: number | null = null;
  let osPrinterName: string | null = null;
  if (input.connection === "network") {
    host = input.host?.trim() ?? "";
    port = input.port ?? 9100;
    if (!/^[A-Za-z0-9.-]{1,253}$/.test(host)) throw new PrintError("Enter the printer's IP address or host name");
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new PrintError("Port must be between 1 and 65535");
  } else {
    osPrinterName = input.osPrinterName?.trim() ?? "";
    // The name is passed to the operating system's print command, so only plain characters are accepted.
    if (!OS_PRINTER_NAME_RE.test(osPrinterName)) throw new PrintError("Enter the printer name exactly as the operating system shows it");
  }
  const [row] = await tx
    .insert(printers)
    .values({ pharmacyId: ctx.pharmacyId, code, name: input.name.trim(), type: input.type, connection: input.connection, host, port, osPrinterName, paperWidthMm: input.paperWidthMm, createdBy: ctx.userId })
    .returning({ id: printers.id });
  return row.id;
}

export async function setPrinterActive(tx: Tx, ctx: Ctx, printerId: number, isActive: boolean) {
  await tx.update(printers).set({ isActive, updatedAt: new Date(), updatedBy: ctx.userId }).where(and(eq(printers.pharmacyId, ctx.pharmacyId), eq(printers.id, printerId)));
}

export async function listPrinters(tx: Tx, pharmacyId: number) {
  return tx.select().from(printers).where(eq(printers.pharmacyId, pharmacyId)).orderBy(asc(printers.code));
}

export async function findActivePrinterByCode(tx: Tx, pharmacyId: number, code: string) {
  const [printer] = await tx.select().from(printers).where(and(eq(printers.pharmacyId, pharmacyId), eq(printers.code, code), eq(printers.isActive, true)));
  return printer ?? null;
}

// Queues a print. It only writes a row, so it can run inside the sale's own transaction: printing problems can never
// undo or block a sale, they only show up as a failed job that can be retried.
export async function enqueuePrintJob(tx: Tx, ctx: Ctx, input: { printerId: number; documentType: "sale_receipt" | "test"; documentId: number }) {
  const [printer] = await tx.select({ id: printers.id, isActive: printers.isActive }).from(printers).where(and(eq(printers.pharmacyId, ctx.pharmacyId), eq(printers.id, input.printerId)));
  if (!printer || !printer.isActive) throw new PrintError("Printer not found or not active");
  if (input.documentType === "sale_receipt") {
    const [sale] = await tx.select({ status: sales.status }).from(sales).where(and(eq(sales.pharmacyId, ctx.pharmacyId), eq(sales.id, input.documentId)));
    if (!sale || sale.status !== "committed") throw new PrintError("Only completed sales can be printed");
  }
  const [job] = await tx.insert(printJobs).values({ pharmacyId: ctx.pharmacyId, printerId: input.printerId, documentType: input.documentType, documentId: input.documentId, createdBy: ctx.userId }).returning({ id: printJobs.id });
  return job.id;
}

export async function listPrintJobs(tx: Tx, pharmacyId: number) {
  return tx
    .select({ id: printJobs.id, printerCode: printers.code, documentType: printJobs.documentType, documentId: printJobs.documentId, status: printJobs.status, attempts: printJobs.attempts, lastError: printJobs.lastError, createdAt: printJobs.createdAt })
    .from(printJobs)
    .innerJoin(printers, and(eq(printers.pharmacyId, printJobs.pharmacyId), eq(printers.id, printJobs.printerId)))
    .where(eq(printJobs.pharmacyId, pharmacyId))
    .orderBy(desc(printJobs.id))
    .limit(30);
}

export async function retryPrintJob(tx: Tx, pharmacyId: number, jobId: number) {
  const updated = await tx
    .update(printJobs)
    .set({ status: "queued", attempts: 0, lastError: null, claimedAt: null })
    .where(and(eq(printJobs.pharmacyId, pharmacyId), eq(printJobs.id, jobId), eq(printJobs.status, "failed")))
    .returning({ id: printJobs.id });
  if (updated.length === 0) throw new PrintError("Only failed print jobs can be retried");
}
