"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth";
import { selectSessionPharmacy } from "@/server/auth/sessions";

export async function selectPharmacyAction(formData: FormData) {
  const session = await requireUser();
  const pharmacyId = Number(formData.get("pharmacyId"));
  if (!Number.isSafeInteger(pharmacyId)) redirect("/select-pharmacy");
  const ok = await selectSessionPharmacy(getDb(), session.sessionId, session.user.id, pharmacyId);
  redirect(ok ? "/dashboard" : "/select-pharmacy");
}
