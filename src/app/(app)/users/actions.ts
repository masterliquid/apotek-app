"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type FormState, zodErrors, fieldError } from "@/lib/form";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/password";
import { ROLES } from "@/server/auth/permissions";
import { isUniqueViolation } from "@/server/db-errors";
import { createPharmacyUser, NotAllowedError, setMembershipActive } from "@/server/users";

const NewUser = z.object({
  username: z.string().trim().min(3, "Username needs at least 3 characters").max(50).regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dot, dash or underscore"),
  fullName: z.string().trim().min(1, "Full name is required").max(100),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password needs at least ${MIN_PASSWORD_LENGTH} characters`).max(200),
  role: z.enum(ROLES),
});

export type UserFormState = FormState;

export async function createUserAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const session = await requirePermission("users.manage");
  const parsed = NewUser.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  try {
    await createPharmacyUser(getDb(), { userId: session.user.id, pharmacyId: session.pharmacy.id, role: session.role }, parsed.data);
  } catch (error) {
    if (error instanceof NotAllowedError) return { error: "You cannot create a user with that role." };
    if (isUniqueViolation(error)) return fieldError("username", "That username is already taken. Choose another one.");
    throw error;
  }
  revalidatePath("/users");
  return { success: `User ${parsed.data.username} created.` };
}

export async function toggleUserAction(formData: FormData) {
  const session = await requirePermission("users.manage");
  const userId = Number(formData.get("userId"));
  const activate = formData.get("activate") === "true";
  if (!Number.isSafeInteger(userId)) return;
  await setMembershipActive(getDb(), { userId: session.user.id, pharmacyId: session.pharmacy.id, role: session.role }, userId, activate);
  revalidatePath("/users");
}
