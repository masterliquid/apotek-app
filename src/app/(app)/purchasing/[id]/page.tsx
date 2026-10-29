import Link from "next/link";
import { Check } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, EmptyState, Loading, Notice, PageHeader, ProgressBar, Stat, cx } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { ALL_PRODUCTS, listAllPackUnits, listProducts } from "@/server/products";
import { getPurchaseOrder } from "@/server/purchasing";
import { withPharmacy } from "@/server/tenant";
import { AddLineForm, LineQtyForm, OrderActions, ReceiveForm, RemoveLineForm, type OrderProduct } from "../purchasing-forms";
import { isWaiting, OrderStatusBadge } from "../status";

export default function PurchaseOrderPage({ params, searchParams }: PageProps<"/purchasing/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <PurchaseOrder params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// Where the order is in its life, shown as three steps: 1 no items yet, 2 waiting for deliveries, 3 finished.
function Steps({ status, hasLines }: { status: string; hasLines: boolean }) {
  const stage = status === "received" || status === "closed" || status === "cancelled" ? 3 : hasLines ? 2 : 1;
  const items = [
    { n: 1, label: "Order the items" },
    { n: 2, label: "Receive deliveries" },
    { n: 3, label: status === "cancelled" ? "Cancelled" : status === "closed" ? "Closed" : "Complete" },
  ];
  return (
    <ol className="flex flex-wrap gap-2 text-sm">
      {items.map((i) => {
        const done = stage > i.n || (i.n === 3 && stage === 3 && status !== "cancelled");
        const active = stage === i.n && !done;
        return (
          <li key={i.n} className={cx("flex items-center gap-2 rounded-full border px-3 py-1", done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-500")}>
            <span className={cx("flex size-5 items-center justify-center rounded-full text-[11px] font-semibold", done ? "bg-emerald-600 text-white" : active ? "bg-white text-slate-900" : "bg-slate-100")}>{done ? <Check className="size-3" aria-hidden="true" /> : i.n}</span>
            {i.label}
          </li>
        );
      })}
    </ol>
  );
}

async function PurchaseOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ received?: string | string[] }> }) {
  const session = await requirePharmacy();
  if (!can(session.role, "purchasing.manage")) return <p className="text-sm text-red-700">You do not have access to purchasing.</p>;
  const poId = Number((await params).id);
  if (!Number.isSafeInteger(poId)) notFound();
  const { received: justReceived } = await searchParams;

  const pharmacyId = session.pharmacy.id;
  const data = await withPharmacy(getDb(), pharmacyId, async (tx) => {
    const po = await getPurchaseOrder(tx, pharmacyId, poId);
    if (!po || !isWaiting(po.status)) return { po, products: [] as OrderProduct[] };
    const [list, packs] = await Promise.all([listProducts(tx, pharmacyId, undefined, ALL_PRODUCTS), listAllPackUnits(tx, pharmacyId)]);
    return {
      po,
      products: list.filter((p) => p.isActive).map((p) => ({
        id: p.id,
        label: `${p.name} (${p.code})`,
        units: [{ id: p.baseUnitId, label: `${p.baseUnitName} (base unit)` }, ...packs.filter((k) => k.productId === p.id).map((k) => ({ id: k.unitId, label: `${k.unitName} (${k.factor} ${p.baseUnitName})` }))],
      })),
    };
  });
  const po = data.po;
  if (!po) notFound();

  const waiting = isWaiting(po.status);
  const orderedBase = po.lines.reduce((t, l) => t + l.qty * l.unitFactor, 0);
  const receivedBase = po.lines.reduce((t, l) => t + Math.min(l.receivedQty, l.qty) * l.unitFactor, 0);
  const linesDone = po.lines.filter((l) => l.remainingQty === 0).length;
  const receivable = po.lines.some((l) => l.remainingQty > 0);

  return (
    <div className="space-y-5">
      <Link href="/purchasing" className="text-sm font-medium text-emerald-700 hover:underline">← All purchase orders</Link>
      <PageHeader
        title={po.poNo}
        description={`${po.supplierName} · created ${po.createdAt.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}${po.note ? ` · ${po.note}` : ""}`}
        actions={<OrderStatusBadge status={po.status} />}
      />
      {typeof justReceived === "string" && <Notice tone="success" title={`Delivery ${justReceived} saved`}>Stock was added and the order below is updated.</Notice>}
      <Steps status={po.status} hasLines={po.lines.length > 0} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Ordered" value={`${orderedBase}`} hint={`${po.lines.length} item${po.lines.length === 1 ? "" : "s"}, counted in smallest units`} />
        <Stat label="Received" value={`${receivedBase}`} hint={`${po.receipts.length} deliver${po.receipts.length === 1 ? "y" : "ies"}`} tone={receivedBase > 0 ? "good" : "neutral"} />
        <Stat label="Still to come" value={`${Math.max(orderedBase - receivedBase, 0)}`} hint={po.status === "closed" ? "Closed: the rest will not arrive" : `${linesDone} of ${po.lines.length} items complete`} tone={orderedBase - receivedBase > 0 && waiting ? "warn" : "neutral"} />
      </div>
      {orderedBase > 0 && <ProgressBar value={receivedBase} max={orderedBase} tone={po.status === "partial" ? "warning" : "success"} label="Order progress" />}

      <Card title="Items on this order" description={waiting ? "Check the quantities. A wrong quantity can be corrected here, as long as it is not below what already arrived." : undefined}>
        {po.lines.length === 0 ? (
          <EmptyState title="No items yet" description={waiting ? "Add the items you are ordering below." : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr><th className="py-2 pr-4">Item</th><th className="py-2 pr-4">Unit</th><th className="py-2 pr-4 text-right">Ordered</th><th className="py-2 pr-4 text-right">Received</th><th className="py-2 pr-4 text-right">Still to come</th>{waiting && <th className="py-2" />}</tr></thead>
              <tbody>
                {po.lines.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="py-2.5 pr-4">{l.productName}<div className="font-mono text-xs text-slate-500">{l.productCode}</div></td>
                    <td className="py-2.5 pr-4">{l.unitName}{l.unitFactor > 1 && <span className="text-xs text-slate-500"> ({l.unitFactor} each)</span>}</td>
                    <td className="tabular py-2.5 pr-4 text-right font-medium">{l.qty}</td>
                    <td className="tabular py-2.5 pr-4 text-right">{l.receivedQty}</td>
                    <td className={cx("tabular py-2.5 pr-4 text-right font-medium", l.remainingQty > 0 ? "text-amber-700" : "text-emerald-700")}>{l.remainingQty > 0 ? l.remainingQty : "Complete"}</td>
                    {waiting && (
                      <td className="py-2.5">
                        <div className="flex flex-wrap items-center justify-end gap-3">
                          <LineQtyForm purchaseOrderId={po.id} lineId={l.id} qty={l.qty} received={l.receivedQty} />
                          {l.receivedQty === 0 && <RemoveLineForm purchaseOrderId={po.id} lineId={l.id} />}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {waiting && (
        <Card title="Add an item" description="Step 2 of 3: list what you are ordering.">
          <AddLineForm purchaseOrderId={po.id} products={data.products} />
        </Card>
      )}

      {waiting && receivable && (
        <Card title="Receive a delivery" description="Step 3 of 3: when goods arrive, enter what actually came. Save as many deliveries as the supplier sends.">
          <ReceiveForm
            purchaseOrderId={po.id}
            lines={po.lines.map((l) => ({ id: l.id, productCode: l.productCode, productName: l.productName, unitName: l.unitName, ordered: l.qty, received: l.receivedQty, remaining: l.remainingQty, suggestedPrice: l.suggestedPrice }))}
          />
        </Card>
      )}

      {waiting && (
        <Card title={po.status === "partial" ? "Will the rest never arrive?" : "Changed your mind?"}>
          <p className="mb-3 text-sm text-slate-600">
            {po.status === "partial" ? "Close the order to stop waiting for the missing items. What already arrived stays in stock." : "An order with nothing received can be cancelled."}
          </p>
          <OrderActions purchaseOrderId={po.id} status={po.status as "open" | "partial"} />
        </Card>
      )}

      <Card title={`Deliveries received (${po.receipts.length})`} description="Every delivery is kept here, with its batches and expiry dates.">
        {po.receipts.length === 0 ? (
          <EmptyState title="Nothing received yet" description="Deliveries you save above will be listed here." />
        ) : (
          <div className="space-y-5">
            {po.receipts.map((r) => (
              <section key={r.id}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    <span className="font-mono">{r.receiptNo ?? `#${r.id}`}</span>
                    <span className="ml-2 font-normal text-slate-500">invoice {r.invoiceNo} · {r.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })}</span>
                  </h3>
                  <span className="tabular text-sm font-semibold">{r.grandTotal}</span>
                </div>
                {r.note && <p className="mb-2 text-xs text-slate-500">{r.note}</p>}
                <table className="w-full text-left text-sm">
                  <thead><tr><th className="py-1.5 pr-4">Item</th><th className="py-1.5 pr-4 text-right">Qty</th><th className="py-1.5 pr-4">Batch</th><th className="py-1.5 pr-4">Expiry</th><th className="py-1.5 pr-4 text-right">Price</th><th className="py-1.5 text-right">Total</th></tr></thead>
                  <tbody>
                    {r.lines.map((l, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-1.5 pr-4">{l.productName}{!l.planned && <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-800">not on the order</span>}</td>
                        <td className="tabular py-1.5 pr-4 text-right">{l.qty} {l.unitName}</td>
                        <td className="py-1.5 pr-4 font-mono">{l.batchNo}</td>
                        <td className="py-1.5 pr-4">{l.expiryDate}</td>
                        <td className="tabular py-1.5 pr-4 text-right">{l.unitPrice}{l.discountPct !== "0.00" && <span className="text-xs text-slate-500"> −{l.discountPct}%</span>}</td>
                        <td className="tabular py-1.5 text-right">{l.lineTotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
