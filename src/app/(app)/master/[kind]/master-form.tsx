"use client";

import { ActionForm, Field, SubmitButton, FormFeedback } from "@/components/form";
import { createMasterAction } from "../actions";

export function MasterForm({ kind, withContact }: { kind: string; withContact: boolean }) {
  return (
    <ActionForm action={createMasterAction} className="grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="kind" value={kind} />
      <Field label="Name" name="name" required placeholder="e.g. Obat Bebas" />
      {withContact && <Field label="Phone" name="phone" placeholder="e.g. 081234567890" />}
      {withContact && <Field label="Address" name="address" placeholder="Street, city" />}
      <div className="flex items-center gap-4 sm:col-span-3">
        <SubmitButton pendingLabel="Saving…">Add</SubmitButton>
        <FormFeedback />
      </div>
    </ActionForm>
  );
}
