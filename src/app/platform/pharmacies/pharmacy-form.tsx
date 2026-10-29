"use client";

import { ActionForm, Field, SubmitButton, FormFeedback } from "@/components/form";
import { createPharmacyAction } from "./actions";

export function PharmacyForm() {
  return (
    <ActionForm action={createPharmacyAction} className="grid gap-4 sm:grid-cols-2">
      <Field label="Pharmacy code" name="code" required placeholder="e.g. APT01" hint="2–20 letters, numbers or dash. Must be unique." />
      <Field label="Pharmacy name" name="name" required placeholder="e.g. Apotek Sehat Sentosa" />
      <Field label="Address" name="address" placeholder="Street, city" />
      <Field label="Phone" name="phone" placeholder="e.g. 021-5550123" />
      <Field label="Owner username" name="ownerUsername" required autoComplete="off" placeholder="e.g. owner.sehat" hint="At least 3 characters: letters, numbers, dot, dash or underscore" />
      <Field label="Owner full name" name="ownerFullName" required placeholder="e.g. Siti Aminah" />
      <Field label="Owner password" name="ownerPassword" type="password" required autoComplete="new-password" placeholder="At least 8 characters" hint="Minimum 8 characters. Use a password that is hard to guess." />
      <div className="flex items-center gap-4 sm:col-span-2">
        <SubmitButton pendingLabel="Creating…">Create pharmacy</SubmitButton>
        <FormFeedback />
      </div>
    </ActionForm>
  );
}
