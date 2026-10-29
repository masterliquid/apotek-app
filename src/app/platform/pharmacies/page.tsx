import Link from "next/link";
import { Suspense } from "react";
import { logoutAction } from "@/app/actions";
import { Card, Loading } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePlatformAdmin } from "@/lib/auth";
import { listPharmacies } from "@/server/pharmacies";
import { PharmacyForm } from "./pharmacy-form";

export default function PlatformPharmaciesPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <Suspense fallback={<Loading />}>
        <Pharmacies />
      </Suspense>
    </main>
  );
}

async function Pharmacies() {
  const session = await requirePlatformAdmin();
  const list = await listPharmacies(getDb());
  return (
    <>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Pharmacies</h1>
        <span className="ml-auto text-sm text-slate-600">{session.user.fullName}</span>
        <Link href="/select-pharmacy" className="text-sm text-emerald-700 underline">
          My pharmacies
        </Link>
        <form action={logoutAction}>
          <button className="text-sm text-emerald-700 underline">Log out</button>
        </form>
      </div>
      <Card title="New pharmacy">
        <PharmacyForm />
      </Card>
      <Card title="All pharmacies">
        {list.length === 0 ? (
          <p className="text-sm text-slate-600">No pharmacies yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {list.map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span>
                  <span className="font-mono">{p.code}</span> — {p.name}
                </span>
                <span className="text-slate-500">{p.isActive ? "Active" : "Inactive"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
