import { eq } from "drizzle-orm";
import net from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paymentMethods, pharmacies, printJobs, productBatches } from "@/db/schema";
import { listLookup } from "@/server/master-data";
import { createPharmacyWithOwner } from "@/server/pharmacies";
import { createProduct } from "@/server/products";
import { createPrinter, enqueuePrintJob, PrintError, retryPrintJob, type PrinterInput } from "@/server/printers";
import { formatMoney, layoutReceipt, loadReceiptModel, renderEscPos, renderPlainText, toPrintable, type ReceiptModel } from "@/server/printing/receipt";
import { parseLpstatPrinters } from "@/server/printing/os-printers";
import { runWorkerOnce, type Transport } from "@/server/printing/worker";
import { commitSale } from "@/server/sales";
import { withPharmacy } from "@/server/tenant";
import { connectTestDbs, postgresErrorOf, uniqueName } from "./helpers";

const dbs = connectTestDbs();
afterAll(() => dbs.close());

type Setup = { pharmacyId: number; userId: number; saleId: number; receiptNo: string };

// A pharmacy with one completed sale: 2 strips at 2000 with 10% discount = 3600, paid 4000 cash.
async function newPharmacyWithSale(): Promise<Setup> {
  const { pharmacyId, ownerUserId } = await createPharmacyWithOwner(
    dbs.app,
    { code: uniqueName("P"), name: uniqueName("Apotek Sehat "), address: "Jl. Mawar 1, Jakarta", phone: "021123", owner: { username: uniqueName("o"), fullName: "Owner", password: "owner-password-1" } },
    null,
  );
  const methods = await dbs.admin.select().from(paymentMethods).where(eq(paymentMethods.pharmacyId, pharmacyId));
  const ctx = { pharmacyId, userId: ownerUserId };
  const { productId, tablet } = await withPharmacy(dbs.app, pharmacyId, async (tx) => {
    const id = async (kind: "units" | "categories" | "statuses", name: string) => (await listLookup(tx, pharmacyId, kind)).find((r) => r.name === name)!.id;
    const tablet = await id("units", "Tablet");
    const productId = await createProduct(tx, ctx, "10", { code: uniqueName("P"), name: "Paracetamol 500mg", categoryId: await id("categories", "Obat Bebas"), statusId: await id("statuses", "Ready-Stock"), baseUnitId: tablet, baseCost: "100", marginPct: "20", sellPrice: "200" });
    return { productId, tablet };
  });
  await dbs.admin.insert(productBatches).values({ pharmacyId, productId, batchNo: "B", expiryDate: "2099-12-31", qtyOnHand: 100, unitCost: "100" });
  const sale = await withPharmacy(dbs.app, pharmacyId, (tx) =>
    commitSale(tx, ctx, { customerName: "Budi", lines: [{ productId, unitId: tablet, qty: 20, discountPct: "10" }] }, [{ paymentMethodId: methods.find((m) => m.name === "Tunai")!.id, amount: "4000", confirmed: true }]),
  );
  return { ...ctx, saleId: sale.saleId, receiptNo: sale.receiptNo };
}

const thermal = (port: number, over: Partial<PrinterInput> = {}): PrinterInput => ({ code: uniqueName("KASIR"), name: "Kasir", type: "thermal_escpos", connection: "network", host: "127.0.0.1", port, paperWidthMm: 58, ...over });
const addPrinter = (s: Setup, input: PrinterInput) => withPharmacy(dbs.app, s.pharmacyId, (tx) => createPrinter(tx, s, input));
const queue = (s: Setup, printerId: number, documentType: "sale_receipt" | "test" = "sale_receipt") =>
  withPharmacy(dbs.app, s.pharmacyId, (tx) => enqueuePrintJob(tx, s, { printerId, documentType, documentId: documentType === "test" ? printerId : s.saleId }));
const jobOf = async (id: number) => (await dbs.admin.select().from(printJobs).where(eq(printJobs.id, id)))[0];

// A fake network printer: collects every byte sent to it.
async function fakePrinter() {
  const received: Buffer[] = [];
  const server = net.createServer((socket) => socket.on("data", (d) => received.push(d)));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { port: (server.address() as net.AddressInfo).port, bytes: () => Buffer.concat(received), close: () => new Promise((r) => server.close(r)) };
}

const model: ReceiptModel = {
  pharmacyName: "Apotek Sehat Sentosa", address: "Jl. Mawar 1", phone: "021123", header: null, footer: null, receiptNo: "29102026001", dateTime: "2026-10-29 08:47", customerName: "Budi",
  lines: [{ name: "Paracetamol 500mg Extra Strong Film Coated", qty: 2, unitName: "Strip", unitPrice: "2000.00", discountPct: "10.00", lineTotal: "3600.00" }],
  discountTotal: "400.00", grandTotal: "3600.00", payments: [{ method: "Tunai", amount: "4000.00" }], change: "400.00",
};

