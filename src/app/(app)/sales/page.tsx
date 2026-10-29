import Link from "next/link";
import { Suspense } from "react";
import { Card, Loading, Badge } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { listSales } from "@/server/sales";
import { withPharmacy } from "@/server/tenant";
import { voidSaleAction } from "../pos/actions";

export default function SalesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Sales />
    </Suspense>
  );
}

async function Sales() {
  const session = await requirePharmacy();
  if (!can(session.role, "sales.sell")) return <p className="text-sm text-red-700">You do not have access to sales.</p>;
  const pharmacyId = session.pharmacy.id;
  const seeAll = can(session.role, "reports.sales_all");
  const list = await withPharmacy(getDb(), pharmacyId, (tx) => listSales(tx, pharmacyId, seeAll ? undefined : session.user.id));
  const canVoid = (createdByMe: boolean) => can(session.role, "sales.void_any") || (createdByMe && can(session.role, "sales.void_own"));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sales</h1>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr><th className="py-2 pr-4">Receipt</th><th className="py-2 pr-4">Customer</th><th className="py-2 pr-4 text-right">Total</th><th className="py-2 pr-4">Status</th><th className="py-2" /></tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className={`border-t border-slate-100 ${s.status === "void" ? "text-slate-400 line-through" : ""}`}>
                  <td className="py-2 pr-4 font-mono">{s.receiptNo ?? `#${s.id}`}</td>
                  <td className="py-2 pr-4">{s.customerName}</td>
                  <td className="py-2 pr-4 text-right">{s.grandTotal}</td>
                  <td className="py-2 pr-4"><Badge tone={s.status === "committed" ? "success" : s.status === "pending" ? "warning" : "neutral"}>{s.status === "committed" ? "Completed" : s.status === "pending" ? "Held" : "Void"}</Badge></td>
                  <td className="space-x-3 py-2 text-right">
                    {s.status === "pending" ? (
                      <>
                        <Link href={`/pos?sale=${s.id}`} className="text-emerald-700 underline">Resume</Link>
                        {canVoid(true) && (
                          <form action={voidSaleAction} className="inline">
                            <input type="hidden" name="saleId" value={s.id} />
                            <button className="text-red-700 underline">Void</button>
                          </form>
                        )}
                      </>
                    ) : (
                      <Link href={`/sales/${s.id}`} className="text-emerald-700 underline">View</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="py-4 text-sm text-slate-500">No sales yet.</p>}
        </div>
      </Card>
    </div>
  );
}
