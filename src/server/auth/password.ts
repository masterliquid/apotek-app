import { hash, verify } from "@node-rs/argon2";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { passwordResetTokens, users } from "@/db/schema";
import { sendEmail } from "@/lib/email";

export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

export function verifyLegacySha1(password: string, salt: string, expectedHex: string): boolean {
  const actual = Buffer.from(createHash("sha1").update(salt + password).digest("hex"), "utf8");
  const expected = Buffer.from(expectedHex.toLowerCase(), "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function requestPasswordReset(email: string) {
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();

  const user = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail),
  });

  if (!user) {
    return {
      success: true,
      message: "Jika email terdaftar, tautan pemulihan telah dikirim.",
    };
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

  await db.insert(passwordResetTokens).values({
    userId: String(user.id),
    token,
    expiresAt,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100";
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  const emailHtml = `
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #0f172a;">Reset Kata Sandi</h2>
      <p style="color: #475569; font-size: 14px;">Klik tautan di bawah ini untuk mereset kata sandi:</p>
      <p style="margin: 20px 0;">
        <a href="${resetUrl}" style="background-color: #059669; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Reset Password Sekarang</a>
      </p>
      <p style="color: #94a3b8; font-size: 12px;">Tautan ini kedaluwarsa dalam 30 menit.</p>
    </div>
  `;

  await sendEmail({
    to: normalizedEmail,
    subject: "Reset Password - Apotek",
    html: emailHtml,
  });

  return {
    success: true,
    message: "Jika email terdaftar, tautan pemulihan telah dikirim.",
  };
}

export async function resetPasswordWithToken(token: string, newPass: string) {
  if (newPass.length < MIN_PASSWORD_LENGTH) {
    return {
      success: false,
      error: `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`,
    };
  }

  const db = getDb();

  const validToken = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.token, token),
      gt(passwordResetTokens.expiresAt, new Date())
    ),
  });

  if (!validToken) {
    return { success: false, error: "Tautan tidak valid atau sudah kedaluwarsa." };
  }

  const newHash = await hashPassword(newPass);

  await db
    .update(users)
    .set({ passwordHash: newHash })
    .where(eq(users.id, Number(validToken.userId)));

  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.id, validToken.id));

  return { success: true };
}
