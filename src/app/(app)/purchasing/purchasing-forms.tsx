"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { ActionForm, Field, FormFeedback, SelectField, SubmitButton, useFormState } from "@/components/form";
import { addLineAction, closeOrderAction, createPurchaseOrderAction, receiveGoodsAction, removeLineAction, updateLineQtyAction } from "./actions";

type Option = { id: number; name: string };

export function NewPurchaseOrderForm({ suppliers }: { suppliers: Option[] }) {
  return (
    <ActionForm action={createPurchaseOrderAction} className="grid gap-4 sm:grid-cols-3">
      <SelectField label="Supplier" name="supplierId" defaultValue="" required>
        <option value="" disabled>Choose a supplier…</option>
        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </SelectField>
      <Field label="Note (optional)" name="note" placeholder="e.g. weekly restock" />
      <div className="flex items-end gap-3">
        <SubmitButton pendingLabel="Creating…">Create order</SubmitButton>
        <FormFeedback />
      </div>
    </ActionForm>
  );
}

export type OrderProduct = { id: number; label: string; units: { id: number; label: string }[] };

// Picking a product shows only the units that product really has (its base unit and pack units).
export function AddLineForm({ purchaseOrderId, products }: { purchaseOrderId: number; products: OrderProduct[] }) {
  const [productId, setProductId] = useState("");
  const units = products.find((p) => String(p.id) === productId)?.units ?? [];
  return (
    <ActionForm action={addLineAction} className="grid gap-4 sm:grid-cols-4">
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <SelectField label="Product" name="productId" value={productId} onChange={(e) => setProductId(e.target.value)} required>
        <option value="" disabled>Choose a product…</option>
        {products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </SelectField>
      <SelectField label="Unit" name="unitId" key={productId} defaultValue={units[0]?.id ?? ""} required disabled={units.length === 0}>
        {units.length === 0 && <option value="">Choose a product first</option>}
        {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
      </SelectField>
      <Field label="Quantity" name="qty" type="number" min={1} required placeholder="e.g. 1000" hint="In the unit chosen on the left." />
      <div className="flex items-start gap-3 pt-6">
        <SubmitButton pendingLabel="Adding…">Add item</SubmitButton>
      </div>
      <div className="sm:col-span-4"><FormFeedback /></div>
    </ActionForm>
  );
}

// Fix a wrong ordered quantity in place.
export function LineQtyForm({ purchaseOrderId, lineId, qty, received }: { purchaseOrderId: number; lineId: number; qty: number; received: number }) {
  return (
    <ActionForm action={updateLineQtyAction} resetOnSuccess={false} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <input type="hidden" name="lineId" value={lineId} />
      <Field label="" name="qty" aria-label="Ordered quantity" type="number" min={Math.max(received, 1)} defaultValue={qty} className="h-8 w-24 py-0 text-right" />
      <SubmitButton variant="secondary" size="sm">Save</SubmitButton>
      <FormFeedback />
    </ActionForm>
  );
}

export function RemoveLineForm({ purchaseOrderId, lineId }: { purchaseOrderId: number; lineId: number }) {
  return (
    <ActionForm action={removeLineAction} className="flex items-center gap-2">
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <input type="hidden" name="lineId" value={lineId} />
      <SubmitButton variant="ghost" size="sm" className="text-red-700 hover:bg-red-50" aria-label="Remove this item"><Trash2 className="size-3.5" aria-hidden="true" /></SubmitButton>
      <FormFeedback />
    </ActionForm>
  );
}

function ConfirmSubmit({ children, message, variant }: { children: string; message: string; variant: "secondary" | "danger" }) {
  const { pending } = useFormState();
  return (
    <Button type="submit" size="sm" variant={variant} loading={pending} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>
      {children}
    </Button>
  );
}

export function OrderActions({ purchaseOrderId, status }: { purchaseOrderId: number; status: "open" | "partial" }) {
  const close = status === "partial";
  return (
    <ActionForm action={closeOrderAction} resetOnSuccess={false} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <input type="hidden" name="action" value={close ? "close" : "cancel"} />
      <ConfirmSubmit variant={close ? "secondary" : "danger"} message={close ? "Close this order? The items that have not arrived will no longer be expected." : "Cancel this order? Nothing has been received yet."}>
        {close ? "Close order (rest won't arrive)" : "Cancel order"}
      </ConfirmSubmit>
      <FormFeedback />
    </ActionForm>
  );
}

export type ReceiveLine = { id: number; productCode: string; productName: string; unitName: string; ordered: number; received: number; remaining: number; suggestedPrice: string };

// One block per ordered item. By default the quantity is what is still missing; type what actually arrived
// (0 = did not arrive, it stays on the order). "Add another batch" splits one item over several batches.
export function ReceiveForm({ purchaseOrderId, lines }: { purchaseOrderId: number; lines: ReceiveLine[] }) {
  const [extraRows, setExtraRows] = useState<Record<number, number>>({});
  return (
    <ActionForm action={receiveGoodsAction} className="space-y-5">
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier invoice / delivery note no." name="supplierInvoiceNo" required placeholder="e.g. INV-2026-0042" hint="The number printed on the paper that came with the delivery." />
        <Field label="Note (optional)" name="note" placeholder="e.g. driver Budi, 2 boxes damaged" />
      </div>

      {lines.map((l) => {
        const rows = 1 + (extraRows[l.id] ?? 0);
        const done = l.remaining === 0;
        return (
          <fieldset key={l.id} className={done ? "rounded-xl border border-slate-200 bg-slate-50 p-4" : "rounded-xl border border-slate-200 p-4"}>
            <legend className="px-1 text-sm font-semibold text-slate-900">
              {l.productName} <span className="font-mono text-xs font-normal text-slate-500">{l.productCode}</span>
            </legend>
            <p className="mb-3 text-xs text-slate-600">
              Ordered <strong>{l.ordered}</strong> {l.unitName} · received so far <strong>{l.received}</strong> ·{" "}
              {done ? <span className="font-medium text-emerald-700">complete</span> : <>still to come <strong className="text-amber-700">{l.remaining}</strong></>}
            </p>
            {!done && (
              <div className="space-y-3">
                {Array.from({ length: rows }, (_, n) => (
                  <div key={n} className="grid gap-3 sm:grid-cols-5">
                    <Field label={n === 0 ? `Arrived now (${l.unitName})` : `Batch ${n + 1}: quantity`} name={`qty_${l.id}_${n}`} type="number" min={0} defaultValue={n === 0 ? l.remaining : undefined} placeholder="0" />
                    <Field label={`Invoice price / ${l.unitName}`} name={`price_${l.id}_${n}`} inputMode="decimal" defaultValue={l.suggestedPrice} placeholder="e.g. 15000" />
                    <Field label="Discount %" name={`discount_${l.id}_${n}`} inputMode="decimal" defaultValue="0" />
                    <Field label="Batch no." name={`batch_${l.id}_${n}`} placeholder="From the box" />
                    <Field label="Expiry date" name={`expiry_${l.id}_${n}`} type="date" />
                  </div>
                ))}
                <button type="button" onClick={() => setExtraRows((r) => ({ ...r, [l.id]: (r[l.id] ?? 0) + 1 }))} className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline">
                  <Plus className="size-3.5" aria-hidden="true" /> Add another batch of this item
                </button>
              </div>
            )}
          </fieldset>
        );
      })}

      <p className="text-xs text-slate-500">Set <strong>0</strong> (or leave empty) for an item that did not arrive; it stays on the order and can be received later. Each delivery is saved as its own receipt.</p>
      <div className="space-y-3">
        <FormFeedback />
        <SubmitButton size="lg" pendingLabel="Saving…">Save delivery</SubmitButton>
      </div>
    </ActionForm>
  );
}
