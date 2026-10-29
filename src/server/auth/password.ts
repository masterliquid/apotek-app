import { hash, verify } from "@node-rs/argon2";
import { createHash, timingSafeEqual } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 8;

// @node-rs/argon2 defaults to Argon2id (the recommended variant).
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

// Legacy t2_karyawan: KARYAWAN_PASSWORD__ = sha1(KARYAWAN_PASSWORD_SALT__ . password), lowercase hex (PHP sha1()).
// Only used once per imported user, after which the password is re-hashed with Argon2id.
export function verifyLegacySha1(password: string, salt: string, expectedHex: string): boolean {
  const actual = Buffer.from(createHash("sha1").update(salt + password).digest("hex"), "utf8");
  const expected = Buffer.from(expectedHex.toLowerCase(), "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
