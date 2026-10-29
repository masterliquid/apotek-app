"use client";

import { ActionForm, Field, SubmitButton, FormFeedback } from "@/components/form";
import { createPurchaseReturnAction, createSalesReturnAction } from "./actions";

export type ReturnLine = { id: number; title: string; detail: string; max: number };

export function ReturnForm({ kind, documentId, lines }: { kind: "sales" | "purchase"; documentId: number; lines: ReturnLine[] }) {
  return (
    <ActionForm action={kind === "sales" ? createSalesReturnAction : createPurchaseReturnAction} className="space-y-3">
      <input type="hidden" name="documentId" value={documentId} />
      {lines.map((l) => (
        <div key={l.id} className="grid items-center gap-2 border-b border-slate-100 pb-3 text-sm sm:grid-cols-12">
          <div className="sm:col-span-8">{l.title}<div className="text-xs text-slate-500">{l.detail}</div></div>
          <div className="sm:col-span-4">
            <Field label={`Return (max ${l.max})`} name={`qty_${l.id}`} type="number" min={0} max={l.max} defaultValue={0} disabled={l.max === 0} />
          </div>
        </div>
      ))}
      <Field label="Reason" name="reason" />
      <div className="flex items-center gap-4">
        <SubmitButton pendingLabel="Saving…">Save return</SubmitButton>
        <FormFeedback />
      </div>
    </ActionForm>
  );
}
