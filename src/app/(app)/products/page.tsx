import Link from "next/link";
import { Suspense } from "react";
import { Card, Loading, Badge } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { listLookup } from "@/server/master-data";
import { listProducts } from "@/server/products";
import { withPharmacy } from "@/server/tenant";
import { NewProductForm } from "./product-forms";

export default function ProductsPage({ searchParams }: PageProps<"/products">) {
  return (
    <Suspense fallback={<Loading />}>
      <Products searchParams={searchParams} />
    </Suspense>
  );
}

async function Products({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const session = await requirePharmacy();
  if (!can(session.role, "products.view")) return <p className="text-sm text-red-700">You do not have access to products.</p>;
  const { q } = await searchParams;
  const search = typeof q === "string" ? q : undefined;
  const pharmacyId = session.pharmacy.id;
  const showCost = can(session.role, "costs.view");
  const canCreate = can(session.role, "products.edit_prices");

  const data = await withPharmacy(getDb(), pharmacyId, async (tx) => ({
    list: await listProducts(tx, pharmacyId, search),
    categories: canCreate ? (await listLookup(tx, pharmacyId, "categories")).filter((r) => r.isActive) : [],
    statuses: canCreate ? (await listLookup(tx, pharmacyId, "statuses")).filter((r) => r.isActive) : [],
    units: canCreate ? (await listLookup(tx, pharmacyId, "units")).filter((r) => r.isActive) : [],
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Products</h1>
      {canCreate && (
        <Card title="Add product">
          <NewProductForm categories={data.categories} statuses={data.statuses} units={data.units} />
        </Card>
      )}
      <Card>
        <form className="mb-4">
          <input name="q" defaultValue={search} placeholder="Search name or code" className="w-full rounded-md border border-slate-300 px-3 py-2 sm:max-w-sm" />
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4 text-right">Stock</th>
                {showCost && <th className="py-2 pr-4 text-right">Base cost</th>}
                {showCost && <th className="py-2 pr-4 text-right">Recommended</th>}
                <th className="py-2 pr-4 text-right">Selling price</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {data.list.map((p) => (
                <tr key={p.id} className={`border-t border-slate-100 ${p.isActive ? "" : "text-slate-400"}`}>
                  <td className="py-2 pr-4 font-mono">{p.code}</td>
                  <td className="py-2 pr-4">{p.name}</td>
                  <td className="py-2 pr-4 text-right tabular">{p.stock <= 0 ? <Badge tone="error">Out of stock</Badge> : <>{p.stock} {p.baseUnitName}</>}</td>
                  {showCost && <td className="py-2 pr-4 text-right">{p.baseCost}</td>}
                  {showCost && <td className="py-2 pr-4 text-right">{p.recommendedPrice}</td>}
                  <td className="py-2 pr-4 text-right">{p.sellPrice}</td>
                  <td className="py-2 text-right"><Link href={`/products/${p.id}`} className="text-emerald-700 underline">Detail</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.list.length === 0 && <p className="py-4 text-sm text-slate-500">No products found.</p>}
          {data.list.length === 500 && <p className="pt-3 text-xs text-slate-500">Showing the first 500 matches. Type in the search box to find a specific product.</p>}
        </div>
      </Card>
    </div>
  );
}
