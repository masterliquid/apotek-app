"use client";

import { ActionForm, Field, SelectField, SubmitButton, FormFeedback } from "@/components/form";
import { addPackUnitAction, createProductAction, updatePricesAction } from "./actions";

type Option = { id: number; name: string };

export function NewProductForm({ categories, statuses, units }: { categories: Option[]; statuses: Option[]; units: Option[] }) {
  return (
    <ActionForm action={createProductAction} className="grid gap-4 sm:grid-cols-3">
      <Field label="Code / barcode" name="code" required placeholder="Scan or type the barcode" hint="Must be unique in this pharmacy." />
      <Field label="Name" name="name" required placeholder="e.g. Paracetamol 500 mg" />
      <SelectField label="Base unit (smallest sold unit)" name="baseUnitId" defaultValue="" required>
        <option value="" disabled>Choose…</option>
        {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </SelectField>
      <SelectField label="Category" name="categoryId">
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </SelectField>
      <SelectField label="Status" name="statusId">
        {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </SelectField>
      <Field label="Base cost per base unit" name="baseCost" inputMode="decimal" required placeholder="e.g. 1000" hint="What you pay for one base unit. Numbers only." />
      <Field label="Margin %" name="marginPct" inputMode="decimal" required defaultValue="20" hint="0–100. Used for the recommended price." />
      <Field label="Selling price per base unit" name="sellPrice" inputMode="decimal" required placeholder="e.g. 1500" hint="What the customer pays for one base unit." />
      <div className="flex items-center gap-4 sm:col-span-3">
        <SubmitButton pendingLabel="Saving…">Add product</SubmitButton>
        <FormFeedback />
      </div>
    </ActionForm>
  );
}

export function PriceForm({ productId, baseCost, marginPct, sellPrice }: { productId: number; baseCost: string; marginPct: string; sellPrice: string }) {
  return (
    <ActionForm action={updatePricesAction} className="grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="productId" value={productId} />
      <Field label="Base cost" name="baseCost" inputMode="decimal" defaultValue={baseCost} required />
      <Field label="Margin %" name="marginPct" inputMode="decimal" defaultValue={marginPct} required />
      <Field label="Selling price" name="sellPrice" inputMode="decimal" defaultValue={sellPrice} required />
      <div className="flex items-center gap-4 sm:col-span-3">
        <SubmitButton pendingLabel="Saving…">Update prices</SubmitButton>
        <FormFeedback />
      </div>
    </ActionForm>
  );
}

export function PackUnitForm({ productId, units }: { productId: number; units: Option[] }) {
  return (
    <ActionForm action={addPackUnitAction} className="grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="productId" value={productId} />
      <SelectField label="Pack unit" name="unitId">
        {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </SelectField>
      <Field label="Contains (base units)" name="factor" type="number" min={2} required placeholder="10" />
      <Field label="Own selling price (optional)" name="sellPrice" inputMode="decimal" placeholder="empty = factor × price" />
      <div className="flex items-center gap-4 sm:col-span-3">
        <SubmitButton pendingLabel="Saving…">Add pack unit</SubmitButton>
        <FormFeedback />
      </div>
    </ActionForm>
  );
}
