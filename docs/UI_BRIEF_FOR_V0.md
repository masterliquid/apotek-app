# UI redesign brief — Apotek (for Vercel v0)

How to use: paste **Part A** into v0 as the prompt. Attach `src/components/ui.tsx`, `src/app/globals.css` and, for the POS, `src/app/(app)/pos/pos-client.tsx` as reference. Give v0's output back to Claude (the developer of the backend) to wire in — **Part B** is the contract that keeps the app working.

---

## Part A — Prompt to paste into v0

Redesign the UI of **Apotek**, a multi-pharmacy point-of-sale and inventory web app for small Indonesian pharmacies (apotek). Make it modern, calm, trustworthy and fast to use all day. Built with **Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4**. Currently it is a plain functional UI (white cards, a long horizontal menu); I want a polished, professional product.

**Users and devices**
- Cashiers (speed, large touch targets, barcode scanner + keyboard), pharmacists, admins, owners.
- Used on a shop PC (mouse/keyboard/scanner), tablets, and phones. **Mobile-first and fully responsive**; the POS must be usable one-handed on a phone.
- Runs locally and may be **offline**: no CDN, no Google Fonts, no remote images. System font stack (or self-hosted font), inline SVG / `lucide-react` icons only.
- Prints receipts and reports: keep print styles (`print:hidden` for chrome).

**Design direction**
- Clean medical-retail feel: calm green/teal as brand (current accent is emerald), neutral slate surfaces, generous spacing, clear hierarchy, soft borders/shadows, rounded-lg.
- Light and dark mode (follow system). Accessible: WCAG AA contrast, visible focus, labels on every input, keyboard friendly, `aria-live` for form messages.
- Numbers are money: right-aligned, `tabular-nums`, Indonesian format (`Rp 3.600`, `1.234,50`). Status badges (pending / completed / void / expired / low) with colour **and** text.
- Empty states with a short hint and a primary action; skeleton loaders (the pages stream in behind `<Suspense>`); inline error and success messages.
- UI language: **Bahasa Indonesia**. Put all text in one dictionary file (`src/lib/i18n/id.ts`) so it can be changed later.

**App shell**
- Replace the horizontal menu (about 25 links) with a **left sidebar on desktop and a drawer/bottom bar on mobile**, grouped: *Penjualan* (POS, Penjualan, Retur) · *Stok* (Produk, Penyesuaian, Stok opname, Kedaluwarsa) · *Pembelian* (PO & penerimaan, Retur pembelian, Supplier) · *Keuangan* (Hutang, Piutang, Laporan) · *Data* (Pelanggan, Kategori, Satuan, Status) · *Pengaturan* (Printer, Apotek, Pengguna).
- Items are shown only when allowed (the app passes the visible list). Header: pharmacy name (with switcher if the user has several), user name + role badge, logout, global search for products.
- Show an "offline / printer problem" indicator slot in the header.

**Screens to design** (all exist; keep their data and actions)
1. **Login**; **Select pharmacy** (cards); **Platform admin → pharmacies** (create pharmacy + owner form, list).
2. **Dashboard** (currently a placeholder): today's sales total and count, net after returns, pending sales, items low / expiring soon, payables and receivables outstanding, last 7 days sales chart, quick actions (New sale, Receive goods, Stock count). Use realistic sample data; the developer will wire it.
3. **POS (most important)**: barcode/search field always focused; results dropdown (name, code, price, stock); cart lines with unit select (base unit or pack, e.g. Strip ×10), quantity stepper, discount %, line total, remove; sticky total panel; payment rows (method select, amount, reference, "Diterima/Received" checkbox, "Pas/Exact" button, add split payment), change / still-to-pay, **Bayar & selesai** and **Tahan (Hold)** buttons. Desktop: two columns. Phone: cart list + sticky bottom total bar that opens a payment sheet. Large, clear total.
4. **Sales list** (filters, status badges, resume pending, void) and **sale detail / receipt** (lines, payments, change, buttons: print to device printer, browser print, return).
5. **Sales returns**: find by receipt number → lines with "returned so far / max returnable" and quantity inputs + reason; recent returns table. **Purchase returns**: pick goods receipt → same form.
6. **Products**: searchable table with stock, base cost, recommended and selling price (cost columns hidden for cashiers), add-product form, **product detail** (prices form, pack units list + add form). **Master data** pages (suppliers, customers: name/phone/address; categories, units, statuses: name) with add form and activate/deactivate.
7. **Purchasing**: PO list + new PO; PO detail (items, add item, **Receive goods** form: per line received qty, invoice price, discount %, batch no., expiry date, plus supplier invoice number).
8. **Inventory**: stock adjustments (batch select, reason, +/- quantity, note, history); **stock opname** list and counting sheet (system vs counted per batch, difference value, Save counts / Commit with confirm dialog; committed view read-only).
9. **Debts**: payables / receivables — total outstanding, add record, table with inline "pay" field.
10. **Reports**: index cards; sales (date range, KPI row, per-method totals, table), profit (per day table + totals), stock (valued stock), expiry (expired rows in red), price list. All printable.
11. **Settings**: printers (add form with conditional fields for network vs OS printer, list with "this device" badge, test print, job history with retry), pharmacy settings (name, address, receipt header/footer, markup %, expiry warning days), users (add user, role, activate/deactivate).
12. **Receipt print page**: monospace receipt preview in a 58 mm / 80 mm paper frame (keep it plain, black on white).

