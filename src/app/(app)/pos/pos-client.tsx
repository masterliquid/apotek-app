"use client";

import Decimal from "decimal.js";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Minus,
  PauseCircle,
  Plus,
  ScanBarcode,
  Search,
  ShoppingCart,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Badge, Button, EmptyState, FormMessage, Notice, cx, inputClass } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { completeSaleAction, holdSaleAction } from "./actions";

export type PosProduct = {
  id: number;
  code: string;
  name: string;
  stock: number;
  baseUnitId: number;
  baseUnitName: string;
  sellPrice: string;
  packs: { unitId: number; unitName: string; factor: number; sellPrice: string | null }[];
};
export type PosMethod = { id: number; name: string; kind: "cash" | "non_cash" };
type CartLine = { productId: number; unitId: number; qty: number; discountPct: string };
type PaymentRow = { paymentMethodId: number; amount: string; referenceNo: string; confirmed: boolean };

const fmt = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

// Display-only preview. The server recalculates every price and total from the database.
function unitPrice(p: PosProduct, unitId: number): Decimal {
  if (unitId === p.baseUnitId) return new Decimal(p.sellPrice);
  const pack = p.packs.find((x) => x.unitId === unitId);
  if (!pack) return new Decimal(0);
  return pack.sellPrice ? new Decimal(pack.sellPrice) : new Decimal(p.sellPrice).mul(pack.factor);
}

// UI-only input guards. They keep Decimal from throwing on partial input like "-" or "1.2.";
// they do not change how any value is calculated.
const DECIMAL_TYPING = /^(\d+(\.\d*)?)?$/;
const AMOUNT_VALID = /^\d+(\.\d{1,2})?$/;
const LOW_STOCK = 10;

function StockBadge({ p }: { p: PosProduct }) {
  if (p.stock <= 0) return <Badge tone="error">Out of stock</Badge>;
  if (p.stock <= LOW_STOCK) return <Badge tone="warning">Low · {p.stock}</Badge>;
  return <Badge>{p.stock} in stock</Badge>;
}

const compactInput =
  "h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 aria-invalid:border-red-500";

