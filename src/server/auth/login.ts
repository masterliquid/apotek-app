import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { memberships, pharmacies, users } from "@/db/schema";
import { hashPassword, verifyLegacySha1, verifyPassword } from "./password";
import type { Role } from "./permissions";

// Usernames are stored lowercase; legacy login also compared LOWER(username).
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export async function authenticate(db: Db, username: string, password: string): Promise<{ userId: number } | null> {
  const [user] = await db.select().from(users).where(eq(users.username, normalizeUsername(username))).limit(1);
  if (!user || !user.isActive) return null;

  if (user.passwordHash) {
    if (!(await verifyPassword(user.passwordHash, password))) return null;
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    return { userId: user.id };
  }

  // Imported user with a legacy sha1 hash: verify once, then upgrade to Argon2id and drop the old hash.
  if (user.legacyPasswordSha1 && user.legacyPasswordSalt !== null) {
    if (!verifyLegacySha1(password, user.legacyPasswordSalt, user.legacyPasswordSha1)) return null;
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password), legacyPasswordSha1: null, legacyPasswordSalt: null, lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return { userId: user.id };
  }

  return null;
}

export async function listActiveMemberships(db: Db, userId: number): Promise<{ pharmacyId: number; code: string; name: string; role: Role }[]> {
  return db
    .select({ pharmacyId: pharmacies.id, code: pharmacies.code, name: pharmacies.name, role: memberships.role })
    .from(memberships)
    .innerJoin(pharmacies, eq(pharmacies.id, memberships.pharmacyId))
    .where(and(eq(memberships.userId, userId), eq(memberships.isActive, true), eq(pharmacies.isActive, true)))
    .orderBy(asc(pharmacies.name));
}
