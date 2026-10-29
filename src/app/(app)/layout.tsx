import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { AppShell } from "@/components/app-shell";
import { NAV } from "@/components/nav-config";
import { requirePharmacy } from "@/lib/auth";
import { can } from "@/server/auth/permissions";
import { logoutAction } from "../actions";

export default function AppLayout({ children }: LayoutProps<"/">) {
  // The session is read inside the boundary (required with Cache Components).
  return (
    <Suspense fallback={<Loading />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const session = await requirePharmacy();
  // Only what the role may use is shown; the server enforces the same permissions on every action.
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || can(session.role, i.permission)) })).filter((g) => g.items.length > 0);
  return (
    <AppShell pharmacyName={session.pharmacy.name} user={{ fullName: session.user.fullName, role: session.role }} groups={groups} isPlatformAdmin={session.user.isPlatformAdmin} logoutAction={logoutAction}>
      {children}
    </AppShell>
  );
}
