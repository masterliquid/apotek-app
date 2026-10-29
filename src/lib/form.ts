import type { ZodError } from "zod";

// What every form action returns. `fieldErrors` is keyed by the input's `name`, so each message appears under its own field.
export type FormState = { error?: string; success?: string; fieldErrors?: Record<string, string> };

export function zodErrors(error: ZodError, message = "Please check the fields marked in red."): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { error: message, fieldErrors };
}

export const fieldError = (field: string, message: string): FormState => ({ error: message, fieldErrors: { [field]: message } });
