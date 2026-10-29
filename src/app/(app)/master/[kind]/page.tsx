import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, Loading, Badge } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { LOOKUP_KINDS, isLookupKind, isPartnerKind, listLookup, listPartners, PARTNER_KINDS } from "@/server/master-data";
import { withPharmacy } from "@/server/tenant";
import { toggleMasterAction } from "../actions";
import { MasterForm } from "./master-form";

export default function MasterPage({ params }: PageProps<"/master/[kind]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Master params={params} />
    </Suspense>
  );
}

async function Master({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isLookupKind(kind) && !isPartnerKind(kind)) notFound();

  const session = await requirePharmacy();
  const pharmacyId = session.pharmacy.id;
  const isPartner = isPartnerKind(kind);
  const label = isPartner ? PARTNER_KINDS[kind].label : LOOKUP_KINDS[kind as keyof typeof LOOKUP_KINDS].label;
  const needed = !isPartner ? "products.edit_details" : kind === "customers" ? "customers.create" : "partners.manage";
  if (!can(session.role, needed)) return <p className="text-sm text-red-700">You do not have access to {label.toLowerCase()}.</p>;

  const rows = await withPharmacy(getDb(), pharmacyId, async (tx) =>
    isPartner ? listPartners(tx, pharmacyId, kind) : (await listLookup(tx, pharmacyId, kind as keyof typeof LOOKUP_KINDS)).map((r) => ({ ...r, phone: null, address: null })),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{label}</h1>
      <Card title="Add">
        <MasterForm kind={kind} withContact={isPartner} />
      </Card>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 pr-4">Name</th>
                {isPartner && <th className="py-2 pr-4">Phone</th>}
                {isPartner && <th className="py-2 pr-4">Address</th>}
                <th className="py-2 pr-4">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="py-2 pr-4">{r.name}</td>
                  {isPartner && <td className="py-2 pr-4">{r.phone}</td>}
                  {isPartner && <td className="py-2 pr-4">{r.address}</td>}
                  <td className="py-2 pr-4"><Badge tone={r.isActive ? "success" : "neutral"}>{r.isActive ? "Active" : "Inactive"}</Badge></td>
                  <td className="py-2 text-right">
                    <form action={toggleMasterAction}>
                      <input type="hidden" name="kind" value={kind} />
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="activate" value={String(!r.isActive)} />
                      <button className="text-emerald-700 underline">{r.isActive ? "Deactivate" : "Activate"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
