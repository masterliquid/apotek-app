"use client";

import { ActionForm, Field, SelectField, SubmitButton, FormFeedback } from "@/components/form";
import type { Role } from "@/server/auth/permissions";
import { createUserAction } from "./actions";

export function UserForm({ assignableRoles }: { assignableRoles: Role[] }) {
  return (
    <ActionForm action={createUserAction} className="grid gap-4 sm:grid-cols-2">
      <Field label="Username" name="username" required autoComplete="off" placeholder="e.g. budi.kasir" hint="At least 3 characters: letters, numbers, dot, dash or underscore" />
      <Field label="Full name" name="fullName" required placeholder="e.g. Budi Santoso" />
      <Field label="Password" name="password" type="password" required autoComplete="new-password" placeholder="At least 8 characters" hint="Minimum 8 characters. Use a password that is hard to guess." />
      <SelectField label="Role" name="role" defaultValue="cashier">
        {assignableRoles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </SelectField>
      <div className="flex items-center gap-4 sm:col-span-2">
        <SubmitButton pendingLabel="Saving…">Add user</SubmitButton>
        <FormFeedback />
      </div>
    </ActionForm>
  );
}
