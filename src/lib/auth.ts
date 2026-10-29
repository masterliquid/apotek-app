import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { can, type Permission, type Role } from "@/server/auth/permissions";
import { type SessionContext, validateSessionToken } from "@/server/auth/sessions";
import { NotAllowedError } from "@/server/users";

const SESSION_COOKIE = "apotek_session";

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

// Read once per request (React cache). Must be called inside a <Suspense> boundary (Cache Components).
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  // Session expiry depends on the current time; mark this as request-time work so Next does not try to prerender it.
  await connection();
  return validateSessionToken(getDb(), token);
});

export async function requireUser(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export type PharmacySession = SessionContext & { pharmacy: NonNullable<SessionContext["pharmacy"]>; role: Role };

export async function requirePharmacy(): Promise<PharmacySession> {
  const session = await requireUser();
  if (!session.pharmacy || !session.role) redirect(session.user.isPlatformAdmin ? "/platform/pharmacies" : "/select-pharmacy");
  return session as PharmacySession;
}

export async function requirePlatformAdmin(): Promise<SessionContext> {
  const session = await requireUser();
  if (!session.user.isPlatformAdmin) redirect("/");
  return session;
}

// For Server Actions: re-checks the session and the permission on every call.
export async function requirePermission(permission: Permission): Promise<PharmacySession> {
  const session = await requirePharmacy();
  if (!can(session.role, permission)) throw new NotAllowedError();
  return session;
}
