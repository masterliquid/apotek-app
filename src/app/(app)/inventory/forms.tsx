"use client";

import { Button } from "@/components/ui";
import { ActionForm, Field, SelectField, SubmitButton, FormFeedback, useFormState } from "@/components/form";
import { addOpnameProductAction, createAdjustmentAction, saveOrCommitOpnameAction } from "./actions";

type Option = { id: number; label: string };

export function AdjustmentForm({ batches, reasons }: { batches: Option[]; reasons: Option[] }) {
  return (
    <ActionForm action={createAdjustmentAction} className="grid gap-4 sm:grid-cols-2">
      <SelectField label="Product batch" name="batchId">
        {batches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
      </SelectField>
      <SelectField label="Reason" name="reasonId">
        {reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </SelectField>
      <Field label="Change (negative removes stock)" name="qtyChange" type="number" required placeholder="-3" />
      <Field label="Note" name="note" />
      <div className="flex items-center gap-4 sm:col-span-2">
        <SubmitButton pendingLabel="Saving…">Adjust stock</SubmitButton>
        <FormFeedback />
      </div>
    </ActionForm>
  );
}

export function AddOpnameProductForm({ opnameId, products }: { opnameId: number; products: Option[] }) {
  return (
    <ActionForm action={addOpnameProductAction} className="flex flex-wrap items-end gap-4">
      <input type="hidden" name="opnameId" value={opnameId} />
      <div className="min-w-64"><SelectField label="Add a product to count" name="productId">{products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</SelectField></div>
      <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
      <FormFeedback />
    </ActionForm>
  );
}

export type CountLine = { id: number; label: string; systemQty: number; physicalQty: number; differenceValue: string };

function CountButtons({ canCommit, empty }: { canCommit: boolean; empty: boolean }) {
  const { pending } = useFormState();
  return (
    <>
      <Button type="submit" name="intent" value="save" variant="secondary" loading={pending} disabled={empty}>Save counts</Button>
      {canCommit && (
        <Button
          type="submit"
          name="intent"
          value="commit"
          disabled={pending || empty}
          onClick={(e) => {
            if (!confirm("Commit this stock opname? Stock will be changed to match the counts.")) e.preventDefault();
          }}
        >
          Commit
        </Button>
      )}
    </>
  );
}

export function CountForm({ opnameId, lines, canCommit, removeAction }: { opnameId: number; lines: CountLine[]; canCommit: boolean; removeAction: (formData: FormData) => Promise<void> }) {
  return (
    <div className="space-y-3">
      <ActionForm action={saveOrCommitOpnameAction} resetOnSuccess={false} className="space-y-3">
        <input type="hidden" name="opnameId" value={opnameId} />
        {lines.map((l) => (
          <div key={l.id} className="grid items-center gap-2 border-b border-slate-100 pb-2 text-sm sm:grid-cols-12">
            <div className="sm:col-span-6">{l.label}</div>
            <div className="sm:col-span-2 text-slate-500">System {l.systemQty}</div>
            <div className="sm:col-span-3"><Field label="Counted" name={`count_${l.id}`} type="number" min={0} defaultValue={l.physicalQty} /></div>
            <div className="sm:col-span-1 text-right text-xs text-slate-500">{l.differenceValue}</div>
          </div>
        ))}
        {lines.length === 0 && <p className="text-sm text-slate-500">Add a product above to start counting.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <CountButtons canCommit={canCommit} empty={lines.length === 0} />
          <FormFeedback />
        </div>
      </ActionForm>
      {lines.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600">Remove a line</summary>
          <ul className="mt-2 space-y-1">
            {lines.map((l) => (
              <li key={l.id}>
                <form action={removeAction} className="flex justify-between">
                  <input type="hidden" name="opnameId" value={opnameId} />
                  <input type="hidden" name="lineId" value={l.id} />
                  <span>{l.label}</span>
                  <button className="text-red-700 underline">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
