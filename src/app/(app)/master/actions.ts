"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type FormState, zodErrors, fieldError } from "@/lib/form";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth";
import type { Permission } from "@/server/auth/permissions";
import { isUniqueViolation } from "@/server/db-errors";
import { createLookup, createPartner, isLookupKind, isPartnerKind, setPartnerActive, updateLookup } from "@/server/master-data";
import { withPharmacy } from "@/server/tenant";

export type MasterFormState = FormState;

const Input = z.object({
  kind: z.string(),
  name: z.string().trim().min(1, "Name is required").max(150),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional(),
});

function permissionFor(kind: string): Permission {
  if (isLookupKind(kind)) return "products.edit_details";
  return kind === "customers" ? "customers.create" : "partners.manage";
}

export async function createMasterAction(_prev: MasterFormState, formData: FormData): Promise<MasterFormState> {
  const parsed = Input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const { kind, name, phone, address } = parsed.data;
  if (!isLookupKind(kind) && !isPartnerKind(kind)) return { error: "Unknown list." };

  const session = await requirePermission(permissionFor(kind));
  const pharmacyId = session.pharmacy.id;
  try {
    await withPharmacy(getDb(), pharmacyId, (tx) =>
      isLookupKind(kind) ? createLookup(tx, pharmacyId, session.user.id, kind, name) : createPartner(tx, pharmacyId, session.user.id, kind as "suppliers" | "customers", { name, phone, address }),
    );
  } catch (error) {
    if (isUniqueViolation(error)) return fieldError("name", "That name already exists.");
    throw error;
  }
  revalidatePath(`/master/${kind}`);
  return { success: `${name} added.` };
}

export async function toggleMasterAction(formData: FormData) {
  const kind = String(formData.get("kind"));
  const id = Number(formData.get("id"));
  const activate = formData.get("activate") === "true";
  if (!Number.isSafeInteger(id) || (!isLookupKind(kind) && !isPartnerKind(kind))) return;

  const session = await requirePermission(permissionFor(kind));
  const pharmacyId = session.pharmacy.id;
  await withPharmacy(getDb(), pharmacyId, (tx) =>
    isLookupKind(kind) ? updateLookup(tx, pharmacyId, session.user.id, kind, id, { isActive: activate }) : setPartnerActive(tx, pharmacyId, session.user.id, kind as "suppliers" | "customers", id, activate),
  );
  revalidatePath(`/master/${kind}`);
}
