import { asc, eq } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { adjustmentReasons, categories, memberships, paymentMethods, pharmacies, productStatuses, units, users } from "@/db/schema";
import { normalizeUsername } from "./auth/login";
import { hashPassword } from "./auth/password";
import { setPharmacyContext } from "./tenant";

// Starting lookup values for a new pharmacy, taken from the legacy seed data (apotek.sql). All editable.
const DEFAULT_CATEGORIES = ["Obat Keras", "Obat Bebas", "Obat Bebas Terbatas", "Psikotropika dan Narkotika", "Minuman", "Kosmetik"];
const DEFAULT_UNITS = ["Tablet", "Strip", "Box", "Botol"];
const DEFAULT_PRODUCT_STATUSES = ["Ready-Stock", "Konsinyasi", "Discontinued"];
const DEFAULT_ADJUSTMENT_REASONS = ["Barang Hilang", "Barang Ditemukan", "Pemakaian Pribadi"];
// Payment methods are new (owner decision: record method + status only, no gateway).
const DEFAULT_PAYMENT_METHODS: { name: string; kind: "cash" | "non_cash" }[] = [
  { name: "Tunai", kind: "cash" },
  { name: "Transfer Bank", kind: "non_cash" },
  { name: "QRIS", kind: "non_cash" },
  { name: "Kartu Debit", kind: "non_cash" },
];

export type NewPharmacyInput = {
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  owner: { username: string; fullName: string; password: string };
};

export async function createPharmacyWithOwner(db: Db, input: NewPharmacyInput, createdBy: number | null) {
  const passwordHash = await hashPassword(input.owner.password);
  return db.transaction(async (tx) => {
    const [pharmacy] = await tx
      .insert(pharmacies)
      .values({ code: input.code.trim().toUpperCase(), name: input.name.trim(), address: input.address ?? null, phone: input.phone ?? null })
      .returning({ id: pharmacies.id });

    const [owner] = await tx
      .insert(users)
      .values({ username: normalizeUsername(input.owner.username), fullName: input.owner.fullName.trim(), passwordHash })
      .returning({ id: users.id });

    await tx.insert(memberships).values({ userId: owner.id, pharmacyId: pharmacy.id, role: "owner" });

    await setPharmacyContext(tx, pharmacy.id);
    await insertDefaultLookups(tx, pharmacy.id, createdBy);

    return { pharmacyId: pharmacy.id, ownerUserId: owner.id };
  });
}

// Creates a pharmacy and makes an EXISTING user its owner (e.g. the platform admin adding a pharmacy for themselves).
export async function createPharmacyForExistingUser(db: Db, input: { code: string; name: string; address?: string | null; phone?: string | null }, ownerUserId: number) {
  return db.transaction(async (tx) => {
    const [pharmacy] = await tx
      .insert(pharmacies)
      .values({ code: input.code.trim().toUpperCase(), name: input.name.trim(), address: input.address ?? null, phone: input.phone ?? null })
      .returning({ id: pharmacies.id });
    await tx.insert(memberships).values({ userId: ownerUserId, pharmacyId: pharmacy.id, role: "owner" });
    await setPharmacyContext(tx, pharmacy.id);
    await insertDefaultLookups(tx, pharmacy.id, ownerUserId);
    return { pharmacyId: pharmacy.id };
  });
}

async function insertDefaultLookups(tx: Tx, pharmacyId: number, createdBy: number | null) {
  const rows = (names: string[]) => names.map((name) => ({ pharmacyId, name, createdBy }));
  await tx.insert(categories).values(rows(DEFAULT_CATEGORIES));
  await tx.insert(units).values(rows(DEFAULT_UNITS));
  await tx.insert(productStatuses).values(rows(DEFAULT_PRODUCT_STATUSES));
  await tx.insert(adjustmentReasons).values(rows(DEFAULT_ADJUSTMENT_REASONS));
  await tx.insert(paymentMethods).values(DEFAULT_PAYMENT_METHODS.map((m) => ({ pharmacyId, ...m, createdBy })));
}

export async function listPharmacies(db: Db) {
  return db
    .select({ id: pharmacies.id, code: pharmacies.code, name: pharmacies.name, isActive: pharmacies.isActive, createdAt: pharmacies.createdAt })
    .from(pharmacies)
    .orderBy(asc(pharmacies.name));
}

export async function getPharmacy(db: Db, pharmacyId: number) {
  const [row] = await db.select().from(pharmacies).where(eq(pharmacies.id, pharmacyId)).limit(1);
  return row ?? null;
}

export type PharmacySettingsInput = {
  name: string;
  address: string | null;
  phone: string | null;
  receiptHeader: string | null;
  receiptFooter: string | null;
  buyPriceMarkupPct: string;
  expiryWarningDays: number;
};

// Per-pharmacy settings. The legacy app hard-coded the store name and address inside the receipt JavaScript.
export async function updatePharmacySettings(db: Db, pharmacyId: number, input: PharmacySettingsInput) {
  await db
    .update(pharmacies)
    .set({ ...input, name: input.name.trim(), updatedAt: new Date() })
    .where(eq(pharmacies.id, pharmacyId));
}
