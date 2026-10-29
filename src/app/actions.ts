"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { clearSessionCookie, readSessionToken } from "@/lib/auth";
import { deleteSessionByToken } from "@/server/auth/sessions";

export async function logoutAction() {
  const token = await readSessionToken();
  if (token) await deleteSessionByToken(getDb(), token);
  await clearSessionCookie();
  redirect("/login");
}
