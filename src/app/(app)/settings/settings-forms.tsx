"use client";

import { useState } from "react";
import { ActionForm, Field, SelectField, SubmitButton, FormFeedback } from "@/components/form";
import { createPrinterAction, savePharmacySettingsAction } from "./actions";

export function PrinterForm({ osPrinters }: { osPrinters: string[] }) {
  const [connection, setConnection] = useState("network");
  const [typePrinterName, setTypePrinterName] = useState(osPrinters.length === 0);
  return (
    <ActionForm action={createPrinterAction} className="grid gap-4 sm:grid-cols-3">
      <Field label="Code" name="code" required placeholder="e.g. KASIR1" hint="Short name for this printer, letters and numbers." />
      <Field label="Name" name="name" required placeholder="e.g. Printer kasir depan" />
      <SelectField label="Paper" name="paperWidthMm" defaultValue="58">
        <option value="58">58 mm (32 characters)</option>
        <option value="80">80 mm (48 characters)</option>
        <option value="210">A4 / normal printer</option>
      </SelectField>
      <SelectField label="Printer type" name="type">
        <option value="thermal_escpos">Thermal receipt printer (ESC/POS)</option>
        <option value="standard">Normal printer (plain text)</option>
      </SelectField>
      <SelectField label="Connection" name="connection" value={connection} onChange={(e) => setConnection(e.target.value)}>
        <option value="network">Network (IP address)</option>
        <option value="os_printer">Installed on the computer (printer name)</option>
      </SelectField>
      {connection === "network" ? (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2"><Field label="IP address / host" name="host" placeholder="192.168.1.50" /></div>
          <Field label="Port" name="port" type="number" defaultValue={9100} />
        </div>
      ) : typePrinterName || osPrinters.length === 0 ? (
        <div>
          <Field label="Printer name (as shown by the system)" name="osPrinterName" required placeholder="EPSON TM-T20" hint={osPrinters.length === 0 ? "Type the name exactly as the computer shows it." : undefined} />
          {osPrinters.length > 0 && (
            <button type="button" className="mt-1 text-xs text-emerald-700 underline" onClick={() => setTypePrinterName(false)}>
              Choose from detected printers
            </button>
          )}
        </div>
      ) : (
        <div>
          <SelectField label="Detected printer" name="osPrinterName" hint="Printers installed on the computer running this app.">
            {osPrinters.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </SelectField>
          <button type="button" className="mt-1 text-xs text-slate-600 underline" onClick={() => setTypePrinterName(true)}>
            Name not listed — type it
          </button>
        </div>
      )}
      <div className="flex items-center gap-4 sm:col-span-3">
        <SubmitButton pendingLabel="Saving…">Add printer</SubmitButton>
        <FormFeedback />
      </div>
    </ActionForm>
  );
}

export function PharmacySettingsForm({ values }: { values: { name: string; address: string; phone: string; receiptHeader: string; receiptFooter: string; buyPriceMarkupPct: string; expiryWarningDays: number } }) {
  return (
    <ActionForm action={savePharmacySettingsAction} className="grid gap-4 sm:grid-cols-2">
      <Field label="Pharmacy name" name="name" defaultValue={values.name} required />
      <Field label="Phone" name="phone" defaultValue={values.phone} />
      <div className="sm:col-span-2"><Field label="Address" name="address" defaultValue={values.address} /></div>
      <Field label="Receipt header (optional line under the address)" name="receiptHeader" defaultValue={values.receiptHeader} />
      <Field label="Receipt footer (empty = “Terima kasih”)" name="receiptFooter" defaultValue={values.receiptFooter} />
      <Field label="Buy price markup % (legacy rule: 10)" name="buyPriceMarkupPct" inputMode="decimal" defaultValue={values.buyPriceMarkupPct} required />
      <Field label="Expiry warning (days before expiry)" name="expiryWarningDays" type="number" defaultValue={values.expiryWarningDays} required />
      <div className="flex items-center gap-4 sm:col-span-2">
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        <FormFeedback />
      </div>
    </ActionForm>
  );
}
