import { Suspense } from "react";
import { Card, Loading } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { listAdjustments, listBatches } from "@/server/inventory";
import { listLookup } from "@/server/master-data";
import { withPharmacy } from "@/server/tenant";
import { AdjustmentForm } from "../forms";

export default function AdjustmentsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Adjustments />
    </Suspense>
  );
}

async function Adjustments() {
  const session = await requirePharmacy();
  if (!can(session.role, "inventory.adjust")) return <p className="text-sm text-red-700">You do not have access to stock adjustments.</p>;
  const pharmacyId = session.pharmacy.id;
  const data = await withPharmacy(getDb(), pharmacyId, async (tx) => ({
    batches: await listBatches(tx, pharmacyId),
    reasons: (await listLookup(tx, pharmacyId, "adjustment-reasons")).filter((r) => r.isActive),
    recent: await listAdjustments(tx, pharmacyId),
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Stock adjustments</h1>
      <Card title="New adjustment">
        {data.batches.length === 0 ? (
          <p className="text-sm text-slate-600">No stock batches yet. Receive goods first.</p>
        ) : (
          <AdjustmentForm
            batches={data.batches.map((b) => ({ id: b.id, label: `${b.productName} — batch ${b.batchNo}${b.expiryDate ? ` (exp ${b.expiryDate})` : ""} — ${b.qtyOnHand} in stock` }))}
            reasons={data.reasons.map((r) => ({ id: r.id, label: r.name }))}
          />
        )}
      </Card>
      <Card title="Recent adjustments">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500"><tr><th className="py-2 pr-4">Product</th><th className="py-2 pr-4">Batch</th><th className="py-2 pr-4">Reason</th><th className="py-2 pr-4 text-right">Change</th><th className="py-2">Note</th></tr></thead>
          <tbody>
            {data.recent.map((a) => (
              <tr key={a.id} className="border-t border-slate-100"><td className="py-2 pr-4">{a.productName}</td><td className="py-2 pr-4 font-mono">{a.batchNo}</td><td className="py-2 pr-4">{a.reason}</td><td className="py-2 pr-4 text-right">{a.qtyChange > 0 ? `+${a.qtyChange}` : a.qtyChange}</td><td className="py-2">{a.note}</td></tr>
            ))}
          </tbody>
        </table>
        {data.recent.length === 0 && <p className="py-4 text-sm text-slate-500">No adjustments yet.</p>}
      </Card>
    </div>
  );
}
