"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { type FormState, zodErrors } from "@/lib/form";
import { getDb } from "@/db/client";
import { setSessionCookie } from "@/lib/auth";
import { authenticate, listActiveMemberships } from "@/server/auth/login";
import { createSession } from "@/server/auth/sessions";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const LoginInput = z.object({
  username: z.string().trim().min(1, "Username is required").max(100),
  password: z.string().min(1, "Password is required").max(200),
});

export type LoginState = FormState;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginInput.safeParse({ username: formData.get("username"), password: formData.get("password") });
  if (!parsed.success) return zodErrors(parsed.error);

  const db = getDb();
  const result = await authenticate(db, parsed.data.username, parsed.data.password);
  // Same message for unknown user and wrong password.
  if (!result) return { error: "Wrong username or password." };

  const pharmaciesOfUser = await listActiveMemberships(db, result.userId);
  const [user] = await db.select({ isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, result.userId));
  const onlyPharmacy = pharmaciesOfUser.length === 1 ? pharmaciesOfUser[0].pharmacyId : null;

  if (pharmaciesOfUser.length === 0 && !user.isPlatformAdmin) {
    return { error: "Your account is not active in any pharmacy. Ask your pharmacy admin." };
  }

  const { token, expiresAt } = await createSession(db, result.userId, onlyPharmacy);
  await setSessionCookie(token, expiresAt);

  if (onlyPharmacy) redirect("/dashboard");
  if (pharmaciesOfUser.length > 1) redirect("/select-pharmacy");
  redirect("/platform/pharmacies");
}
