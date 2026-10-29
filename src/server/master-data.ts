import { and, asc, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { adjustmentReasons, categories, customers, productStatuses, suppliers, units } from "@/db/schema";

// Simple per-pharmacy lists. Every function runs inside withPharmacy(), so RLS also applies;
// the explicit pharmacy_id filters are the first layer of isolation.

export const LOOKUP_KINDS = {
  categories: { table: categories, label: "Categories" },
  units: { table: units, label: "Units" },
  statuses: { table: productStatuses, label: "Product statuses" },
  "adjustment-reasons": { table: adjustmentReasons, label: "Adjustment reasons" },
} as const;
export type LookupKind = keyof typeof LOOKUP_KINDS;

export const PARTNER_KINDS = {
  suppliers: { table: suppliers, label: "Suppliers" },
  customers: { table: customers, label: "Customers" },
} as const;
export type PartnerKind = keyof typeof PARTNER_KINDS;

export function isLookupKind(value: string): value is LookupKind {
  return value in LOOKUP_KINDS;
}
export function isPartnerKind(value: string): value is PartnerKind {
  return value in PARTNER_KINDS;
}

// The lookup tables share one column shape, so one table type stands in for all of them.
type LookupTable = typeof categories;
type PartnerTable = typeof suppliers;

export async function listLookup(tx: Tx, pharmacyId: number, kind: LookupKind) {
  const t = LOOKUP_KINDS[kind].table as LookupTable;
  return tx.select({ id: t.id, name: t.name, isActive: t.isActive }).from(t).where(eq(t.pharmacyId, pharmacyId)).orderBy(asc(t.name));
}

export async function createLookup(tx: Tx, pharmacyId: number, userId: number, kind: LookupKind, name: string) {
  const t = LOOKUP_KINDS[kind].table as LookupTable;
  await tx.insert(t).values({ pharmacyId, name: name.trim(), createdBy: userId });
}

export async function updateLookup(tx: Tx, pharmacyId: number, userId: number, kind: LookupKind, id: number, patch: { name?: string; isActive?: boolean }) {
  const t = LOOKUP_KINDS[kind].table as LookupTable;
  await tx
    .update(t)
    .set({ ...(patch.name !== undefined && { name: patch.name.trim() }), ...(patch.isActive !== undefined && { isActive: patch.isActive }), updatedAt: new Date(), updatedBy: userId })
    .where(and(eq(t.pharmacyId, pharmacyId), eq(t.id, id)));
}

export type PartnerInput = { name: string; phone?: string | null; address?: string | null };

export async function listPartners(tx: Tx, pharmacyId: number, kind: PartnerKind) {
  const t = PARTNER_KINDS[kind].table as PartnerTable;
  return tx
    .select({ id: t.id, name: t.name, phone: t.phone, address: t.address, isActive: t.isActive })
    .from(t)
    .where(eq(t.pharmacyId, pharmacyId))
    .orderBy(asc(t.name));
}

export async function createPartner(tx: Tx, pharmacyId: number, userId: number, kind: PartnerKind, input: PartnerInput) {
  const t = PARTNER_KINDS[kind].table as PartnerTable;
  await tx.insert(t).values({ pharmacyId, name: input.name.trim(), phone: input.phone || null, address: input.address || null, createdBy: userId });
}

export async function setPartnerActive(tx: Tx, pharmacyId: number, userId: number, kind: PartnerKind, id: number, isActive: boolean) {
  const t = PARTNER_KINDS[kind].table as PartnerTable;
  await tx.update(t).set({ isActive, updatedAt: new Date(), updatedBy: userId }).where(and(eq(t.pharmacyId, pharmacyId), eq(t.id, id)));
}
