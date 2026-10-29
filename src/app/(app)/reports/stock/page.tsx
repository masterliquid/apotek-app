import { Suspense } from "react";
import { Card, Loading } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { stockReport } from "@/server/reports";
import { withPharmacy } from "@/server/tenant";
import { PrintButton } from "../print-button";

export default function StockReportPage() {
  return (
    <Suspense fallback={<Loading />}>
      <StockReport />
    </Suspense>
  );
}

async function StockReport() {
  const session = await requirePharmacy();
  if (!can(session.role, "products.view")) return <p className="text-sm text-red-700">You do not have access to this report.</p>;
  const showValues = can(session.role, "reports.profit");
  const report = await withPharmacy(getDb(), session.pharmacy.id, (tx) => stockReport(tx, session.pharmacy.id));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4"><h1 className="text-2xl font-semibold tracking-tight text-slate-900">Stock report</h1><PrintButton /></div>
      <Card>
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500"><tr><th className="py-2 pr-4">Code</th><th className="py-2 pr-4">Product</th><th className="py-2 pr-4 text-right">Stock</th>{showValues && <th className="py-2 pr-4 text-right">Value at cost</th>}{showValues && <th className="py-2 text-right">Value at price</th>}</tr></thead>
          <tbody>
            {report.rows.map((r) => <tr key={r.id} className="border-t border-slate-100"><td className="py-2 pr-4 font-mono">{r.code}</td><td className="py-2 pr-4">{r.name}</td><td className="py-2 pr-4 text-right">{r.stock} {r.unitName}</td>{showValues && <td className="py-2 pr-4 text-right">{r.costValue}</td>}{showValues && <td className="py-2 text-right">{r.sellValue}</td>}</tr>)}
          </tbody>
          {showValues && <tfoot><tr className="border-t-2 border-slate-300 font-semibold"><td className="py-2 pr-4" colSpan={3}>Total</td><td className="py-2 pr-4 text-right">{report.totalCost}</td><td className="py-2 text-right">{report.totalSell}</td></tr></tfoot>}
        </table>
        {report.rows.length === 0 && <p className="py-4 text-sm text-slate-500">No products yet.</p>}
      </Card>
    </div>
  );
}