**Deliverables**
- Reusable primitives (Button, Input/Field, Select, Card, Badge, DataTable, EmptyState, Stat, PageHeader, FormMessage, Dialog, Toast) in `src/components/ui/`, plus the shell (Sidebar, Topbar, MobileNav).
- Each screen as a presentational component taking typed props / sample data. **Do not** add data fetching, an ORM, auth or API routes.
- Minimal dependencies: Tailwind, `lucide-react`, optionally shadcn/ui primitives (copied in). No chart library heavier than a small inline-SVG sparkline.

---

## Part B — Technical contract (must survive the redesign)

The backend is finished and tested (97 tests). The redesign must only change markup, classes, layout and copy.

1. **Do not change** anything under `src/server/`, `src/db/`, `src/lib/auth.ts`, `drizzle/`, or any `actions.ts` file.
2. **Form contract:** keep every `<form action={…}>`, and every input's `name`, hidden inputs and button `name`/`value` exactly as they are. Server Actions read `FormData` by these names (e.g. `qty_${lineId}`, `count_${lineId}`, `price_${id}`, `batch_${id}`, `expiry_${id}`, `intent=save|commit`).
3. **Client forms** use React 19 `useActionState(action, {})` returning `{ error?, success? }` — keep that, and keep showing both messages.
4. **POS** (`pos-client.tsx`): keep the props (`products`, `methods`, `initial`), the calls `completeSaleAction(cart, payments)` / `holdSaleAction(cart)`, and that the browser never sends a price (the server prices every line). Enter on the search field adds the exact code match or the first result (barcode scanners type the code and press Enter).
5. **Server Components + Cache Components:** pages read the session, so each page keeps its `<Suspense fallback>` wrapper around the async component. Don't read cookies/session at module level or in layouts outside Suspense. Don't call `new Date()` in server components before dynamic data (build error in Next 16).
6. **Permissions:** the UI hides what a role may not use, but the server enforces it. Cashier: no cost/profit columns, no returns, no purchasing. Roles: owner, admin, pharmacist, cashier.
7. **Routes are fixed:** `/login`, `/select-pharmacy`, `/platform/pharmacies`, `/dashboard`, `/pos`, `/sales`, `/sales/[id]`, `/sales/[id]/receipt`, `/returns`, `/purchase-returns`, `/products`, `/products/[id]`, `/master/[kind]` (suppliers, customers, categories, units, statuses), `/purchasing`, `/purchasing/[id]`, `/inventory/adjustments`, `/inventory/opname`, `/inventory/opname/[id]`, `/debts/[kind]` (payables, receivables), `/reports` + `/reports/{sales,profit,stock,expiry,prices}`, `/settings/printers`, `/settings/pharmacy`, `/users`.
8. **Money** arrives from the server as strings (`"3600.00"`). Format for display only; never compute totals in the UI except the POS preview (already decimal.js; the server recalculates).
9. **Offline:** no external network requests at runtime.
10. Keep it working with the current stack: Tailwind v4 (`@import "tailwindcss"`, tokens via `@theme`), no `tailwind.config.js` required.

**Integration plan:** give the generated components to Claude; they will be wired screen by screen (shell first, then POS, then the rest), re-running the 97 tests, type-check, build, and a browser check after each step.

**Known gaps the new design may expose (backend work to add later):** dashboard summary numbers, global product search endpoint, low-stock threshold (no minimum-stock field exists yet), per-user "default printer" is a browser cookie.
