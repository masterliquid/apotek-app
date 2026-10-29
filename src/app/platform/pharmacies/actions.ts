"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type FormState, zodErrors, fieldError } from "@/lib/form";
import { getDb } from "@/db/client";
import { requirePlatformAdmin } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/password";
import { isUniqueViolation } from "@/server/db-errors";
import { createPharmacyWithOwner } from "@/server/pharmacies";

const NewPharmacy = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9-]+$/, "Code: letters, numbers and dash only"),
  name: z.string().trim().min(1, "Name is required").max(150),
  address: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(50).optional(),
  ownerUsername: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, "Owner username: letters, numbers, dot, dash or underscore"),
  ownerFullName: z.string().trim().min(1, "Owner name is required").max(100),
  ownerPassword: z.string().min(MIN_PASSWORD_LENGTH, `Owner password needs at least ${MIN_PASSWORD_LENGTH} characters`).max(200),
});

export type PharmacyFormState = FormState;

export async function createPharmacyAction(_prev: PharmacyFormState, formData: FormData): Promise<PharmacyFormState> {
  const session = await requirePlatformAdmin();
  const parsed = NewPharmacy.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const d = parsed.data;
  try {
    await createPharmacyWithOwner(
      getDb(),
      { code: d.code, name: d.name, address: d.address || null, phone: d.phone || null, owner: { username: d.ownerUsername, fullName: d.ownerFullName, password: d.ownerPassword } },
      session.user.id,
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      const constraint = String((error as { cause?: { constraint?: string } }).cause?.constraint ?? "");
      return constraint.includes("username") ? fieldError("ownerUsername", "That username is already taken. Choose another one.") : fieldError("code", "That pharmacy code already exists. Use a different code.");
    }
    throw error;
  }
  revalidatePath("/platform/pharmacies");
  return { success: `Pharmacy ${d.name} created with owner ${d.ownerUsername}.` };
}
