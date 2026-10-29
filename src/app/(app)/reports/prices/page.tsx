import { Suspense } from "react";
import { Card, Loading } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { ALL_PRODUCTS, listAllPackUnits, listProducts } from "@/server/products";
import { withPharmacy } from "@/server/tenant";
import { toMoney } from "@/server/money";
import { PrintButton } from "../print-button";

export default function PriceListPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PriceList />
    </Suspense>
  );
}

async function PriceList() {
  const session = await requirePharmacy();
  if (!can(session.role, "products.view")) return <p className="text-sm text-red-700">You do not have access to this report.</p>;
  const pharmacyId = session.pharmacy.id;
  const data = await withPharmacy(getDb(), pharmacyId, async (tx) => ({ products: (await listProducts(tx, pharmacyId, undefined, ALL_PRODUCTS)).filter((p) => p.isActive), packs: await listAllPackUnits(tx, pharmacyId) }));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4"><h1 className="text-2xl font-semibold tracking-tight text-slate-900">Price list</h1><PrintButton /></div>
      <Card>
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500"><tr><th className="py-2 pr-4">Code</th><th className="py-2 pr-4">Product</th><th className="py-2 pr-4 text-right">Price</th><th className="py-2">Packs</th></tr></thead>
          <tbody>
            {data.products.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="py-2 pr-4 font-mono">{p.code}</td><td className="py-2 pr-4">{p.name}</td><td className="py-2 pr-4 text-right">{p.sellPrice} / {p.baseUnitName}</td>
                <td className="py-2 text-slate-600">{data.packs.filter((k) => k.productId === p.id).map((k) => `${k.unitName} (${k.factor}) ${k.sellPrice ?? toMoney(Number(p.sellPrice) * k.factor)}`).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.products.length === 0 && <p className="py-4 text-sm text-slate-500">No products yet.</p>}
      </Card>
    </div>
  );
}
