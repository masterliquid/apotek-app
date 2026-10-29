import { Suspense } from "react";
import { Card, Loading } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { profitReport } from "@/server/reports";
import { withPharmacy } from "@/server/tenant";
import { DateRangeForm } from "../date-range-form";
import { rangeFromParams } from "../range";

export default function ProfitReportPage({ searchParams }: PageProps<"/reports/profit">) {
  return (
    <Suspense fallback={<Loading />}>
      <ProfitReport searchParams={searchParams} />
    </Suspense>
  );
}

async function ProfitReport({ searchParams }: { searchParams: Promise<{ from?: string | string[]; to?: string | string[] }> }) {
  const session = await requirePharmacy();
  if (!can(session.role, "reports.profit")) return <p className="text-sm text-red-700">You do not have access to profit reports.</p>;
  const { from, to, range, error } = rangeFromParams(await searchParams);
  const report = range ? await withPharmacy(getDb(), session.pharmacy.id, (tx) => profitReport(tx, session.pharmacy.id, range)) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Profit report <span className="text-sm font-normal text-slate-500">{from} – {to}</span></h1>
      <DateRangeForm from={from} to={to} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      {report && (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500"><tr><th className="py-2 pr-4">Day</th><th className="py-2 pr-4 text-right">Sales</th><th className="py-2 pr-4 text-right">Revenue (after returns)</th><th className="py-2 pr-4 text-right">Cost</th><th className="py-2 text-right">Profit</th></tr></thead>
            <tbody>
              {report.rows.map((r) => <tr key={r.day} className="border-t border-slate-100"><td className="py-2 pr-4">{r.day}</td><td className="py-2 pr-4 text-right">{r.sales}</td><td className="py-2 pr-4 text-right">{r.revenue}</td><td className="py-2 pr-4 text-right">{r.cost}</td><td className="py-2 text-right font-medium">{r.profit}</td></tr>)}
            </tbody>
            <tfoot><tr className="border-t-2 border-slate-300 font-semibold"><td className="py-2 pr-4">Total</td><td /><td className="py-2 pr-4 text-right">{report.totals.revenue}</td><td className="py-2 pr-4 text-right">{report.totals.cost}</td><td className="py-2 text-right">{report.totals.profit}</td></tr></tfoot>
          </table>
          {report.rows.length === 0 && <p className="py-4 text-sm text-slate-500">No sales or returns in this period.</p>}
          <p className="mt-3 text-xs text-slate-500">Cost is the batch cost when the goods were sold. Returns reduce both revenue and cost on the day of the return.</p>
        </Card>
      )}
    </div>
  );
}
