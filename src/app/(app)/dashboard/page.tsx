import Link from "next/link";
import { AlertTriangle, ArrowRight, ClipboardList, PackagePlus, ShoppingCart, Calendar } from "lucide-react";
import { Suspense } from "react";
import { Card, Loading, PageHeader, Stat } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { totalOutstanding } from "@/server/debts";
import { dailyRevenue, stockAlerts, todaySummary } from "@/server/dashboard";
import { getPharmacy } from "@/server/pharmacies";
import { withPharmacy } from "@/server/tenant";

interface PageProps {
  searchParams: Promise<{ days?: string }>;
}

export default async function DashboardPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const days = Math.min(Math.max(Number(searchParams?.days || 7), 3), 90);

  return (
    <Suspense fallback={<Loading />}>
      <Dashboard days={days} />
    </Suspense>
  );
}

const rupiah = (v: string) => {
  const [int, frac] = Number(v).toFixed(2).split(".");
  return `Rp ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${frac === "00" ? "" : `,${frac}`}`;
};

async function Dashboard({ days }: { days: number }) {
  const session = await requirePharmacy();
  const pharmacyId = session.pharmacy.id;
  const storeWide = can(session.role, "reports.sales_all");
  const canSell = can(session.role, "sales.sell");
  const seesDebts = can(session.role, "debts.view");
  const seesStock = can(session.role, "inventory.adjust");
  const warningDays = (await getPharmacy(getDb(), pharmacyId))?.expiryWarningDays ?? 90;

  // Tanggal hari ini format YYYY-MM-DD untuk query filter ke halaman sales
  const todayStr = new Date().toISOString().split("T")[0];

  const data = await withPharmacy(getDb(), pharmacyId, async (tx) => ({
    today: canSell ? await todaySummary(tx, pharmacyId, storeWide ? undefined : session.user.id) : null,
    history: storeWide ? await dailyRevenue(tx, pharmacyId, days) : null,
    payables: seesDebts ? await totalOutstanding(tx, pharmacyId, "payables") : null,
    receivables: seesDebts ? await totalOutstanding(tx, pharmacyId, "receivables") : null,
    alerts: seesStock ? await stockAlerts(tx, pharmacyId, warningDays) : null,
  }));
  const max = data.history ? Math.max(...data.history.map((d) => Number(d.net)), 1) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${session.user.fullName.split(" ")[0]}`}
        description={`${session.pharmacy.name} · ${storeWide ? "all sales today" : "your sales today"}`}
      />

      {/* TOP STATS CARDS (Dengan Filter Tanggal Hari Ini) */}
      {data.today && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Link
            href={`/sales?startDate=${todayStr}&endDate=${todayStr}`}
            className="group block rounded-xl transition duration-150 hover:-translate-y-0.5 hover:shadow-sm"
          >
            <Stat
              label="Net sales today"
              value={rupiah(data.today.net)}
              hint={`${data.today.count} sale${data.today.count === 1 ? "" : "s"} · returns ${rupiah(data.today.refunds)}`}
              tone="good"
            />
          </Link>

          <Link
            href={`/sales?startDate=${todayStr}&endDate=${todayStr}`}
            className="group block rounded-xl transition duration-150 hover:-translate-y-0.5 hover:shadow-sm"
          >
            <Stat label="Sales today" value={data.today.count} hint="View today's sales →" />
          </Link>

          <Link
            href={`/sales?status=held&startDate=${todayStr}&endDate=${todayStr}`}
            className="group block rounded-xl transition duration-150 hover:-translate-y-0.5 hover:shadow-sm"
          >
            <Stat
              label="Pending (held)"
              value={data.today.pending}
              hint="Resume from Sales history →"
              tone={data.today.pending > 0 ? "warn" : "neutral"}
            />
          </Link>

          {data.alerts ? (
            <Link
              href="/inventory?filter=out-of-stock"
              className="group block rounded-xl transition duration-150 hover:-translate-y-0.5 hover:shadow-sm"
            >
              <Stat
                label="Out of stock"
                value={data.alerts.outOfStock}
                tone={data.alerts.outOfStock > 0 ? "warn" : "neutral"}
                hint="View out of stock products →"
              />
            </Link>
          ) : (
            <Stat label="Role" value={<span className="capitalize">{session.role}</span>} />
          )}
        </div>
      )}

      {/* REVENUE CHART & DATE RANGE CONTROLS */}
      <div className="grid gap-4 lg:grid-cols-3">
        {data.history && (
          <Card
            title="Revenue Performance"
            description={`Net sales per day for the last ${days} days, after returns`}
            className="lg:col-span-2"
          >
            <div className="mb-4 flex items-center justify-end gap-1">
              <span className="mr-1 flex items-center gap-1 text-xs text-slate-500">
                <Calendar className="size-3.5 text-slate-400" /> Rentang:
              </span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
                {[
                  { label: "7 Hari", val: 7 },
                  { label: "14 Hari", val: 14 },
                  { label: "30 Hari", val: 30 },
                ].map((preset) => (
                  <Link
                    key={preset.val}
                    href={`?days=${preset.val}`}
                    className={`rounded px-2.5 py-1 transition ${
                      days === preset.val
                        ? "bg-white text-emerald-700 shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {preset.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Container grafik dengan proteksi overflow agar 30 hari tidak jebol */}
            <div className="w-full overflow-x-auto pb-2">
              <div
                className="flex h-44 items-end gap-1 pt-2"
                style={{ minWidth: days > 14 ? `${days * 22}px` : "100%" }}
                role="img"
                aria-label={`Net sales per day: ${data.history.map((d) => `${d.day} ${rupiah(d.net)}`).join(", ")}`}
              >
                {data.history.map((d, index) => {
                  // Jika memilih 30 hari, tampilkan label tanggal selang-seling agar tidak bertumpuk
                  const showLabel = days <= 14 || index % 3 === 0 || index === data.history!.length - 1;

                  return (
                    <div
                      key={d.day}
                      className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                    >
                      {/* Tooltip saat hover batang */}
                      <div className="pointer-events-none absolute -top-8 z-20 hidden whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] text-white shadow group-hover:block">
                        {d.day}: {rupiah(d.net)}
                      </div>
                      <Link
                        href={`/sales?startDate=${d.day}&endDate=${d.day}`}
                        className="w-full rounded-t-md bg-emerald-600/85 transition-all duration-200 hover:bg-emerald-500"
                        style={{
                          height: `${Math.max((Number(d.net) / max) * 100, d.net === "0.00" ? 2 : 6)}%`,
                        }}
                      />
                      <span className="text-[10px] text-slate-500">
                        {showLabel ? `${d.day.slice(8)}/${d.day.slice(5, 7)}` : "·"}
                      </span>
                    </div>
                  );
                })}
              </div>
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
                ]
                  .filter((a) => a.ok)
                  .map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800 hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      <Icon className="size-4 text-emerald-700" aria-hidden="true" />
                      {label}
                      <ArrowRight className="ml-auto size-4 text-slate-400" aria-hidden="true" />
                    </Link>
                  ))}
              </div>
            </Card>
          )}

          {data.alerts && (data.alerts.expired > 0 || data.alerts.expiringSoon > 0) && (
            <Link
              href="/reports/expiry"
              className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 transition hover:bg-amber-100/60"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
              <span>
                <strong>{data.alerts.expired}</strong> expired and <strong>{data.alerts.expiringSoon}</strong> expiring
                within {warningDays} days batches still in stock. <span className="underline font-medium">View report</span>
              </span>
            </Link>
          )}
        </div>
      </div>

      {/* DEBTS */}
      {data.payables !== null && data.receivables !== null && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/debts/payables"
            className="group block rounded-xl transition duration-150 hover:-translate-y-0.5 hover:shadow-sm"
          >
            <Stat label="Payables outstanding" value={rupiah(data.payables)} hint="Owed to suppliers →" />
          </Link>
          <Link
            href="/debts/receivables"
            className="group block rounded-xl transition duration-150 hover:-translate-y-0.5 hover:shadow-sm"
          >
            <Stat label="Receivables outstanding" value={rupiah(data.receivables)} hint="Owed by customers →" />
          </Link>
        </div>
      )}
    </div>
  );
}