export function PosClient({ products, methods, initial }: { products: PosProduct[]; methods: PosMethod[]; initial: { saleId: number; customerName: string; lines: CartLine[] } | null }) {
  const [cart, setCart] = useState<CartLine[]>(initial?.lines ?? []);
  const [customerName, setCustomerName] = useState(initial?.customerName ?? "");
  const [search, setSearch] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([{ paymentMethodId: methods.find((m) => m.kind === "cash")?.id ?? methods[0]?.id ?? 0, amount: "", referenceNo: "", confirmed: false }]);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const [activeMatch, setActiveMatch] = useState(0);
  const [scanMiss, setScanMiss] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [lastAction, setLastAction] = useState<"complete" | "hold" | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const methodById = useMemo(() => new Map(methods.map((m) => [m.id, m])), [methods]);
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return products.filter((p) => p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term)).slice(0, 8);
  }, [products, search]);

  const lineTotal = (l: CartLine) => {
    const p = byId.get(l.productId)!;
    const gross = unitPrice(p, l.unitId).mul(l.qty);
    return gross.sub(gross.mul(new Decimal(l.discountPct || "0")).div(100));
  };
  const grandTotal = cart.reduce((sum, l) => sum.add(new Decimal(fmt(lineTotal(l)))), new Decimal(0));
  const paid = payments.reduce((sum, p) => sum.add(/^\d+(\.\d{1,2})?$/.test(p.amount) ? new Decimal(p.amount) : 0), new Decimal(0));
  const change = paid.sub(grandTotal);

  function addProduct(p: PosProduct) {
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === p.id && l.unitId === p.baseUnitId && l.discountPct === "0");
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { productId: p.id, unitId: p.baseUnitId, qty: 1, discountPct: "0" }];
    });
    setSearch("");
    setScanMiss(null);
    setActiveMatch(0);
    searchRef.current?.focus();
  }
  const updateLine = (i: number, patch: Partial<CartLine>) => setCart((c) => c.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const updatePayment = (i: number, patch: Partial<PaymentRow>) => setPayments((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const cartPayload = { saleId: initial?.saleId ?? null, customerName, lines: cart };
  const run = (action: () => Promise<{ error: string } | void>) =>
    startTransition(async () => {
      setError(undefined);
      const result = await action();
      if (result?.error) setError(result.error);
    });

  // F2 jumps back to the scanner field from anywhere on the screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const itemCount = cart.reduce((n, l) => n + l.qty, 0);
  const remaining = change.isNegative() ? change.abs() : new Decimal(0);
  const unconfirmedNonCash = payments.some((p) => methodById.get(p.paymentMethodId)?.kind === "non_cash" && AMOUNT_VALID.test(p.amount) && !p.confirmed);
  const showDropdown = search.trim().length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] xl:gap-6">
      {/* Left column: scanner + cart */}
      <section aria-label="Cart" className="flex min-w-0 flex-col gap-4">
        {initial && (
          <Notice tone="info" title={`Resuming held sale #${initial.saleId}`}>
            Review the items below, then complete payment or hold again.
          </Notice>
        )}

        <div className="relative">
          <label htmlFor="pos-search" className="sr-only">Scan barcode or search product</label>
          <div className="relative">
            <ScanBarcode className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-emerald-700" aria-hidden="true" />
            <input
              id="pos-search"
              ref={searchRef}
              autoFocus
              autoComplete="off"
              role="combobox"
              aria-expanded={showDropdown}
              aria-controls="pos-search-results"
              aria-activedescendant={matches[activeMatch] ? `pos-match-${matches[activeMatch].id}` : undefined}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActiveMatch(0);
                setScanMiss(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && matches.length) {
                  e.preventDefault();
                  setActiveMatch((i) => (i + 1) % matches.length);
                  return;
                }
                if (e.key === "ArrowUp" && matches.length) {
                  e.preventDefault();
                  setActiveMatch((i) => (i - 1 + matches.length) % matches.length);
                  return;
                }
                if (e.key === "Escape") {
                  setSearch("");
                  return;
                }
                if (e.key !== "Enter") return;
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                const exact = products.find((p) => p.code.toLowerCase() === search.trim().toLowerCase());
                const choice = exact ?? matches[activeMatch] ?? matches[0];
                if (choice) addProduct(choice); // a barcode scanner types the code and presses Enter
                else if (search.trim()) setScanMiss(search.trim());
              }}
              placeholder="Scan barcode or search by name / code"
              className="h-14 w-full rounded-xl border border-slate-300 bg-white pr-20 pl-12 text-base text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 sm:block">F2</kbd>
          </div>

          {showDropdown && (
            <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              {matches.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
                  <Search className="size-4" aria-hidden="true" />
                  No products match &ldquo;{search.trim()}&rdquo;
                </div>
              ) : (
                <ul id="pos-search-results" role="listbox" className="max-h-96 overflow-y-auto py-1">
                  {matches.map((p, idx) => (
                    <li key={p.id} id={`pos-match-${p.id}`} role="option" aria-selected={idx === activeMatch}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveMatch(idx)}
                        onClick={() => addProduct(p)}
                        className={cx("flex w-full items-center gap-3 px-4 py-2.5 text-left", idx === activeMatch ? "bg-emerald-50" : "hover:bg-slate-50")}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                          <p className="font-mono text-xs text-slate-500">{p.code}</p>
                        </div>
                        <StockBadge p={p} />
                        <span className="tabular w-20 text-right text-sm font-semibold text-slate-900">{p.sellPrice}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="hidden border-t border-slate-100 bg-slate-50 px-4 py-1.5 text-[11px] text-slate-500 sm:block">
                <kbd className="font-mono">↑↓</kbd> navigate · <kbd className="font-mono">Enter</kbd> add · <kbd className="font-mono">Esc</kbd> clear
              </div>
            </div>
          )}
          {scanMiss && !showDropdown && (
            <Notice tone="warning" className="mt-2">No product found for code <span className="font-mono font-semibold">{scanMiss}</span>.</Notice>
          )}
        </div>

        <div className="@container overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Current sale</h2>
              {cart.length > 0 && <Badge tone="success">{cart.length} {cart.length === 1 ? "line" : "lines"} · {itemCount} units</Badge>}
            </div>
            {cart.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmClear(true)} disabled={pending} className="text-red-700 hover:bg-red-50">
                <Trash2 className="size-3.5" aria-hidden="true" />
                Clear
              </Button>
            )}
          </div>

          {cart.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart className="size-5" aria-hidden="true" />}
              title="Cart is empty"
              description="Scan a barcode or search for a product to start a sale."
            />
          ) : (
            <>
              <div className="hidden grid-cols-[minmax(0,1fr)_120px_120px_84px_96px_36px] gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase @2xl:grid">
                <span>Product</span>
                <span>Unit</span>
                <span>Qty</span>
                <span>Disc %</span>
                <span className="text-right">Total</span>
                <span className="sr-only">Remove</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {cart.map((l, i) => {
                  const p = byId.get(l.productId)!;
                  const discountInvalid = l.discountPct !== "" && new Decimal(l.discountPct || "0").gt(100);
                  const hasDiscount = l.discountPct !== "" && !new Decimal(l.discountPct || "0").isZero();
                  return (
                    <li key={i} className="grid grid-cols-2 items-center gap-3 px-4 py-3 @2xl:grid-cols-[minmax(0,1fr)_120px_120px_84px_96px_36px]">
                      <div className="col-span-2 flex min-w-0 items-start justify-between gap-2 @2xl:col-span-1">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-medium text-slate-900">{p.name}</p>
                          <p className="tabular mt-0.5 text-xs text-slate-500">
                            {fmt(unitPrice(p, l.unitId))} each · {p.stock} {p.baseUnitName} in stock
                          </p>
                        </div>
                        <button type="button" onClick={() => setCart((c) => c.filter((_, j) => j !== i))} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 @2xl:hidden" aria-label={`Remove ${p.name}`}>
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      </div>

                      <select value={l.unitId} onChange={(e) => updateLine(i, { unitId: Number(e.target.value) })} className={cx(compactInput, "w-full")} aria-label={`Unit for ${p.name}`}>
                        <option value={p.baseUnitId}>{p.baseUnitName}</option>
                        {p.packs.map((k) => <option key={k.unitId} value={k.unitId}>{k.unitName} ({k.factor})</option>)}
                      </select>

                      <div className="flex h-9 items-center rounded-lg border border-slate-300 bg-white focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-600/10">
                        <button type="button" onClick={() => updateLine(i, { qty: Math.max(1, l.qty - 1) })} disabled={l.qty <= 1} className="flex h-full w-8 items-center justify-center text-slate-500 hover:text-slate-900 disabled:opacity-30" aria-label="Decrease quantity">
                          <Minus className="size-3.5" aria-hidden="true" />
                        </button>
                        <input type="number" min={1} value={l.qty} onChange={(e) => updateLine(i, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} className="tabular h-full w-full min-w-0 bg-transparent text-center text-sm font-medium outline-none" aria-label={`Quantity for ${p.name}`} />
                        <button type="button" onClick={() => updateLine(i, { qty: l.qty + 1 })} className="flex h-full w-8 items-center justify-center text-slate-500 hover:text-slate-900" aria-label="Increase quantity">
                          <Plus className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="relative">
                        <input
                          inputMode="decimal"
                          value={l.discountPct}
                          onChange={(e) => DECIMAL_TYPING.test(e.target.value) && updateLine(i, { discountPct: e.target.value })}
                          aria-invalid={discountInvalid || undefined}
                          className={cx(compactInput, "tabular w-full pr-6 text-right")}
                          aria-label={`Discount percent for ${p.name}`}
                          title={discountInvalid ? "Discount cannot exceed 100%" : "Discount %"}
                        />
                        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-slate-400">%</span>
                      </div>

                      <div className="text-right">
                        <p className="tabular text-sm font-semibold text-slate-900">{fmt(lineTotal(l))}</p>
                        {hasDiscount && !discountInvalid && <p className="text-[11px] text-emerald-700">−{l.discountPct}%</p>}
                        {discountInvalid && <p className="text-[11px] text-red-600">Max 100%</p>}
                      </div>

                      <button type="button" onClick={() => setCart((c) => c.filter((_, j) => j !== i))} className="hidden size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 @2xl:flex" aria-label={`Remove ${p.name}`}>
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* Right column: checkout */}
      <aside aria-label="Checkout" className="lg:sticky lg:top-20 lg:self-start">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-100 p-4">
            <label htmlFor="pos-customer" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <User className="size-3.5 text-slate-400" aria-hidden="true" />
              Customer <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input id="pos-customer" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in customer" className={inputClass} />
          </div>

          <div className="bg-emerald-950 px-4 py-5 text-white">
            <p className="text-xs font-medium tracking-wide text-emerald-200/70 uppercase">Total due</p>
            <p className="tabular mt-1 text-4xl font-bold tracking-tight">{fmt(grandTotal)}</p>
            <p className="mt-1 text-xs text-emerald-200/60">{itemCount} {itemCount === 1 ? "unit" : "units"} · server confirms final prices</p>
          </div>

          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Payments</h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-emerald-700 hover:bg-emerald-50"
                onClick={() => setPayments((ps) => [...ps, { paymentMethodId: methods[0]?.id ?? 0, amount: "", referenceNo: "", confirmed: false }])}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Split payment
              </Button>
            </div>

            <ul className="space-y-2.5">
              {payments.map((p, i) => {
                const method = methodById.get(p.paymentMethodId);
                const MethodIcon = method?.kind === "cash" ? Banknote : CreditCard;
                const amountInvalid = p.amount !== "" && !AMOUNT_VALID.test(p.amount);
                return (
                  <li key={i} className={cx("space-y-2 rounded-lg border p-3 transition-colors", p.confirmed ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-slate-50/50")}>
                    <div className="flex gap-2">
                      <div className="relative w-2/5 shrink-0">
                        <MethodIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <select value={p.paymentMethodId} onChange={(e) => updatePayment(i, { paymentMethodId: Number(e.target.value) })} className={cx(compactInput, "w-full pl-8")} aria-label={`Payment ${i + 1} method`}>
                          {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      <div className="relative flex-1">
                        <input
                          inputMode="decimal"
                          placeholder="0.00"
                          value={p.amount}
                          onChange={(e) => updatePayment(i, { amount: e.target.value })}
                          aria-invalid={amountInvalid || undefined}
                          className={cx(compactInput, "tabular w-full pr-14 text-right font-semibold")}
                          aria-label={`Payment ${i + 1} amount`}
                        />
                        <button
                          type="button"
                          onClick={() => updatePayment(i, { amount: fmt(grandTotal.sub(paid.sub(new Decimal(/^\d+(\.\d{1,2})?$/.test(p.amount) ? p.amount : 0)))) })}
                          className="absolute top-1/2 right-1 -translate-y-1/2 rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-200"
                        >
                          Exact
                        </button>
                      </div>
                      {payments.length > 1 && (
                        <button type="button" onClick={() => setPayments((ps) => ps.filter((_, j) => j !== i))} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove payment ${i + 1}`}>
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    {amountInvalid && <p className="text-xs text-red-600">Enter an amount like 12 or 12.50</p>}
                    <div className="flex gap-2">
                      <input placeholder="Reference no. (optional)" value={p.referenceNo} onChange={(e) => updatePayment(i, { referenceNo: e.target.value })} className={cx(compactInput, "min-w-0 flex-1")} aria-label={`Payment ${i + 1} reference`} />
                      <label className={cx("flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors select-none", p.confirmed ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")}>
                        <input type="checkbox" checked={p.confirmed} onChange={(e) => updatePayment(i, { confirmed: e.target.checked })} className="sr-only" />
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        Received
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>

            {unconfirmedNonCash && (
              <Notice tone="warning">Mark non-cash payments as received once the terminal or transfer confirms.</Notice>
            )}

            <dl className="space-y-1.5 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>Paid</dt>
                <dd className="tabular font-medium text-slate-900">{fmt(paid)}</dd>
              </div>
              <div className={cx("flex items-baseline justify-between rounded-lg px-3 py-2", change.isNegative() ? "bg-amber-50 text-amber-900" : cart.length > 0 ? "bg-emerald-50 text-emerald-900" : "bg-slate-50 text-slate-600")}>
                <dt className="font-medium">{change.isNegative() ? "Still to pay" : "Change"}</dt>
                <dd className="tabular text-2xl font-semibold tracking-tight text-slate-900">{fmt(change.isNegative() ? remaining : change.abs())}</dd>
              </div>
            </dl>

            <FormMessage error={error} />

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                size="lg"
                loading={pending && lastAction === "complete"}
                disabled={pending || cart.length === 0}
                className="flex-1"
                onClick={() => {
                  setLastAction("complete");
                  run(() => completeSaleAction(cartPayload, payments.map((p) => ({ paymentMethodId: p.paymentMethodId, amount: p.amount, referenceNo: p.referenceNo, confirmed: p.confirmed }))));
                }}
              >
                {pending && lastAction === "complete" ? "Saving…" : "Pay & complete"}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="secondary"
                loading={pending && lastAction === "hold"}
                disabled={pending || cart.length === 0}
                onClick={() => {
                  setLastAction("hold");
                  run(() => holdSaleAction(cartPayload));
                }}
              >
                {!(pending && lastAction === "hold") && <PauseCircle className="size-4" aria-hidden="true" />}
                Hold
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">Hold saves the cart without taking stock. Stock is taken when the sale is completed, from the batch that expires first.</p>
          </div>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmClear}
        destructive
        title="Clear the current sale?"
        description="All items will be removed from the cart. Payments and customer details stay as entered."
        confirmLabel="Clear cart"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setCart([]);
          setConfirmClear(false);
          searchRef.current?.focus();
        }}
      />
    </div>
  );
}
