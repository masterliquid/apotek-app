import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";

// Pharmacies work on Jakarta time; the server (or Docker) clock may be UTC. Pharmacy-level timezone can come later.
const TIME_ZONE = "Asia/Jakarta";

// "2026-10-29"
export function dayInPharmacyTime(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

// Next number for (pharmacy, document type, period). The upsert locks the counter row, so concurrent callers
// get different numbers, and a rolled-back transaction does not burn a number.
export async function nextDocumentNumber(tx: Tx, pharmacyId: number, docType: string, period: string): Promise<number> {
  const result = await tx.execute(sql`
    insert into document_counters (pharmacy_id, doc_type, period, last_value)
    values (${pharmacyId}, ${docType}, ${period}, 1)
    on conflict (pharmacy_id, doc_type, period) do update set last_value = document_counters.last_value + 1
    returning last_value`);
  return Number((result.rows[0] as { last_value: number }).last_value);
}

// e.g. PO-20261029-001
export async function nextDailyNumber(tx: Tx, pharmacyId: number, prefix: string, now = new Date()): Promise<string> {
  const day = dayInPharmacyTime(now);
  const n = await nextDocumentNumber(tx, pharmacyId, prefix, day);
  return `${prefix}-${day.replaceAll("-", "")}-${String(n).padStart(3, "0")}`;
}
