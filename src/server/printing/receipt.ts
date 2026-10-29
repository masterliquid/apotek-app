import Decimal from "decimal.js";
import type { Tx } from "@/db/client";
import { pharmacies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSale } from "../sales";

export type ReceiptModel = {
  pharmacyName: string;
  address: string | null;
  phone: string | null;
  header: string | null;
  footer: string | null;
  receiptNo: string;
  dateTime: string;
  customerName: string | null;
  lines: { name: string; qty: number; unitName: string; unitPrice: string; discountPct: string; lineTotal: string }[];
  discountTotal: string;
  grandTotal: string;
  payments: { method: string; amount: string }[];
  change: string;
};

// "3600.00" -> "3.600", "1234.50" -> "1.234,50" (Indonesian style; whole rupiah shown without decimals).
export function formatMoney(value: string): string {
  const d = new Decimal(value);
  const [int, frac] = d.abs().toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${d.isNegative() ? "-" : ""}${grouped}${frac === "00" ? "" : `,${frac}`}`;
}

// Receipt printers only reliably print plain ASCII; accents are stripped, anything else becomes "?".
export function toPrintable(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "?");
}

export async function loadReceiptModel(tx: Tx, pharmacyId: number, saleId: number): Promise<ReceiptModel | null> {
  const sale = await getSale(tx, pharmacyId, saleId);
  if (!sale || sale.status !== "committed" || !sale.receiptNo || !sale.committedAt) return null;
  const [pharmacy] = await tx.select().from(pharmacies).where(eq(pharmacies.id, pharmacyId));
  return {
    pharmacyName: pharmacy.name,
    address: pharmacy.address,
    phone: pharmacy.phone,
    header: pharmacy.receiptHeader,
    footer: pharmacy.receiptFooter,
    receiptNo: sale.receiptNo,
    // The time of the sale (not of printing, which is what the legacy reprint got wrong), in Jakarta time.
    dateTime: sale.committedAt.toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).slice(0, 16),
    customerName: sale.customerName,
    lines: sale.lines.map((l) => ({ name: l.productName, qty: l.qty, unitName: l.unitName, unitPrice: l.unitPrice, discountPct: l.discountPct, lineTotal: l.lineTotal })),
    discountTotal: sale.discountTotal,
    grandTotal: sale.grandTotal,
    payments: sale.payments.map((p) => ({ method: p.method, amount: p.amount })),
    change: sale.changeAmount,
  };
}

export function paperColumns(paperWidthMm: number): number {
  return paperWidthMm <= 58 ? 32 : 48;
}

export type Row = { text: string; align?: "left" | "center"; bold?: boolean };

// Left text and right text on one line, the right one flush to the edge.
const twoColumns = (left: string, right: string, width: number): string => {
  const room = Math.max(width - right.length - 1, 0);
  return `${left.length > room ? left.slice(0, room) : left.padEnd(room)} ${right}`.slice(0, width);
};

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  const flush = () => {
    if (line) out.push(line);
    line = "";
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > width) {
      flush();
      for (let i = 0; i < word.length; i += width) out.push(word.slice(i, i + width));
    } else if (!line) {
      line = word;
    } else if (line.length + 1 + word.length <= width) {
      line += ` ${word}`;
    } else {
      flush();
      line = word;
    }
  }
  flush();
  return out;
}

// One layout for every output: thermal bytes, plain text for normal printers, and the on-screen preview.
export function layoutReceipt(m: ReceiptModel, width: number): Row[] {
  const rows: Row[] = [];
  const text = (t: string, opts: Partial<Row> = {}) => rows.push({ text: toPrintable(t), ...opts });
  const rule = () => text("-".repeat(width));
  const money = (v: string) => formatMoney(v);

  for (const l of wrap(m.pharmacyName.toUpperCase(), width)) text(l, { align: "center", bold: true });
  for (const part of [m.address, m.phone && `Telp ${m.phone}`, m.header]) if (part) for (const l of wrap(part, width)) text(l, { align: "center" });
  rule();
  text(twoColumns("No Transaksi", m.receiptNo, width));
  text(twoColumns("Tanggal", m.dateTime, width));
  if (m.customerName) text(twoColumns("Pembeli", m.customerName, width));
  rule();

  m.lines.forEach((l, i) => {
    for (const w of wrap(`${i + 1}. ${l.name}`, width)) text(w);
    const discount = new Decimal(l.discountPct).isZero() ? "" : ` -${new Decimal(l.discountPct).toFixed(0)}%`;
    text(twoColumns(`   ${l.qty} ${l.unitName} x ${money(l.unitPrice)}${discount}`, money(l.lineTotal), width));
  });
  rule();
  if (!new Decimal(m.discountTotal).isZero()) text(twoColumns("Diskon", `-${money(m.discountTotal)}`, width));
  text(twoColumns("Total Pembelian", money(m.grandTotal), width), { bold: true });
  for (const p of m.payments) text(twoColumns(p.method, money(p.amount), width));
  text(twoColumns("Kembalian", money(m.change), width));
  rule();
  text(m.footer ? m.footer : "Terima kasih", { align: "center" });
  if (m.footer === null) text("Semoga lekas sembuh", { align: "center" });
  return rows;
}

export function renderPlainText(m: ReceiptModel, width: number): string {
  return layoutReceipt(m, width).map((r) => (r.align === "center" ? r.text.padStart(Math.floor((width + r.text.length) / 2)) : r.text)).join("\n") + "\n\n\n";
}

const ESC = 0x1b;
const GS = 0x1d;

// ESC/POS: initialise, text with alignment/bold, feed and partial cut. Printers without a cutter ignore the cut.
export function renderEscPos(m: ReceiptModel, width: number): Buffer {
  const parts: Buffer[] = [Buffer.from([ESC, 0x40])];
  for (const r of layoutReceipt(m, width)) {
    parts.push(Buffer.from([ESC, 0x61, r.align === "center" ? 1 : 0, ESC, 0x45, r.bold ? 1 : 0]), Buffer.from(`${r.text}\n`, "ascii"));
  }
  parts.push(Buffer.from([ESC, 0x45, 0, ESC, 0x61, 0, ESC, 0x64, 4, GS, 0x56, 0x42, 0x03]));
  return Buffer.concat(parts);
}

// Printed by the "Test print" button so a printer can be checked without making a sale.
export function testPageModel(pharmacyName: string, printerCode: string): ReceiptModel {
  return {
    pharmacyName, address: null, phone: null, header: `Test print - printer ${printerCode}`, footer: "If you can read this, printing works.",
    receiptNo: "TEST", dateTime: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).slice(0, 16), customerName: null,
    lines: [{ name: "Test item 1234567890 ABCDEFGHIJ", qty: 1, unitName: "pcs", unitPrice: "1000.00", discountPct: "0.00", lineTotal: "1000.00" }],
    discountTotal: "0.00", grandTotal: "1000.00", payments: [{ method: "Tunai", amount: "1000.00" }], change: "0.00",
  };
}
