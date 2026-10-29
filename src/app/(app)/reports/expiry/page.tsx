import { Suspense } from "react";
import { Card, Loading, Badge } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { getPharmacy } from "@/server/pharmacies";
import { expiryReport } from "@/server/reports";
import { withPharmacy } from "@/server/tenant";
import { PrintButton } from "../print-button";

export default function ExpiryReportPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ExpiryReport />
    </Suspense>
  );
}

async function ExpiryReport() {
  const session = await requirePharmacy();
  if (!can(session.role, "inventory.adjust")) return <p className="text-sm text-red-700">You do not have access to this report.</p>;
  const days = (await getPharmacy(getDb(), session.pharmacy.id))?.expiryWarningDays ?? 90;
  const rows = await withPharmacy(getDb(), session.pharmacy.id, (tx) => expiryReport(tx, session.pharmacy.id, days));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4"><h1 className="text-2xl font-semibold tracking-tight text-slate-900">Expiry report</h1><PrintButton /></div>
      <p className="text-sm text-slate-600">Batches with stock that are expired or expire within {days} days. Expired batches are never sold at the POS; remove them with a stock adjustment or return them to the supplier.</p>
      <Card>
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500"><tr><th className="py-2 pr-4">Product</th><th className="py-2 pr-4">Batch</th><th className="py-2 pr-4">Expiry</th><th className="py-2 pr-4 text-right">In stock</th><th className="py-2" /></tr></thead>
          <tbody>
            {rows.map((r) => <tr key={r.batchId} className={`border-t border-slate-100 ${r.expired ? "text-red-700" : ""}`}><td className="py-2 pr-4">{r.productName}</td><td className="py-2 pr-4 font-mono">{r.batchNo}</td><td className="py-2 pr-4">{r.expiryDate}</td><td className="py-2 pr-4 text-right">{r.qtyOnHand}</td><td className="py-2"><Badge tone={r.expired ? "error" : "warning"}>{r.expired ? "Expired" : "Expiring soon"}</Badge></td></tr>)}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-4 text-sm text-slate-500">Nothing is expired or about to expire.</p>}
      </Card>
    </div>
  );
}
