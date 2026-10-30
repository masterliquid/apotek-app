import { Suspense } from "react";
import { Card, Loading, Badge } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { readDefaultPrinterCode } from "@/lib/printing";
import { can } from "@/server/auth/permissions";
import { listOsPrinters } from "@/server/printing/os-printers";
import { listPrinters, listPrintJobs } from "@/server/printers";
import { withPharmacy } from "@/server/tenant";
import { refreshOsPrintersAction, retryJobAction, setDefaultPrinterAction, testPrintAction, togglePrinterAction } from "../actions";
import { PrinterForm } from "../settings-forms";

export default function PrintersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Printers />
    </Suspense>
  );
}

async function Printers() {
  const session = await requirePharmacy();
  if (!can(session.role, "sales.sell")) return <p className="text-sm text-red-700">You do not have access to printers.</p>;
  const manage = can(session.role, "settings.manage");
  const pharmacyId = session.pharmacy.id;
  const data = await withPharmacy(getDb(), pharmacyId, async (tx) => ({ printers: await listPrinters(tx, pharmacyId), jobs: await listPrintJobs(tx, pharmacyId) }));
  const defaultCode = await readDefaultPrinterCode();
  const os = await listOsPrinters();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Printers</h1>
      <p className="text-sm text-slate-600">The printer marked “this device” is used for receipts printed from this browser. Receipts are queued and printed by the print worker; a sale is never held up by a printer problem.</p>
      <Card
        title="Printers on this computer"
        description="Installed printers visible to this app (macOS/Linux via CUPS). This is the computer running the app, not the browser if you opened the site from another machine."
        actions={
          <form action={refreshOsPrintersAction}>
            <button className="text-sm text-emerald-700 underline">Scan again</button>
          </form>
        }
      >
        {os.names.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
            {os.names.map((name) => (
              <li key={name} className="font-mono">{name}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">{os.note ?? "No printers detected."}</p>
        )}
        {os.names.length > 0 && os.note && <p className="mt-2 text-sm text-slate-500">{os.note}</p>}
      </Card>
      {manage && <Card title="Add printer"><PrinterForm osPrinters={os.names} /></Card>}
      <Card title="Printers">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500"><tr><th className="py-2 pr-4">Code</th><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Type</th><th className="py-2 pr-4">Connection</th><th className="py-2" /></tr></thead>
          <tbody>
            {data.printers.map((p) => (
              <tr key={p.id} className={`border-t border-slate-100 ${p.isActive ? "" : "text-slate-400"}`}>
                <td className="py-2 pr-4 font-mono">{p.code}{defaultCode === p.code && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 font-sans text-xs text-emerald-800">this device</span>}</td>
                <td className="py-2 pr-4">{p.name}</td>
                <td className="py-2 pr-4">{p.type === "thermal_escpos" ? "Thermal" : "Normal"} · {p.paperWidthMm === 210 ? "A4" : `${p.paperWidthMm} mm`}</td>
                <td className="py-2 pr-4">{p.connection === "network" ? `${p.host}:${p.port}` : p.osPrinterName}</td>
                <td className="space-x-3 py-2 text-right">
                  {p.isActive && <form action={setDefaultPrinterAction} className="inline"><input type="hidden" name="code" value={p.code} /><button className="text-emerald-700 underline">Use on this device</button></form>}
                  {manage && p.isActive && <form action={testPrintAction} className="inline"><input type="hidden" name="printerId" value={p.id} /><button className="text-emerald-700 underline">Test print</button></form>}
                  {manage && <form action={togglePrinterAction} className="inline"><input type="hidden" name="printerId" value={p.id} /><input type="hidden" name="activate" value={String(!p.isActive)} /><button className="text-slate-600 underline">{p.isActive ? "Disable" : "Enable"}</button></form>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.printers.length === 0 && <p className="py-4 text-sm text-slate-500">No printers yet. You can still print receipts from the browser (sale → Browser print).</p>}
      </Card>
      <Card title="Recent print jobs">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500"><tr><th className="py-2 pr-4">#</th><th className="py-2 pr-4">Printer</th><th className="py-2 pr-4">What</th><th className="py-2 pr-4">Status</th><th className="py-2">Problem</th></tr></thead>
          <tbody>
            {data.jobs.map((j) => (
              <tr key={j.id} className="border-t border-slate-100">
                <td className="py-2 pr-4">{j.id}</td><td className="py-2 pr-4 font-mono">{j.printerCode}</td><td className="py-2 pr-4">{j.documentType === "test" ? "Test page" : `Sale #${j.documentId}`}</td>
                <td className="py-2 pr-4"><Badge tone={j.status === "done" ? "success" : j.status === "failed" ? "error" : "warning"}>{j.status === "queued" && j.attempts > 0 ? `retrying (${j.attempts})` : j.status}</Badge></td>
                <td className="py-2 text-red-700">{j.lastError}{j.status === "failed" && <form action={retryJobAction} className="ml-3 inline"><input type="hidden" name="jobId" value={j.id} /><button className="text-emerald-700 underline">Retry</button></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.jobs.length === 0 && <p className="py-4 text-sm text-slate-500">Nothing printed yet.</p>}
      </Card>
    </div>
  );
}
