import Link from "next/link";
import { Suspense } from "react";
import { Card, Loading } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth";
import { listActiveMemberships } from "@/server/auth/login";
import { selectPharmacyAction } from "./actions";

export default function SelectPharmacyPage() {
  return (
    <main className="mx-auto w-full max-w-md p-4">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight text-slate-900">Choose a pharmacy</h1>
      <Suspense fallback={<Loading />}>
        <PharmacyList />
      </Suspense>
    </main>
  );
}

async function PharmacyList() {
  const session = await requireUser();
  const list = await listActiveMemberships(getDb(), session.user.id);
  return (
    <Card>
      {list.length === 0 && <p className="text-sm text-slate-600">You are not a member of any active pharmacy.</p>}
      <ul className="space-y-2">
        {list.map((p) => (
          <li key={p.pharmacyId}>
            <form action={selectPharmacyAction}>
              <input type="hidden" name="pharmacyId" value={p.pharmacyId} />
              <button className="w-full rounded-md border border-slate-200 px-4 py-3 text-left hover:bg-emerald-50">
                <span className="font-medium">{p.name}</span>
                <span className="ml-2 text-xs uppercase text-slate-500">{p.role}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      {session.user.isPlatformAdmin && (
        <Link href="/platform/pharmacies" className="mt-4 block text-sm text-emerald-700 underline">
          Platform admin
        </Link>
      )}
    </Card>
  );
}
