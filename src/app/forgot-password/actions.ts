"use server";

import { requestPasswordReset, resetPasswordWithToken } from "@/server/auth/password";

export async function requestResetAction(email: string) {
  return await requestPasswordReset(email);
}

export async function resetPasswordAction(token: string, newPass: string) {
  return await resetPasswordWithToken(token, newPass);
}
