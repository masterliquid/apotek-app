import { Suspense } from "react";
import { Card, Loading } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { findCommittedSaleByReceipt, getReturnableSaleLines, listSalesReturns } from "@/server/returns";
import { withPharmacy } from "@/server/tenant";
import { ReturnForm } from "./return-form";

export default function ReturnsPage({ searchParams }: PageProps<"/returns">) {
  return (
    <Suspense fallback={<Loading />}>
      <Returns searchParams={searchParams} />
    </Suspense>
  );
}

async function Returns({ searchParams }: { searchParams: Promise<{ receipt?: string | string[]; done?: string | string[] }> }) {
  const session = await requirePharmacy();
  if (!can(session.role, "sales.return")) return <p className="text-sm text-red-700">You do not have access to sales returns.</p>;
  const { receipt, done } = await searchParams;
  const receiptNo = typeof receipt === "string" ? receipt.trim() : "";
  const pharmacyId = session.pharmacy.id;

  const data = await withPharmacy(getDb(), pharmacyId, async (tx) => {
    const sale = receiptNo ? await findCommittedSaleByReceipt(tx, pharmacyId, receiptNo) : null;
    return { sale, lines: sale ? await getReturnableSaleLines(tx, pharmacyId, sale.id) : [], recent: await listSalesReturns(tx, pharmacyId) };
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sales returns</h1>
      {typeof done === "string" && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800" role="status">Return {done} saved. Stock has been put back.</p>}
      <Card title="Find the receipt">
        <form className="flex gap-2">
          <input name="receipt" defaultValue={receiptNo} placeholder="Receipt number" className="w-full rounded-md border border-slate-300 px-3 py-2 sm:max-w-xs" />
          <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Search</button>
        </form>
        {receiptNo && !data.sale && <p className="mt-3 text-sm text-red-700">No completed sale with that receipt number.</p>}
      </Card>
      {data.sale && (
        <Card title={`Receipt ${data.sale.receiptNo} · total ${data.sale.grandTotal}`}>
          <ReturnForm
            kind="sales"
            documentId={data.sale.id}
            lines={data.lines.map((l) => ({
              id: l.id,
              title: l.productName,
              detail: `Sold ${l.qty} ${l.unitName} × ${l.unitPrice}${l.discountPct !== "0.00" ? ` − ${l.discountPct}%` : ""} · already returned ${l.returnedQty}`,
              max: l.returnableQty,
            }))}
          />
        </Card>
      )}
      <Card title="Recent returns">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500"><tr><th className="py-2 pr-4">Return</th><th className="py-2 pr-4">Receipt</th><th className="py-2 pr-4 text-right">Refund</th><th className="py-2">Reason</th></tr></thead>
          <tbody>
            {data.recent.map((r) => (
              <tr key={r.id} className="border-t border-slate-100"><td className="py-2 pr-4 font-mono">{r.returnNo}</td><td className="py-2 pr-4 font-mono">{r.receiptNo}</td><td className="py-2 pr-4 text-right">{r.totalRefund}</td><td className="py-2">{r.reason}</td></tr>
            ))}
          </tbody>
        </table>
        {data.recent.length === 0 && <p className="py-4 text-sm text-slate-500">No returns yet.</p>}
      </Card>
    </div>
  );
}
