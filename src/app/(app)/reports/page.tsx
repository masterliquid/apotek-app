import Link from "next/link";
import { Suspense } from "react";
import { Card, Loading } from "@/components/ui";
import { requirePharmacy } from "@/lib/auth";
import { can, type Permission } from "@/server/auth/permissions";

const REPORTS: { href: string; title: string; text: string; any: Permission[] }[] = [
  { href: "/reports/sales", title: "Sales", text: "Sales, returns and net by day range, split by payment method.", any: ["reports.sales_all", "reports.sales_own"] },
  { href: "/reports/profit", title: "Profit", text: "Revenue, cost at time of sale and profit per day, after returns.", any: ["reports.profit"] },
  { href: "/reports/stock", title: "Stock", text: "Stock on hand per product, valued at cost and selling price.", any: ["products.view"] },
  { href: "/reports/expiry", title: "Expiry", text: "Expired and soon-to-expire batches that still have stock.", any: ["inventory.adjust"] },
  { href: "/reports/prices", title: "Price list", text: "Selling prices per product and pack unit.", any: ["products.view"] },
];

export default function ReportsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Reports />
    </Suspense>
  );
}

async function Reports() {
  const session = await requirePharmacy();
  const available = REPORTS.filter((r) => r.any.some((p) => can(session.role, p)));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reports</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {available.map((r) => (
          <Link key={r.href} href={r.href}><Card title={r.title}><p className="text-sm text-slate-600">{r.text}</p></Card></Link>
        ))}
      </div>
    </div>
  );
}
