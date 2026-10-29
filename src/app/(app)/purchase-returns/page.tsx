import Link from "next/link";
import { Suspense } from "react";
import { Card, Loading } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { getReturnableReceiptLines, listGoodsReceipts } from "@/server/returns";
import { withPharmacy } from "@/server/tenant";
import { ReturnForm } from "../returns/return-form";

export default function PurchaseReturnsPage({ searchParams }: PageProps<"/purchase-returns">) {
  return (
    <Suspense fallback={<Loading />}>
      <PurchaseReturns searchParams={searchParams} />
    </Suspense>
  );
}

async function PurchaseReturns({ searchParams }: { searchParams: Promise<{ receipt?: string | string[]; done?: string | string[] }> }) {
  const session = await requirePharmacy();
  if (!can(session.role, "purchasing.manage")) return <p className="text-sm text-red-700">You do not have access to purchase returns.</p>;
  const { receipt, done } = await searchParams;
  const receiptId = typeof receipt === "string" ? Number(receipt) : null;
  const pharmacyId = session.pharmacy.id;

  const data = await withPharmacy(getDb(), pharmacyId, async (tx) => {
    const receipts = await listGoodsReceipts(tx, pharmacyId);
    const selected = receiptId ? receipts.find((r) => r.id === receiptId) ?? null : null;
    return { receipts, selected, lines: selected ? await getReturnableReceiptLines(tx, pharmacyId, selected.id) : [] };
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Purchase returns</h1>
      {typeof done === "string" && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800" role="status">Return {done} saved. Stock has been taken out.</p>}
      <Card title="Goods receipts">
        <ul className="divide-y divide-slate-100 text-sm">
          {data.receipts.map((r) => (
            <li key={r.id} className="flex justify-between py-2">
              <span><span className="font-mono">{r.poNo}</span> · invoice {r.invoiceNo} · {r.grandTotal}</span>
              <Link href={`/purchase-returns?receipt=${r.id}`} className="text-emerald-700 underline">Return goods</Link>
            </li>
          ))}
        </ul>
        {data.receipts.length === 0 && <p className="text-sm text-slate-500">No goods received yet.</p>}
      </Card>
      {data.selected && (
        <Card title={`Return from ${data.selected.poNo} (invoice ${data.selected.invoiceNo})`}>
          <ReturnForm
            kind="purchase"
            documentId={data.selected.id}
            lines={data.lines.map((l) => ({ id: l.id, title: l.productName, detail: `Received ${l.qty} ${l.unitName} · batch ${l.batchNo} (${l.batchQty} left in stock) · already returned ${l.returnedQty}`, max: l.returnableQty }))}
          />
        </Card>
      )}
    </div>
  );
}
