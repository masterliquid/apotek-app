import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { Suspense } from "react";
import { Card, EmptyState, Loading, PageHeader, ProgressBar, cx } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { listPartners } from "@/server/master-data";
import { listPurchaseOrders } from "@/server/purchasing";
import { withPharmacy } from "@/server/tenant";
import { NewPurchaseOrderForm } from "./purchasing-forms";
import { isWaiting, OrderStatusBadge } from "./status";

export default function PurchasingPage({ searchParams }: PageProps<"/purchasing">) {
  return (
    <Suspense fallback={<Loading />}>
      <Purchasing searchParams={searchParams} />
    </Suspense>
  );
}

const TABS = [
  { key: "waiting", label: "To receive" },
  { key: "done", label: "Completed" },
  { key: "all", label: "All" },
] as const;

async function Purchasing({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const session = await requirePharmacy();
  if (!can(session.role, "purchasing.manage")) return <p className="text-sm text-red-700">You do not have access to purchasing.</p>;
  const { view } = await searchParams;
  const current = TABS.find((t) => t.key === view)?.key ?? "waiting";
  const pharmacyId = session.pharmacy.id;
  const data = await withPharmacy(getDb(), pharmacyId, async (tx) => ({
    orders: await listPurchaseOrders(tx, pharmacyId),
    suppliers: (await listPartners(tx, pharmacyId, "suppliers")).filter((s) => s.isActive),
  }));
  const counts = { waiting: data.orders.filter((o) => isWaiting(o.status)).length, done: data.orders.filter((o) => !isWaiting(o.status)).length, all: data.orders.length };
  const shown = data.orders.filter((o) => (current === "all" ? true : current === "waiting" ? isWaiting(o.status) : !isWaiting(o.status)));

  return (
    <div className="space-y-5">
      <PageHeader title="Purchase orders" description="Order from a supplier, then record each delivery when it arrives. An order can arrive in several deliveries." />

      <Card title="New purchase order" description="Step 1 of 3: choose the supplier. You add the items on the next page.">
        {data.suppliers.length === 0 ? (
          <p className="text-sm text-slate-600">Add a <Link href="/master/suppliers" className="font-medium text-emerald-700 underline">supplier</Link> first.</p>
        ) : (
          <NewPurchaseOrderForm suppliers={data.suppliers} />
        )}
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-100 pb-3">
          {TABS.map((t) => (
            <Link key={t.key} href={`/purchasing?view=${t.key}`} className={cx("rounded-lg px-3 py-1.5 text-sm font-medium", current === t.key ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-100")}>
              {t.label} <span className="ml-1 text-xs text-slate-500">{counts[t.key]}</span>
            </Link>
          ))}
        </div>
        {data.orders.length === 300 && <p className="mb-3 text-xs text-slate-500">Showing the latest 300 orders.</p>}
        {shown.length === 0 ? (
          <EmptyState icon={<PackageCheck className="size-5" aria-hidden="true" />} title={current === "waiting" ? "Nothing is waiting for delivery" : "No orders here"} description="Create a purchase order above to start." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr><th className="py-2 pr-4">Order</th><th className="py-2 pr-4">Supplier</th><th className="py-2 pr-4">Status</th><th className="w-48 py-2 pr-4">Received</th><th className="py-2" /></tr></thead>
              <tbody>
                {shown.map((o) => (
                  <tr key={o.id} className="border-t border-slate-100">
                    <td className="py-2.5 pr-4"><span className="font-mono">{o.poNo}</span><div className="text-xs text-slate-500">{o.createdAt.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</div></td>
                    <td className="py-2.5 pr-4">{o.supplierName}</td>
                    <td className="py-2.5 pr-4"><OrderStatusBadge status={o.status} /></td>
                    <td className="py-2.5 pr-4">
                      {o.orderedBase > 0 ? (
                        <>
                          <ProgressBar value={o.receivedBase} max={o.orderedBase} tone={o.status === "partial" ? "warning" : "success"} label={`${o.poNo} received`} />
                          <div className="tabular mt-1 text-xs text-slate-500">{Math.min(o.receivedBase, o.orderedBase)} of {o.orderedBase} units</div>
                        </>
                      ) : <span className="text-xs text-slate-400">No items yet</span>}
                    </td>
                    <td className="py-2.5 text-right"><Link href={`/purchasing/${o.id}`} className="font-medium text-emerald-700 hover:underline">{isWaiting(o.status) ? "Open / receive" : "View"}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
