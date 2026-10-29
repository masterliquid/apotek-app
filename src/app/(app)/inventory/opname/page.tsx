import Link from "next/link";
import { Suspense } from "react";
import { Button, Card, Loading, Badge } from "@/components/ui";
import { Field } from "@/components/form";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { listOpnames } from "@/server/inventory";
import { withPharmacy } from "@/server/tenant";
import { createOpnameAction } from "../actions";

export default function OpnamePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Opnames />
    </Suspense>
  );
}

async function Opnames() {
  const session = await requirePharmacy();
  if (!can(session.role, "inventory.adjust")) return <p className="text-sm text-red-700">You do not have access to stock opname.</p>;
  const list = await withPharmacy(getDb(), session.pharmacy.id, (tx) => listOpnames(tx, session.pharmacy.id));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Stock opname</h1>
      <Card title="New stock opname">
        <form action={createOpnameAction} className="flex flex-wrap items-end gap-4">
          <Field label="Note (optional)" name="note" />
          <Button type="submit">Start counting</Button>
        </form>
      </Card>
      <Card title="Stock opnames">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500"><tr><th className="py-2 pr-4">No.</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4 text-right">Difference value</th><th className="py-2" /></tr></thead>
          <tbody>
            {list.map((o) => (
              <tr key={o.id} className="border-t border-slate-100"><td className="py-2 pr-4 font-mono">{o.opnameNo}</td><td className="py-2 pr-4"><Badge tone={o.status === "committed" ? "success" : "warning"}>{o.status === "committed" ? "Committed" : "Counting"}</Badge></td><td className="py-2 pr-4 text-right">{o.totalDifferenceValue}</td><td className="py-2 text-right"><Link href={`/inventory/opname/${o.id}`} className="text-emerald-700 underline">Open</Link></td></tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <p className="py-4 text-sm text-slate-500">No stock opnames yet.</p>}
      </Card>
    </div>
  );
}