describe("receipt layout", () => {
  it("formats rupiah and keeps only printable ASCII", () => {
    expect(formatMoney("3600.00")).toBe("3.600");
    expect(formatMoney("1234567.50")).toBe("1.234.567,50");
    expect(formatMoney("-400.00")).toBe("-400");
    expect(toPrintable("Café Obat™ é")).toBe("Cafe Obat? e");
  });

  it("never exceeds the paper width and wraps long names", () => {
    for (const width of [32, 48]) {
      const rows = layoutReceipt(model, width);
      expect(rows.every((r) => r.text.length <= width)).toBe(true);
      expect(rows.some((r) => r.text.includes("29102026001"))).toBe(true);
    }
    const text = renderPlainText(model, 32);
    expect(text).toContain("1. Paracetamol 500mg Extra\nStrong Film Coated");
    expect(text).toContain("   2 Strip x 2.000 -10%");
    expect(text).toMatch(/Total Pembelian\s+3\.600/);
    expect(text).toMatch(/Kembalian\s+400/);
  });

  it("builds ESC/POS bytes: initialise first, cut last, plain ASCII in between", () => {
    const bytes = renderEscPos(model, 32);
    expect([...bytes.subarray(0, 2)]).toEqual([0x1b, 0x40]);
    expect([...bytes.subarray(-4)]).toEqual([0x1d, 0x56, 0x42, 0x03]);
    expect(bytes.toString("latin1")).toContain("APOTEK SEHAT SENTOSA");
  });
});

describe("operating-system printer discovery", () => {
  it("reads printer names from lpstat -p and skips unsafe names", () => {
    const stdout = [
      "printer EPSON TM-T20 is idle.  enabled since Thu Oct 29 08:00:00 2026",
      "printer Canon_iP2700_series now printing job-42. enabled since Thu Oct 29 08:00:00 2026",
      "printer HP_LaserJet disabled since Thu Oct 29 08:00:00 2026 -",
      "printer Bad;rm is idle.  enabled since Thu Oct 29 08:00:00 2026",
      "not a printer line",
    ].join("\n");
    expect(parseLpstatPrinters(stdout)).toEqual(["Canon_iP2700_series", "EPSON TM-T20", "HP_LaserJet"]);
  });
});

