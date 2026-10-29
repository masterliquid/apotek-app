import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, Loading } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { getOpname } from "@/server/inventory";
import { ALL_PRODUCTS, listProducts } from "@/server/products";
import { withPharmacy } from "@/server/tenant";
import { removeOpnameLineAction } from "../../actions";
import { AddOpnameProductForm, CountForm } from "../../forms";

export default function OpnameDetailPage({ params }: PageProps<"/inventory/opname/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <OpnameDetail params={params} />
    </Suspense>
  );
}

async function OpnameDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePharmacy();
  if (!can(session.role, "inventory.adjust")) return <p className="text-sm text-red-700">You do not have access to stock opname.</p>;
  const opnameId = Number((await params).id);
  if (!Number.isSafeInteger(opnameId)) notFound();
  const pharmacyId = session.pharmacy.id;

  const data = await withPharmacy(getDb(), pharmacyId, async (tx) => {
    const opname = await getOpname(tx, pharmacyId, opnameId);
    return { opname, products: opname?.status === "pending" ? (await listProducts(tx, pharmacyId, undefined, ALL_PRODUCTS)).filter((p) => p.isActive) : [] };
  });
  const o = data.opname;
  if (!o) notFound();
  const pending = o.status === "pending";
  const lines = o.lines.map((l) => ({ id: l.id, label: `${l.productName} — batch ${l.batchNo}${l.expiryDate ? ` (exp ${l.expiryDate})` : ""}`, systemQty: l.systemQty, physicalQty: l.physicalQty, differenceValue: l.differenceValue }));

  return (
    <div className="space-y-4">
      <Link href="/inventory/opname" className="text-sm text-emerald-700 underline">← Stock opname</Link>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900"><span className="font-mono">{o.opnameNo}</span> <span className="text-sm font-normal capitalize text-slate-500">({o.status})</span></h1>
      {pending ? (
        <>
          <Card><AddOpnameProductForm opnameId={o.id} products={data.products.map((p) => ({ id: p.id, label: `${p.name} (${p.code})` }))} /></Card>
          <Card title="Counting sheet">
            <CountForm opnameId={o.id} lines={lines} canCommit={can(session.role, "inventory.commit_opname")} removeAction={removeOpnameLineAction} />
            <p className="mt-3 text-xs text-slate-500">Committing applies each difference (counted − system) to the stock at that moment, so sales made while you were counting are kept.</p>
          </Card>
        </>
      ) : (
        <Card title={`Committed · difference value ${o.totalDifferenceValue}`}>
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500"><tr><th className="py-2 pr-4">Batch</th><th className="py-2 pr-4 text-right">System</th><th className="py-2 pr-4 text-right">Counted</th><th className="py-2 text-right">Value</th></tr></thead>
            <tbody>{lines.map((l) => <tr key={l.id} className="border-t border-slate-100"><td className="py-2 pr-4">{l.label}</td><td className="py-2 pr-4 text-right">{l.systemQty}</td><td className="py-2 pr-4 text-right">{l.physicalQty}</td><td className="py-2 text-right">{l.differenceValue}</td></tr>)}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
