import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, Loading } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { listLookup } from "@/server/master-data";
import { getProduct, getProductPackUnits } from "@/server/products";
import { withPharmacy } from "@/server/tenant";
import { removePackUnitAction } from "../actions";
import { PackUnitForm, PriceForm } from "../product-forms";

export default function ProductDetailPage({ params }: PageProps<"/products/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <ProductDetail params={params} />
    </Suspense>
  );
}

async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePharmacy();
  if (!can(session.role, "products.view")) return <p className="text-sm text-red-700">You do not have access to products.</p>;
  const productId = Number((await params).id);
  if (!Number.isSafeInteger(productId)) notFound();

  const pharmacyId = session.pharmacy.id;
  const data = await withPharmacy(getDb(), pharmacyId, async (tx) => ({
    product: await getProduct(tx, pharmacyId, productId),
    packUnits: await getProductPackUnits(tx, pharmacyId, productId),
    units: (await listLookup(tx, pharmacyId, "units")).filter((u) => u.isActive),
  }));
  if (!data.product) notFound();
  const p = data.product;
  const canEditPrices = can(session.role, "products.edit_prices");
  const canEditUnits = can(session.role, "products.edit_details");
  const showCost = can(session.role, "costs.view");

  return (
    <div className="space-y-4">
      <Link href="/products" className="text-sm text-emerald-700 underline">← Products</Link>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{p.name} <span className="font-mono text-sm text-slate-500">{p.code}</span></h1>

      <Card title="Prices">
        <p className="mb-3 text-sm text-slate-600">
          Per {p.baseUnitName}. {showCost && <>Buy price {p.buyPrice} · Recommended {p.recommendedPrice} · </>}Selling price {p.sellPrice}.
        </p>
        {canEditPrices && <PriceForm productId={p.id} baseCost={p.baseCost} marginPct={p.marginPct} sellPrice={p.sellPrice} />}
      </Card>

      <Card title="Pack units">
        <ul className="mb-4 divide-y divide-slate-100 text-sm">
          <li className="py-2">1 {p.baseUnitName} (base unit) · {p.sellPrice}</li>
          {data.packUnits.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-2">
              <span>1 {u.unitName} = {u.factor} {p.baseUnitName} · price {u.sellPrice ?? `${(Number(p.sellPrice) * u.factor).toFixed(2)} (auto)`}</span>
              {canEditUnits && (
                <form action={removePackUnitAction}>
                  <input type="hidden" name="packUnitId" value={u.id} />
                  <input type="hidden" name="productId" value={p.id} />
                  <button className="text-red-700 underline">Remove</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {canEditUnits && <PackUnitForm productId={p.id} units={data.units.filter((u) => u.id !== p.baseUnitId)} />}
      </Card>
    </div>
  );
}
