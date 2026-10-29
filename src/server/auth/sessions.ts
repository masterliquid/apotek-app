import { and, eq, lt } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "@/db/client";
import { memberships, pharmacies, sessions, users } from "@/db/schema";
import type { Role } from "./permissions";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Extend a session when less than half of its lifetime is left (sliding expiry).
const RENEW_THRESHOLD_MS = SESSION_TTL_MS / 2;

export type SessionContext = {
  sessionId: string;
  expiresAt: Date;
  user: { id: number; username: string; fullName: string; isPlatformAdmin: boolean };
  // Present only when a pharmacy is selected and the membership + pharmacy are still active.
  pharmacy: { id: number; code: string; name: string } | null;
  role: Role | null;
};

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

// The cookie holds the raw token; the database stores only its hash, so a DB leak does not leak sessions.
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(db: Db, userId: number, pharmacyId: number | null, now = new Date()) {
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashSessionToken(token), userId, pharmacyId, expiresAt });
  return { token, expiresAt };
}

export async function validateSessionToken(db: Db, token: string, now = new Date()): Promise<SessionContext | null> {
  const sessionId = hashSessionToken(token);
  const [row] = await db
    .select({
      session: sessions,
      user: { id: users.id, username: users.username, fullName: users.fullName, isPlatformAdmin: users.isPlatformAdmin, isActive: users.isActive },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) return null;
  if (!row.user.isActive || row.session.expiresAt.getTime() <= now.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  let expiresAt = row.session.expiresAt;
  if (expiresAt.getTime() - now.getTime() < RENEW_THRESHOLD_MS) {
    expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, sessionId));
  }

  let pharmacy: SessionContext["pharmacy"] = null;
  let role: Role | null = null;
  if (row.session.pharmacyId !== null) {
    const [m] = await db
      .select({ id: pharmacies.id, code: pharmacies.code, name: pharmacies.name, role: memberships.role })
      .from(memberships)
      .innerJoin(pharmacies, eq(pharmacies.id, memberships.pharmacyId))
      .where(
        and(
          eq(memberships.userId, row.user.id),
          eq(memberships.pharmacyId, row.session.pharmacyId),
          eq(memberships.isActive, true),
          eq(pharmacies.isActive, true),
        ),
      )
      .limit(1);
    if (m) {
      pharmacy = { id: m.id, code: m.code, name: m.name };
      role = m.role;
    }
  }

  const user = { id: row.user.id, username: row.user.username, fullName: row.user.fullName, isPlatformAdmin: row.user.isPlatformAdmin };
  return { sessionId, expiresAt, user, pharmacy, role };
}

export async function selectSessionPharmacy(db: Db, sessionId: string, userId: number, pharmacyId: number): Promise<boolean> {
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(pharmacies, eq(pharmacies.id, memberships.pharmacyId))
    .where(and(eq(memberships.userId, userId), eq(memberships.pharmacyId, pharmacyId), eq(memberships.isActive, true), eq(pharmacies.isActive, true)))
    .limit(1);
  if (!m) return false;
  await db.update(sessions).set({ pharmacyId }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  return true;
}

export async function deleteSessionByToken(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashSessionToken(token)));
}

export async function deleteExpiredSessions(db: Db, now = new Date()): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
}
