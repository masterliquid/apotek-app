import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { layoutReceipt, loadReceiptModel } from "@/server/printing/receipt";
import { withPharmacy } from "@/server/tenant";
import { PrintButton } from "../../../reports/print-button";

// Receipt for the browser's own print dialog: works with any printer and any device, no worker needed.
export default function ReceiptPage({ params, searchParams }: PageProps<"/sales/[id]/receipt">) {
  return (
    <Suspense fallback={<Loading />}>
      <Receipt params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Receipt({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ w?: string | string[] }> }) {
  const session = await requirePharmacy();
  if (!can(session.role, "sales.sell")) return <p className="text-sm text-red-700">You do not have access to receipts.</p>;
  const saleId = Number((await params).id);
  if (!Number.isSafeInteger(saleId)) notFound();
  const { w } = await searchParams;
  const columns = w === "58" ? 32 : 48;
  const model = await withPharmacy(getDb(), session.pharmacy.id, (tx) => loadReceiptModel(tx, session.pharmacy.id, saleId));
  if (!model) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-sm print:hidden">
        <PrintButton />
        <a href="?w=58" className="text-emerald-700 underline">58 mm</a>
        <a href="?w=80" className="text-emerald-700 underline">80 mm</a>
      </div>
      <style>{`@media print { @page { margin: 2mm; } body { background: white; } header, nav { display: none !important; } }`}</style>
      <pre className="mx-auto w-fit bg-white p-3 font-mono text-[13px] leading-tight shadow-sm print:p-0 print:shadow-none" style={{ width: `${columns + 2}ch` }}>
        {layoutReceipt(model, columns).map((r, i) => (
          <div key={i} className={`${r.bold ? "font-bold" : ""} ${r.align === "center" ? "text-center" : ""} whitespace-pre`}>{r.text || " "}</div>
        ))}
      </pre>
    </div>
  );
}
