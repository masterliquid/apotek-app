import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, Loading } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { isDebtKind, listDebts, totalOutstanding } from "@/server/debts";
import { listPartners } from "@/server/master-data";
import { withPharmacy } from "@/server/tenant";
import { NewDebtForm, PayForm } from "../debt-forms";

export default function DebtsPage({ params }: PageProps<"/debts/[kind]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Debts params={params} />
    </Suspense>
  );
}

async function Debts({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isDebtKind(kind)) notFound();
  const session = await requirePharmacy();
  if (!can(session.role, "debts.view")) return <p className="text-sm text-red-700">You do not have access to debts.</p>;
  const pharmacyId = session.pharmacy.id;
  const canManage = can(session.role, "debts.manage");
  const payable = kind === "payables";

  const data = await withPharmacy(getDb(), pharmacyId, async (tx) => ({
    list: await listDebts(tx, pharmacyId, kind),
    total: await totalOutstanding(tx, pharmacyId, kind),
    parties: canManage ? (await listPartners(tx, pharmacyId, payable ? "suppliers" : "customers")).filter((p) => p.isActive) : [],
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{payable ? "Payables (owed to suppliers)" : "Receivables (owed by customers)"}</h1>
      <p className="text-sm text-slate-600">Total outstanding: <strong>{data.total}</strong></p>
      {canManage && (
        <Card title="New record">
          {data.parties.length === 0 ? <p className="text-sm text-slate-600">Add a {payable ? "supplier" : "customer"} first.</p> : <NewDebtForm kind={kind} partyLabel={payable ? "Supplier" : "Customer"} parties={data.parties} />}
        </Card>
      )}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500"><tr><th className="py-2 pr-4">{payable ? "Supplier" : "Customer"}</th><th className="py-2 pr-4 text-right">Amount</th><th className="py-2 pr-4 text-right">Paid</th><th className="py-2 pr-4 text-right">Outstanding</th><th className="py-2 pr-4">Note</th><th className="py-2" /></tr></thead>
            <tbody>
              {data.list.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="py-2 pr-4">{d.partyName}</td><td className="py-2 pr-4 text-right">{d.amount}</td><td className="py-2 pr-4 text-right">{d.paidAmount}</td>
                  <td className="py-2 pr-4 text-right font-medium">{d.outstanding}</td><td className="py-2 pr-4">{d.note}</td>
                  <td className="py-2 text-right">{canManage && d.outstanding !== "0.00" && <PayForm kind={kind} debtId={d.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.list.length === 0 && <p className="py-4 text-sm text-slate-500">No records yet.</p>}
        </div>
      </Card>
    </div>
  );
}
