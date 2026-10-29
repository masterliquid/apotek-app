"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowLeftRight, BarChart3, Boxes, ClipboardList, HandCoins, LayoutDashboard, LogOut, Menu, Pill, Printer, Receipt, Ruler, Settings, ShoppingCart,
  Tag, Truck, Undo2, Users, UserRound, Wallet, X, ListChecks, Building2, type LucideIcon,
} from "lucide-react";
import { Badge, cx } from "@/components/ui";
import type { NavGroup, NavIcon } from "@/components/nav-config";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard, cart: ShoppingCart, receipt: Receipt, undo: Undo2, pill: Pill, adjust: ArrowLeftRight, clipboard: ClipboardList,
  truck: Truck, return: Boxes, supplier: Building2, payable: Wallet, receivable: HandCoins, chart: BarChart3, customers: UserRound, tag: Tag,
  ruler: Ruler, status: ListChecks, printer: Printer, settings: Settings, users: Users,
};

function Brand({ pharmacyName }: { pharmacyName: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
        <Pill className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold text-white">{pharmacyName}</p>
        <p className="text-xs text-emerald-200/70">Apotek POS</p>
      </div>
    </div>
  );
}

function Nav({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-5 overflow-y-auto pb-4">
      {groups.map((group) => (
        <div key={group.section}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-emerald-200/50 uppercase">{group.section}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map(({ label, icon, href }) => {
              const Icon = ICONS[icon];
              // "/sales" must not light up on "/sales/…/receipt" siblings like "/returns"; match whole path segments.
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-white/10 text-white" : "text-emerald-100/75 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Icon className={cx("size-4", active && "text-emerald-300")} aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({
  pharmacyName,
  user,
  groups,
  isPlatformAdmin,
  logoutAction,
  children,
}: {
  pharmacyName: string;
  user: { fullName: string; role: string };
  groups: NavGroup[];
  isPlatformAdmin: boolean;
  logoutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:pl-60 print:pl-0">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-emerald-950 px-3 py-5 lg:flex print:hidden">
        <div className="mb-6 px-2"><Brand pharmacyName={pharmacyName} /></div>
        <Nav groups={groups} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className="absolute inset-0 bg-slate-900/50" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-72 max-w-[85%] flex-col bg-emerald-950 px-3 py-5">
            <div className="mb-6 flex items-center justify-between px-2">
              <Brand pharmacyName={pharmacyName} />
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-emerald-100 hover:bg-white/10" aria-label="Close navigation">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <Nav groups={groups} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 print:hidden">
        <button type="button" onClick={() => setOpen(true)} className="-ml-1.5 rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open navigation">
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <p className="truncate text-sm font-semibold text-slate-900 lg:hidden">{pharmacyName}</p>
        <div className="ml-auto flex items-center gap-3">
          {isPlatformAdmin && (
            <Link href="/platform/pharmacies" className="hidden text-sm font-medium text-emerald-800 hover:underline sm:block">Platform</Link>
          )}
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-medium text-slate-900">{user.fullName}</p>
          </div>
          <Badge tone="info" className="uppercase">{user.role}</Badge>
          <form action={logoutAction}>
            <button className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100" aria-label="Log out">
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
