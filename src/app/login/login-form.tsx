"use client";

import { ActionForm, Field, SubmitButton, FormFeedback } from "@/components/form";
import { loginAction } from "./actions";

export function LoginForm() {
  return (
    <ActionForm action={loginAction} className="space-y-4">
      <Field label="Username" name="username" autoComplete="username" required autoFocus placeholder="Your username" />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required placeholder="Your password" />
      <FormFeedback />
      <SubmitButton pendingLabel="Signing in…" size="lg" className="w-full">Sign in</SubmitButton>
    </ActionForm>
  );
}
