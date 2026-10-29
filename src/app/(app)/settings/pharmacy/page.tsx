import { Suspense } from "react";
import { Card, Loading } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { getPharmacy } from "@/server/pharmacies";
import { PharmacySettingsForm } from "../settings-forms";

export default function PharmacySettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PharmacySettings />
    </Suspense>
  );
}

async function PharmacySettings() {
  const session = await requirePharmacy();
  if (!can(session.role, "settings.manage")) return <p className="text-sm text-red-700">You do not have access to settings.</p>;
  const p = await getPharmacy(getDb(), session.pharmacy.id);
  if (!p) return null;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Pharmacy settings</h1>
      <Card>
        <PharmacySettingsForm values={{ name: p.name, address: p.address ?? "", phone: p.phone ?? "", receiptHeader: p.receiptHeader ?? "", receiptFooter: p.receiptFooter ?? "", buyPriceMarkupPct: p.buyPriceMarkupPct, expiryWarningDays: p.expiryWarningDays }} />
      </Card>
    </div>
  );
}
