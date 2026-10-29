import { execFile } from "node:child_process";
import net from "node:net";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { pharmacies, printers, printJobs } from "@/db/schema";
import { withPharmacy } from "../tenant";
import { loadReceiptModel, paperColumns, renderEscPos, renderPlainText, testPageModel } from "./receipt";

const MAX_ATTEMPTS = 3;
const STUCK_AFTER_MS = 2 * 60 * 1000;
const SEND_TIMEOUT_MS = 10_000;

export type Transport = {
  sendNetwork(host: string, port: number, data: Buffer): Promise<void>;
  sendOsPrinter(printerName: string, data: Buffer, raw: boolean): Promise<void>;
};

export const defaultTransport: Transport = {
  // Raw bytes straight to a network printer (the usual port is 9100).
  sendNetwork: (host, port, data) =>
    new Promise((resolve, reject) => {
      const socket = net.connect({ host, port });
      socket.setTimeout(SEND_TIMEOUT_MS, () => socket.destroy(new Error(`Timed out connecting to ${host}:${port}`)));
      socket.once("error", reject);
      socket.once("connect", () => socket.end(data, () => resolve()));
    }),
  // macOS / Linux (CUPS): `lp`. The worker must run on the computer that owns the printer, not inside Docker.
  sendOsPrinter: (printerName, data, raw) =>
    new Promise((resolve, reject) => {
      if (process.platform === "win32") return reject(new Error("Printing to a Windows printer by name is not supported yet; use a network printer or the browser print page"));
      const args = ["-d", printerName, ...(raw ? ["-o", "raw"] : [])];
      const child = execFile("lp", args, { timeout: SEND_TIMEOUT_MS }, (error, _stdout, stderr) => (error ? reject(new Error(stderr.trim() || error.message)) : resolve()));
      child.stdin?.end(data);
    }),
};

type Claimed = { id: number; printerId: number; documentType: string; documentId: number; attempts: number };

async function claimJobs(db: Db, pharmacyId: number, now: Date): Promise<Claimed[]> {
  return withPharmacy(db, pharmacyId, async (tx) => {
    // A job whose worker disappeared is queued again (or failed if it was already tried enough).
    const stuck = new Date(now.getTime() - STUCK_AFTER_MS);
    await tx.update(printJobs).set({ status: "failed", lastError: "Worker stopped while printing" }).where(and(eq(printJobs.pharmacyId, pharmacyId), eq(printJobs.status, "printing"), sql`${printJobs.claimedAt} < ${stuck}`, sql`${printJobs.attempts} >= ${MAX_ATTEMPTS}`));
    await tx.update(printJobs).set({ status: "queued" }).where(and(eq(printJobs.pharmacyId, pharmacyId), eq(printJobs.status, "printing"), sql`${printJobs.claimedAt} < ${stuck}`));

    const rows = (
      await tx.execute(sql`
        update print_jobs set status = 'printing', attempts = attempts + 1, claimed_at = ${now}
        where id in (select id from print_jobs where pharmacy_id = ${pharmacyId} and status = 'queued' order by id limit 5 for update skip locked)
        returning id, printer_id, document_type, document_id, attempts`)
    ).rows as { id: number; printer_id: number; document_type: string; document_id: number; attempts: number }[];
    return rows.map((r) => ({ id: r.id, printerId: r.printer_id, documentType: r.document_type, documentId: r.document_id, attempts: r.attempts }));
  });
}

async function deliver(db: Db, pharmacyId: number, job: Claimed, transport: Transport) {
  const prepared = await withPharmacy(db, pharmacyId, async (tx) => {
    const [printer] = await tx.select().from(printers).where(and(eq(printers.pharmacyId, pharmacyId), eq(printers.id, job.printerId)));
    if (!printer) throw new Error("Printer no longer exists");
    const [pharmacy] = await tx.select({ name: pharmacies.name }).from(pharmacies).where(eq(pharmacies.id, pharmacyId));
    const model = job.documentType === "test" ? testPageModel(pharmacy.name, printer.code) : await loadReceiptModel(tx, pharmacyId, job.documentId);
    if (!model) throw new Error("Receipt not found (the sale is not completed)");
    const width = paperColumns(printer.paperWidthMm);
    const data = printer.type === "thermal_escpos" ? renderEscPos(model, width) : Buffer.from(renderPlainText(model, width), "ascii");
    return { printer, data };
  });
  const { printer, data } = prepared;
  if (printer.connection === "network") await transport.sendNetwork(printer.host!, printer.port ?? 9100, data);
  else await transport.sendOsPrinter(printer.osPrinterName!, data, printer.type === "thermal_escpos");
}

// One pass over every active pharmacy: take queued jobs, print them, record the outcome. Safe to run in several
// workers at once (jobs are claimed with SKIP LOCKED). Returns how many jobs were attempted.
export async function runWorkerOnce(db: Db, transport: Transport = defaultTransport, now = new Date()): Promise<number> {
  const active = await db.select({ id: pharmacies.id }).from(pharmacies).where(eq(pharmacies.isActive, true));
  let attempted = 0;
  for (const { id: pharmacyId } of active) {
    for (const job of await claimJobs(db, pharmacyId, now)) {
      attempted += 1;
      let error: string | null = null;
      try {
        await deliver(db, pharmacyId, job, transport);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      await withPharmacy(db, pharmacyId, (tx) =>
        tx
          .update(printJobs)
          .set(error === null ? { status: "done", printedAt: new Date(), lastError: null } : { status: job.attempts >= MAX_ATTEMPTS ? "failed" : "queued", lastError: error.slice(0, 500) })
          .where(and(eq(printJobs.pharmacyId, pharmacyId), eq(printJobs.id, job.id))),
      );
    }
  }
  return attempted;
}
