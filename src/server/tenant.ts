import { sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";

// Runs `fn` in a transaction scoped to one pharmacy. Row-Level Security policies read `app.pharmacy_id`,
// so inside `fn` the database only exposes (and only accepts writes for) this pharmacy's rows.
// Service code must still filter by pharmacyId explicitly; RLS is the safety net, not the only check.
export async function withPharmacy<T>(db: Db, pharmacyId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!Number.isSafeInteger(pharmacyId) || pharmacyId <= 0) {
    throw new Error("Invalid pharmacy id");
  }
  return db.transaction(async (tx) => {
    await setPharmacyContext(tx, pharmacyId);
    return fn(tx);
  });
}

export async function setPharmacyContext(tx: Tx, pharmacyId: number): Promise<void> {
  // `true` = local to the current transaction.
  await tx.execute(sql`select set_config('app.pharmacy_id', ${String(pharmacyId)}, true)`);
}
