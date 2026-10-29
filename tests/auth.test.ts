import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { users } from "@/db/schema";
import { authenticate, listActiveMemberships } from "@/server/auth/login";
import { createSession, hashSessionToken, selectSessionPharmacy, validateSessionToken } from "@/server/auth/sessions";
import { createPharmacyWithOwner } from "@/server/pharmacies";
import { createPharmacyUser, NotAllowedError, setMembershipActive } from "@/server/users";
import { connectTestDbs, uniqueName } from "./helpers";

const dbs = connectTestDbs();
afterAll(() => dbs.close());

async function newPharmacy() {
  const owner = uniqueName("owner");
  const result = await createPharmacyWithOwner(
    dbs.app,
    { code: uniqueName("PH"), name: uniqueName("Apotek "), owner: { username: owner, fullName: "Owner", password: "owner-password-1" } },
    null,
  );
  return { ...result, ownerUsername: owner };
}

describe("authentication", () => {
  it("logs in with the right password only, case-insensitive username", async () => {
    const { ownerUsername, ownerUserId } = await newPharmacy();
    expect(await authenticate(dbs.app, ownerUsername.toUpperCase(), "owner-password-1")).toEqual({ userId: ownerUserId });
    expect(await authenticate(dbs.app, ownerUsername, "wrong-password")).toBeNull();
    expect(await authenticate(dbs.app, "no-such-user", "owner-password-1")).toBeNull();
  });

  it("upgrades an imported legacy sha1 password to argon2id on first login", async () => {
    const username = uniqueName("legacy");
    const salt = "legacy-salt";
    const [user] = await dbs.admin
      .insert(users)
      .values({ username, fullName: "Legacy User", legacyPasswordSha1: createHash("sha1").update(salt + "old-secret").digest("hex"), legacyPasswordSalt: salt })
      .returning({ id: users.id });

    expect(await authenticate(dbs.app, username, "wrong")).toBeNull();
    expect(await authenticate(dbs.app, username, "old-secret")).toEqual({ userId: user.id });

    const [after] = await dbs.admin.select().from(users).where(eq(users.id, user.id));
    expect(after.passwordHash).toMatch(/^\$argon2id\$/);
    expect(after.legacyPasswordSha1).toBeNull();
    expect(await authenticate(dbs.app, username, "old-secret")).toEqual({ userId: user.id });
  });

  it("rejects inactive users", async () => {
    const { ownerUsername, ownerUserId } = await newPharmacy();
    await dbs.admin.update(users).set({ isActive: false }).where(eq(users.id, ownerUserId));
    expect(await authenticate(dbs.app, ownerUsername, "owner-password-1")).toBeNull();
  });
});

describe("sessions", () => {
  it("stores only the token hash and resolves pharmacy + role", async () => {
    const { pharmacyId, ownerUserId } = await newPharmacy();
    const { token } = await createSession(dbs.app, ownerUserId, pharmacyId);
    expect(token).not.toBe(hashSessionToken(token));

    const ctx = await validateSessionToken(dbs.app, token);
    expect(ctx?.user.id).toBe(ownerUserId);
    expect(ctx?.pharmacy?.id).toBe(pharmacyId);
    expect(ctx?.role).toBe("owner");
    expect(await validateSessionToken(dbs.app, token + "x")).toBeNull();
  });

  it("expires sessions", async () => {
    const { ownerUserId } = await newPharmacy();
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const { token } = await createSession(dbs.app, ownerUserId, null, past);
    expect(await validateSessionToken(dbs.app, token)).toBeNull();
  });

  it("drops pharmacy access when the membership is deactivated", async () => {
    const { pharmacyId, ownerUserId } = await newPharmacy();
    const owner = { userId: ownerUserId, pharmacyId, role: "owner" as const };
    const cashierName = uniqueName("cashier");
    const { userId: cashierId } = await createPharmacyUser(dbs.app, owner, { username: cashierName, fullName: "Kasir", password: "cashier-pass-1", role: "cashier" });

    const { token } = await createSession(dbs.app, cashierId, pharmacyId);
    expect((await validateSessionToken(dbs.app, token))?.role).toBe("cashier");

    await setMembershipActive(dbs.app, owner, cashierId, false);
    const ctx = await validateSessionToken(dbs.app, token);
    expect(ctx?.pharmacy).toBeNull();
    expect(ctx?.role).toBeNull();
    expect(await listActiveMemberships(dbs.app, cashierId)).toEqual([]);
  });

  it("cannot select a pharmacy the user is not a member of", async () => {
    const a = await newPharmacy();
    const b = await newPharmacy();
    const { token } = await createSession(dbs.app, a.ownerUserId, null);
    const ctx = await validateSessionToken(dbs.app, token);
    expect(await selectSessionPharmacy(dbs.app, ctx!.sessionId, a.ownerUserId, b.pharmacyId)).toBe(false);
    expect(await selectSessionPharmacy(dbs.app, ctx!.sessionId, a.ownerUserId, a.pharmacyId)).toBe(true);
  });
});

describe("user management rules", () => {
  it("admin cannot create an owner; cashier cannot create anyone", async () => {
    const { pharmacyId, ownerUserId } = await newPharmacy();
    const admin = { userId: ownerUserId, pharmacyId, role: "admin" as const };
    const cashier = { userId: ownerUserId, pharmacyId, role: "cashier" as const };
    await expect(createPharmacyUser(dbs.app, admin, { username: uniqueName("x"), fullName: "X", password: "password-123", role: "owner" })).rejects.toBeInstanceOf(NotAllowedError);
    await expect(createPharmacyUser(dbs.app, cashier, { username: uniqueName("y"), fullName: "Y", password: "password-123", role: "cashier" })).rejects.toBeInstanceOf(NotAllowedError);
  });
});