describe("printers and queue", () => {
  let s: Setup;
  let other: Setup;
  beforeAll(async () => {
    s = await newPharmacyWithSale();
    other = await newPharmacyWithSale();
  });

  it("loads the receipt from the saved sale (time of sale, customer, payments, change)", async () => {
    const m = await withPharmacy(dbs.app, s.pharmacyId, (tx) => loadReceiptModel(tx, s.pharmacyId, s.saleId));
    expect(m).toMatchObject({ receiptNo: s.receiptNo, customerName: "Budi", grandTotal: "3600.00", discountTotal: "400.00", change: "400.00", address: "Jl. Mawar 1, Jakarta" });
    expect(m?.payments).toEqual([{ method: "Tunai", amount: "4000.00" }]);
    expect(m?.dateTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("validates printer settings", async () => {
    await expect(addPrinter(s, thermal(9100, { host: "" }))).rejects.toThrow(/IP address/);
    await expect(addPrinter(s, thermal(0))).rejects.toThrow(/Port/);
    await expect(addPrinter(s, { ...thermal(9100), connection: "os_printer", osPrinterName: "EPSON; rm -rf /" })).rejects.toThrow(/printer name/);
    await expect(addPrinter(s, thermal(9100, { code: "bad code!" }))).rejects.toBeInstanceOf(PrintError);
    await expect(addPrinter(s, thermal(9100, { paperWidthMm: 70 }))).rejects.toThrow(/58, 80 or 210/);
    const code = uniqueName("DUP");
    await addPrinter(s, thermal(9100, { code }));
    expect((await postgresErrorOf(addPrinter(s, thermal(9100, { code })))).code).toBe("23505");
    await addPrinter(other, thermal(9100, { code })); // same code is fine in another pharmacy
  });

  it("only queues for active printers of the same pharmacy and for completed sales", async () => {
    const id = await addPrinter(s, thermal(9100));
    const foreign = await addPrinter(other, thermal(9100));
    await expect(queue(s, foreign)).rejects.toThrow(/not found/);
    await dbs.admin.update((await import("@/db/schema")).printers).set({ isActive: false }).where(eq((await import("@/db/schema")).printers.id, id));
    await expect(queue(s, id)).rejects.toThrow(/not active/);
  });

  it("sends the receipt to a network printer and marks the job done", async () => {
    const fake = await fakePrinter();
    const printerId = await addPrinter(s, thermal(fake.port));
    const jobId = await queue(s, printerId);
    expect(await runWorkerOnce(dbs.app)).toBeGreaterThanOrEqual(1);
    await new Promise((r) => setTimeout(r, 100));
    const sent = fake.bytes();
    expect([...sent.subarray(0, 2)]).toEqual([0x1b, 0x40]);
    expect(sent.toString("latin1")).toContain(s.receiptNo);
    expect(sent.toString("latin1")).toContain("Total Pembelian");
    expect(await jobOf(jobId)).toMatchObject({ status: "done", attempts: 1, lastError: null });
    await fake.close();
  });

  it("prints a test page without needing a sale", async () => {
    const fake = await fakePrinter();
    const jobId = await queue(s, await addPrinter(s, thermal(fake.port)), "test");
    await runWorkerOnce(dbs.app);
    await new Promise((r) => setTimeout(r, 100));
    expect(fake.bytes().toString("latin1")).toContain("Test print");
    expect((await jobOf(jobId)).status).toBe("done");
    await fake.close();
  });

  it("retries an unreachable printer, fails after 3 attempts, and can be retried by hand", async () => {
    const closed = await fakePrinter();
    const port = closed.port;
    await closed.close(); // nothing listens on this port any more
    const jobId = await queue(s, await addPrinter(s, thermal(port)));

    await runWorkerOnce(dbs.app);
    expect(await jobOf(jobId)).toMatchObject({ status: "queued", attempts: 1 });
    expect((await jobOf(jobId)).lastError).toBeTruthy();
    await runWorkerOnce(dbs.app);
    await runWorkerOnce(dbs.app);
    expect(await jobOf(jobId)).toMatchObject({ status: "failed", attempts: 3 });

    await withPharmacy(dbs.app, s.pharmacyId, (tx) => retryPrintJob(tx, s.pharmacyId, jobId));
    expect(await jobOf(jobId)).toMatchObject({ status: "queued", attempts: 0, lastError: null });
    await dbs.admin.update(printJobs).set({ status: "failed" }).where(eq(printJobs.id, jobId)); // leave nothing queued for other tests
    await expect(withPharmacy(dbs.app, s.pharmacyId, (tx) => retryPrintJob(tx, s.pharmacyId, 999999999))).rejects.toThrow(/Only failed/);
  });

  it("puts a job back in the queue when its worker disappeared", async () => {
    const calls: string[] = [];
    const transport: Transport = { sendNetwork: async (h, p) => void calls.push(`net ${h}:${p}`), sendOsPrinter: async () => {} };
    const jobId = await queue(s, await addPrinter(s, thermal(9100)));
    await dbs.admin.update(printJobs).set({ status: "printing", attempts: 1, claimedAt: new Date(Date.now() - 10 * 60 * 1000) }).where(eq(printJobs.id, jobId));
    await runWorkerOnce(dbs.app, transport);
    expect(calls).toEqual(["net 127.0.0.1:9100"]);
    expect(await jobOf(jobId)).toMatchObject({ status: "done", attempts: 2 });
  });

  it("uses the operating-system printer: raw bytes for thermal, plain text for normal printers", async () => {
    const sent: { name: string; raw: boolean; text: string }[] = [];
    const transport: Transport = { sendNetwork: async () => {}, sendOsPrinter: async (name, data, raw) => void sent.push({ name, raw, text: data.toString("latin1") }) };
    const os = (over: Partial<PrinterInput>) => addPrinter(s, { code: uniqueName("OS"), name: "OS", type: "standard", connection: "os_printer", osPrinterName: "Canon iP2700 series", paperWidthMm: 210, ...over });
    await queue(s, await os({}));
    await queue(s, await os({ type: "thermal_escpos", osPrinterName: "EPSON TM-T20", paperWidthMm: 80 }));
    await runWorkerOnce(dbs.app, transport);
    const normal = sent.find((x) => x.name === "Canon iP2700 series")!;
    expect(normal.raw).toBe(false);
    expect(normal.text).not.toContain("\x1b");
    expect(normal.text).toContain(s.receiptNo);
    const rawJob = sent.find((x) => x.name === "EPSON TM-T20")!;
    expect(rawJob.raw).toBe(true);
    expect(rawJob.text.startsWith("\x1b@")).toBe(true);
  });

  it("a pharmacy's jobs never reach another pharmacy's printer", async () => {
    const fakeA = await fakePrinter();
    const fakeB = await fakePrinter();
    await queue(s, await addPrinter(s, thermal(fakeA.port)));
    await queue(other, await addPrinter(other, thermal(fakeB.port)));
    await runWorkerOnce(dbs.app);
    await new Promise((r) => setTimeout(r, 100));
    const nameOf = async (x: Setup) => (await dbs.admin.select().from(pharmacies).where(eq(pharmacies.id, x.pharmacyId)))[0].name.toUpperCase();
    // (receipt numbers can coincide between pharmacies, so the pharmacy name tells the receipts apart)
    expect(fakeA.bytes().toString("latin1")).toContain(await nameOf(s));
    expect(fakeA.bytes().toString("latin1")).not.toContain(await nameOf(other));
    expect(fakeB.bytes().toString("latin1")).toContain(await nameOf(other));
    await Promise.all([fakeA.close(), fakeB.close()]);
  });
});
