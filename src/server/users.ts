import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { memberships, users } from "@/db/schema";
import { normalizeUsername } from "./auth/login";
import { hashPassword } from "./auth/password";
import { canManageRole, type Role } from "./auth/permissions";

export class NotAllowedError extends Error {
  constructor(message = "You are not allowed to do this") {
    super(message);
    this.name = "NotAllowedError";
  }
}

export type Actor = { userId: number; pharmacyId: number; role: Role };

export async function createPharmacyUser(
  db: Db,
  actor: Actor,
  input: { username: string; fullName: string; password: string; role: Role },
): Promise<{ userId: number }> {
  if (!canManageRole(actor.role, input.role)) throw new NotAllowedError();
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ username: normalizeUsername(input.username), fullName: input.fullName.trim(), passwordHash })
      .returning({ id: users.id });
    await tx.insert(memberships).values({ userId: user.id, pharmacyId: actor.pharmacyId, role: input.role });
    return { userId: user.id };
  });
}

export async function setMembershipActive(db: Db, actor: Actor, targetUserId: number, isActive: boolean): Promise<void> {
  if (targetUserId === actor.userId) throw new NotAllowedError("You cannot deactivate yourself");
  const [target] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, targetUserId), eq(memberships.pharmacyId, actor.pharmacyId)))
    .limit(1);
  if (!target || !canManageRole(actor.role, target.role)) throw new NotAllowedError();
  await db
    .update(memberships)
    .set({ isActive })
    .where(and(eq(memberships.userId, targetUserId), eq(memberships.pharmacyId, actor.pharmacyId)));
}

export async function listPharmacyUsers(db: Db, pharmacyId: number) {
  return db
    .select({ userId: users.id, username: users.username, fullName: users.fullName, role: memberships.role, isActive: memberships.isActive, lastLoginAt: users.lastLoginAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.pharmacyId, pharmacyId))
    .orderBy(asc(users.username));
}
