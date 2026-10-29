import Link from "next/link";
import { Suspense } from "react";
import { Card, Loading } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { salesReport } from "@/server/reports";
import { withPharmacy } from "@/server/tenant";
import { DateRangeForm } from "../date-range-form";
import { rangeFromParams } from "../range";

export default function SalesReportPage({ searchParams }: PageProps<"/reports/sales">) {
  return (
    <Suspense fallback={<Loading />}>
      <SalesReport searchParams={searchParams} />
    </Suspense>
  );
}

async function SalesReport({ searchParams }: { searchParams: Promise<{ from?: string | string[]; to?: string | string[] }> }) {
  const session = await requirePharmacy();
  const all = can(session.role, "reports.sales_all");
  if (!all && !can(session.role, "reports.sales_own")) return <p className="text-sm text-red-700">You do not have access to this report.</p>;
  const { from, to, range, error } = rangeFromParams(await searchParams);
  const report = range ? await withPharmacy(getDb(), session.pharmacy.id, (tx) => salesReport(tx, session.pharmacy.id, range, all ? undefined : session.user.id)) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sales report <span className="text-sm font-normal text-slate-500">{from} – {to}{!all && " · your sales only"}</span></h1>
      <DateRangeForm from={from} to={to} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      {report && (
        <>
          <Card>
            <dl className="grid gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-slate-500">Sales</dt><dd className="text-lg font-semibold">{report.count}</dd></div>
              <div><dt className="text-slate-500">Gross</dt><dd className="text-lg font-semibold">{report.gross}</dd></div>
              <div><dt className="text-slate-500">Returns</dt><dd className="text-lg font-semibold">{report.refunds}</dd></div>
              <div><dt className="text-slate-500">Net</dt><dd className="text-lg font-semibold">{report.net}</dd></div>
            </dl>
            {report.byMethod.length > 0 && <p className="mt-3 text-sm text-slate-600">Received: {report.byMethod.map((m) => `${m.method} ${m.amount}`).join(" · ")}</p>}
          </Card>
          <Card>
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500"><tr><th className="py-2 pr-4">Time</th><th className="py-2 pr-4">Receipt</th><th className="py-2 pr-4">Customer</th><th className="py-2 text-right">Total</th></tr></thead>
              <tbody>
                {report.sales.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="py-2 pr-4">{s.committedAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
                    <td className="py-2 pr-4 font-mono"><Link href={`/sales/${s.id}`} className="text-emerald-700 underline">{s.receiptNo}</Link></td>
                    <td className="py-2 pr-4">{s.customerName}</td><td className="py-2 text-right">{s.grandTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.sales.length === 0 && <p className="py-4 text-sm text-slate-500">No completed sales in this period.</p>}
          </Card>
        </>
      )}
    </div>
  );
}
