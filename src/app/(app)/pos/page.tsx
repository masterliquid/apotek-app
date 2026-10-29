import { Suspense } from "react";
import { Badge, Loading, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { ALL_PRODUCTS, listAllPackUnits, listProducts } from "@/server/products";
import { getSale, listPaymentMethods } from "@/server/sales";
import { withPharmacy } from "@/server/tenant";
import { PosClient } from "./pos-client";

export default function PosPage({ searchParams }: PageProps<"/pos">) {
  return (
    <Suspense fallback={<Loading />}>
      <Pos searchParams={searchParams} />
    </Suspense>
  );
}

async function Pos({ searchParams }: { searchParams: Promise<{ sale?: string | string[] }> }) {
  const session = await requirePharmacy();
  if (!can(session.role, "sales.sell")) return <p className="text-sm text-red-700">You do not have access to the POS.</p>;
  const { sale } = await searchParams;
  const saleId = typeof sale === "string" ? Number(sale) : null;
  const pharmacyId = session.pharmacy.id;

  const data = await withPharmacy(getDb(), pharmacyId, async (tx) => ({
    products: (await listProducts(tx, pharmacyId, undefined, ALL_PRODUCTS)).filter((p) => p.isActive),
    packs: await listAllPackUnits(tx, pharmacyId),
    methods: await listPaymentMethods(tx, pharmacyId),
    pending: saleId && Number.isSafeInteger(saleId) ? await getSale(tx, pharmacyId, saleId) : null,
  }));

  const products = data.products.map((p) => ({
    id: p.id, code: p.code, name: p.name, stock: p.stock, baseUnitId: p.baseUnitId, baseUnitName: p.baseUnitName, sellPrice: p.sellPrice,
    packs: data.packs.filter((k) => k.productId === p.id).map((k) => ({ unitId: k.unitId, unitName: k.unitName, factor: k.factor, sellPrice: k.sellPrice })),
  }));
  const initial = data.pending?.status === "pending"
    ? { saleId: data.pending.id, customerName: data.pending.customerName ?? "", lines: data.pending.lines.map((l) => ({ productId: l.productId, unitId: l.unitId, qty: l.qty, discountPct: l.discountPct })) }
    : null;

  return (
    <div>
      <PageHeader title="Point of Sale" description={session.pharmacy.name} actions={initial && <Badge tone="warning">Resuming held sale</Badge>} />
      {data.methods.length === 0 ? <p className="text-sm text-red-700">No payment methods. Ask an admin to add one.</p> : <PosClient products={products} methods={data.methods} initial={initial} />}
    </div>
  );
}
