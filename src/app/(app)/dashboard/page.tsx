import Link from "next/link";
import { AlertTriangle, ArrowRight, ClipboardList, PackagePlus, ShoppingCart } from "lucide-react";
import { Suspense } from "react";
import { Card, Loading, PageHeader, Stat } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { totalOutstanding } from "@/server/debts";
import { dailyRevenue, stockAlerts, todaySummary } from "@/server/dashboard";
import { getPharmacy } from "@/server/pharmacies";
import { withPharmacy } from "@/server/tenant";

export default function DashboardPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Dashboard />
    </Suspense>
  );
}

const rupiah = (v: string) => {
  const [int, frac] = Number(v).toFixed(2).split(".");
  return `Rp ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${frac === "00" ? "" : `,${frac}`}`;
};

async function Dashboard() {
  const session = await requirePharmacy();
  const pharmacyId = session.pharmacy.id;
  const storeWide = can(session.role, "reports.sales_all");
  const canSell = can(session.role, "sales.sell");
  const seesDebts = can(session.role, "debts.view");
  const seesStock = can(session.role, "inventory.adjust");
  const warningDays = (await getPharmacy(getDb(), pharmacyId))?.expiryWarningDays ?? 90;

  const data = await withPharmacy(getDb(), pharmacyId, async (tx) => ({
    today: canSell ? await todaySummary(tx, pharmacyId, storeWide ? undefined : session.user.id) : null,
    week: storeWide ? await dailyRevenue(tx, pharmacyId, 7) : null,
    payables: seesDebts ? await totalOutstanding(tx, pharmacyId, "payables") : null,
    receivables: seesDebts ? await totalOutstanding(tx, pharmacyId, "receivables") : null,
    alerts: seesStock ? await stockAlerts(tx, pharmacyId, warningDays) : null,
  }));
  const max = data.week ? Math.max(...data.week.map((d) => Number(d.net)), 1) : 1;

  return (
    <div className="space-y-6">
      <PageHeader title={`Hello, ${session.user.fullName.split(" ")[0]}`} description={`${session.pharmacy.name} · ${storeWide ? "all sales today" : "your sales today"}`} />

      {data.today && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Net sales today" value={rupiah(data.today.net)} hint={`${data.today.count} sale${data.today.count === 1 ? "" : "s"} · returns ${rupiah(data.today.refunds)}`} tone="good" />
          <Stat label="Sales today" value={data.today.count} />
          <Stat label="Pending (held)" value={data.today.pending} hint="Resume from Sales history" tone={data.today.pending > 0 ? "warn" : "neutral"} />
          {data.alerts ? <Stat label="Out of stock" value={data.alerts.outOfStock} tone={data.alerts.outOfStock > 0 ? "warn" : "neutral"} hint="Active products with no stock" /> : <Stat label="Role" value={<span className="capitalize">{session.role}</span>} />}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {data.week && (
          <Card title="Last 7 days" description="Net sales per day, after returns" className="lg:col-span-2">
            <div className="flex h-44 items-end gap-2" role="img" aria-label={`Net sales per day: ${data.week.map((d) => `${d.day} ${rupiah(d.net)}`).join(", ")}`}>
              {data.week.map((d) => (
                <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <div className="w-full rounded-t-md bg-emerald-600/85" style={{ height: `${Math.max((Number(d.net) / max) * 100, d.net === "0.00" ? 2 : 6)}%` }} title={`${d.day}: ${rupiah(d.net)}`} />
                  <span className="text-[11px] text-slate-500">{d.day.slice(8)}/{d.day.slice(5, 7)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="space-y-4">
          {canSell && (
            <Card title="Quick actions">
              <div className="grid gap-2">
                {[
                  { href: "/pos", label: "New sale", icon: ShoppingCart, ok: can(session.role, "sales.sell") },
                  { href: "/purchasing", label: "Receive goods", icon: PackagePlus, ok: can(session.role, "purchasing.manage") },
                  { href: "/inventory/opname", label: "Count stock", icon: ClipboardList, ok: can(session.role, "inventory.adjust") },
                ].filter((a) => a.ok).map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800 hover:border-emerald-300 hover:bg-emerald-50">
                    <Icon className="size-4 text-emerald-700" aria-hidden="true" />
                    {label}
                    <ArrowRight className="ml-auto size-4 text-slate-400" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {data.alerts && (data.alerts.expired > 0 || data.alerts.expiringSoon > 0) && (
            <Link href="/reports/expiry" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 hover:bg-amber-100/60">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>{data.alerts.expired}</strong> expired and <strong>{data.alerts.expiringSoon}</strong> expiring within {warningDays} days batches still in stock. <span className="underline">View report</span>
              </span>
            </Link>
          )}
        </div>
      </div>

      {data.payables !== null && data.receivables !== null && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/debts/payables"><Stat label="Payables outstanding" value={rupiah(data.payables)} hint="Owed to suppliers" /></Link>
          <Link href="/debts/receivables"><Stat label="Receivables outstanding" value={rupiah(data.receivables)} hint="Owed by customers" /></Link>
        </div>
      )}
    </div>
  );
}
