import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, Card, Loading, PageHeader, buttonClass } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { getSale } from "@/server/sales";
import { printSaleAction } from "../../settings/actions";
import { withPharmacy } from "@/server/tenant";

export default function SaleDetailPage({ params }: PageProps<"/sales/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <SaleDetail params={params} />
    </Suspense>
  );
}

async function SaleDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePharmacy();
  if (!can(session.role, "sales.sell")) return <p className="text-sm text-red-700">You do not have access to sales.</p>;
  const saleId = Number((await params).id);
  if (!Number.isSafeInteger(saleId)) notFound();
  const sale = await withPharmacy(getDb(), session.pharmacy.id, (tx) => getSale(tx, session.pharmacy.id, saleId));
  if (!sale) notFound();
  // Cashiers only see their own sales; the rest see all (same rule as the list).
  if (!can(session.role, "reports.sales_all") && sale.createdBy !== session.user.id) notFound();

  const statusTone = sale.status === "committed" ? "success" : sale.status === "pending" ? "warning" : "neutral";
  const btn = buttonClass({ variant: "secondary", size: "sm" });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={`Receipt ${sale.receiptNo ?? `#${sale.id}`}`}
        description={[sale.customerName, sale.committedAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })].filter(Boolean).join(" · ")}
        actions={<Badge tone={statusTone}>{sale.status === "committed" ? "Completed" : sale.status === "pending" ? "Held" : "Void"}</Badge>}
      />
      <div className="flex flex-wrap gap-2">
        <Link href="/pos" className={buttonClass({ size: "sm" })}>New sale</Link>
        {sale.status === "committed" && (
          <>
            <form action={printSaleAction}>
              <input type="hidden" name="saleId" value={sale.id} />
              <button className={btn}>Print on this device&apos;s printer</button>
            </form>
            <Link href={`/sales/${sale.id}/receipt`} className={btn}>Browser print</Link>
            {can(session.role, "sales.return") && <Link href={`/returns?receipt=${sale.receiptNo}`} className={btn}>Return items</Link>}
          </>
        )}
        <Link href="/sales" className={buttonClass({ variant: "ghost", size: "sm" })}>All sales</Link>
      </div>
      <Card>
        <table className="w-full text-left text-sm">
          <thead><tr><th className="py-2 pr-4">Item</th><th className="py-2 text-right">Total</th></tr></thead>
          <tbody>
            {sale.lines.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="py-2.5 pr-4">{l.productName}<div className="tabular text-xs text-slate-500">{l.qty} {l.unitName} × {l.unitPrice}{l.discountPct !== "0.00" && ` − ${l.discountPct}%`}</div></td>
                <td className="tabular py-2.5 text-right">{l.lineTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="tabular mt-3 space-y-1.5 border-t border-slate-200 pt-3 text-sm">
          <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd>{sale.grandTotal}</dd></div>
          {sale.payments.map((p, i) => <div key={i} className="flex justify-between text-slate-600"><dt>{p.method}{p.referenceNo && ` (${p.referenceNo})`}</dt><dd>{p.amount}</dd></div>)}
          <div className="flex justify-between text-slate-600"><dt>Change</dt><dd>{sale.changeAmount}</dd></div>
        </dl>
      </Card>
    </div>
  );
}
