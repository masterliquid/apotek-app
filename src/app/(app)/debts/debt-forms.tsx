"use client";

import { ActionForm, Field, SelectField, SubmitButton, FormFeedback } from "@/components/form";
import { createDebtAction, payDebtAction } from "./actions";

export function NewDebtForm({ kind, partyLabel, parties }: { kind: string; partyLabel: string; parties: { id: number; name: string }[] }) {
  return (
    <ActionForm action={createDebtAction} className="grid gap-4 sm:grid-cols-4">
      <input type="hidden" name="kind" value={kind} />
      <SelectField label={partyLabel} name="partyId">{parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectField>
      <Field label="Amount" name="amount" inputMode="decimal" required placeholder="e.g. 500000" hint="Numbers only, no dots or commas." />
      <Field label="Note" name="note" placeholder="e.g. invoice 123" />
      <div className="flex items-end gap-3"><SubmitButton pendingLabel="Saving…">Add</SubmitButton></div>
      <div className="sm:col-span-4"><FormFeedback /></div>
    </ActionForm>
  );
}

export function PayForm({ kind, debtId }: { kind: string; debtId: number }) {
  return (
    <ActionForm action={payDebtAction} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="debtId" value={debtId} />
      <input name="amount" inputMode="decimal" placeholder="Amount e.g. 50000" aria-label="Payment amount" required className="h-8 w-36 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
      <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">Pay</SubmitButton>
      <FormFeedback />
    </ActionForm>
  );
}
