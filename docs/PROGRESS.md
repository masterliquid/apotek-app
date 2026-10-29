# Progress & next steps (updated 2026-10-29)

## Done
- Phase 1 audit + Phase 2 proposal + decisions: `../_audit/PHASE1_AUDIT_AND_PHASE2_PROPOSAL.md` (§9 decisions, §10 design)
- Phase 3 mapping: `docs/PHASE3_MIGRATION_MAPPING.md`
- Phase 4 foundation: schema (35 tables) + RLS migration, auth (argon2id, legacy sha1 upgrade, sessions), roles, multi-pharmacy, login / select pharmacy / dashboard / users / platform pharmacies pages, Docker
- Verified: 28/28 tests pass; Docker stack runs on http://localhost:3100; wrong-password login rejected
- **Not verified:** successful login in the browser (owner to confirm with admin from `.env`)

## Phase 5 step 1 — master data & products (done 2026-10-29)
- Service: `src/server/master-data.ts`, `src/server/products.ts`; tests: `tests/products.test.ts` (36/36 tests pass, typecheck/lint/build pass)
- Pages: `/products`, `/products/[id]` (prices, pack units), `/master/[kind]` (suppliers, customers, categories, units, statuses); nav in `src/app/(app)/layout.tsx`
- Creating a product needs `products.edit_prices` (admin/owner); pharmacist edits non-price fields and pack units
- **Not verified in the browser** (could not log in as admin from the agent); Docker image not rebuilt yet — run `docker-compose up -d --build app`
- Not built: editing product name/category/status in the UI (service `updateProductDetails` exists), adjustment-reasons page link in nav

## Phase 5 step 2 — goods receipt with batch/expiry (done 2026-10-29)
- Service: `src/server/purchasing.ts` (PO, lines, `receiveGoods`), `src/server/counters.ts` (gap-free daily numbers, Jakarta time), `resolveUnitFactor` in `products.ts`; tests: `tests/purchasing.test.ts` (45/45 pass, lint/build clean)
- Pages: `/purchasing` (list + new PO), `/purchasing/[id]` (add/remove lines, receive goods form); needs `purchasing.manage`
- Rules implemented: one receipt per PO (PO closed first, so concurrent receipts impossible); batch no. + expiry required, expired batches refused; same batch no. adds to batch (different expiry refused); stock in base units via pack factor; stock ledger row per line; base cost only goes up (compared on pre-discount invoice price per base unit), batch unit cost = net of discount; whole receipt rolls back if any line is invalid
- **Not verified in the browser**; Docker image not rebuilt
- Not built: purchase returns, PO cancel, viewing past receipts, receiving without a PO

## Phase 5 step 3 — POS (done 2026-10-29)
- Service: `src/server/sales.ts` (`holdSale`, `commitSale`, `voidPendingSale`, `listSales`, `getSale`); tests: `tests/sales.test.ts` (57/57 tests pass, incl. two cashiers selling the last unit)
- Pages: `/pos` (barcode/search, cart, units, discount, split payments), `/sales` (list, resume pending, void), `/sales/[id]` (receipt view)
- Rules: prices from the DB only (browser sends no price); FEFO with row locks, expired batches never sold, no-expiry (legacy) stock last; sale commits only when every payment is confirmed and covers the total (non-cash can't overpay, cash gives change); receipt no. `ddmmyyyy`+3 digits per day (Jakarta time), no gaps after failed sales; allocations keep cost at sale
- **Verified in the browser** (Docker): login, barcode add, pack unit + 10% discount, complete sale → receipt 29102026001, stock 50→30
- Fixed: `getSession` now calls `connection()` (Next 16 "new Date() while prerendering" made /users hang)
- Demo pharmacy `DEMO` (user `demo`, deactivated) exists in the local Docker DB with 1 product and 1 sale; harmless, can be ignored
- Not built: batch override at POS, discount limits per role, customer picker (free-text name like legacy), sales returns, receipt printing

## Phase 5 step 4 — returns (done 2026-10-29)
- Service: `src/server/returns.ts` (`createSalesReturn`, `createPurchaseReturn`, returnable-line queries); tests: `tests/returns.test.ts` (67/67 tests pass)
- Pages: `/returns` (find by receipt no., return form, recent returns; needs `sales.return`), `/purchase-returns` (pick a goods receipt, return form; needs `purchasing.manage`)
- Rules: a return is its own document (SR-/PR- numbers); the original sale/receipt is never changed; goods go back to the same batches (oldest allocation first); cannot return more than sold/received, cumulatively; sale row is locked so simultaneous returns can't both pass; refunds are cumulative-rounded so partial returns add up exactly to the line total; purchase return can't take more than the batch still holds (already-sold goods)
- **Verified in the browser** (Docker): receipt 29102026001, return 1 of 2 strips → refund 1800.00, stock 30→40, original receipt unchanged
- Not built: refund payment tracking (cash paid back is not recorded as a payment), returned goods always go back to sellable stock (no "damaged/expired" disposition), purchase-return credit note / payable adjustment

## Phase 5 step 5 — stock adjustment & opname (done 2026-10-29)
- Service: `src/server/inventory.ts`; tests: `tests/inventory.test.ts` (76/76 tests pass)
- Pages: `/inventory/adjustments`, `/inventory/opname`, `/inventory/opname/[id]` (needs `inventory.adjust`; Commit needs `inventory.commit_opname` = admin/owner)
- Rules: adjustments are signed per batch, never below zero, ledger row each; opname counts per batch, difference = counted − system (system re-read when counts are saved) is applied to the CURRENT stock on commit (sales made while counting are kept; legacy overwrote stock); commit is all-or-nothing (if a batch would go negative → "recount"), once only (row lock), valued at batch unit cost
- **Verified in the browser** (Docker): create opname, add product, count 37 vs system 40, Save counts, Commit → stock 37, ledger `stock_opname −3`, value −300.00
- Not built: counting a product that has no batch yet (needs a first goods receipt), opname PDF/print, per-category opname

## Phase 5 step 6 — debts & reports (done 2026-10-29)
- Services: `src/server/debts.ts`, `src/server/reports.ts`, `src/server/dates.ts`; tests: `tests/debts-reports.test.ts` (85/85 tests pass)
- Pages: `/debts/payables`, `/debts/receivables` (view `debts.view`, edit `debts.manage`); `/reports` index + `/reports/sales`, `/profit`, `/stock`, `/expiry`, `/prices` (browser Print / save as PDF button; permissions per report)
- Rules: payments never exceed what is owed (atomic, also for simultaneous payments); sales dated by completion time in Jakarta (a later return no longer moves the sale to another day, unlike legacy); profit uses cost at time of sale and subtracts returns (revenue and returned cost) on the return's day; sales report shows money kept per payment method (change taken out of cash); cashiers only see their own sales in the sales report
- **Verified in the browser** (Docker): profit report 1800 revenue / 1000 cost / 800 profit after a return; sales report gross 3600, returns 1800, net 1800; payable 500000, over-payment refused, partial payment 200000 → 300000 outstanding
- Not built / limits: legacy "order suggestion" report (no reorder level exists in the data, so it can't be derived; needs a decision), stock losses from adjustments/opname are not in the profit report, debts are not linked to purchase/sales documents (legacy parity), no payment history per debt, server-generated PDFs (use browser print-to-PDF)

## Phase 5 step 7 — printing (done 2026-10-29)
- Code: `src/server/printing/receipt.ts` (one layout → ESC/POS bytes, plain text, browser page), `src/server/printing/worker.ts` (queue worker, retries, stuck-job recovery), `src/server/printers.ts`, `src/worker/main.ts` (bundled by esbuild to `dist/print-worker.mjs`, `print-worker` service in compose), `src/lib/printing.ts` (per-device default printer cookie); migration `0002_print_job_claimed_at`; tests: `tests/printing.test.ts` (97/97 tests pass)
- Pages: `/settings/printers` (add printer, use on this device, test print, job list + retry), `/settings/pharmacy` (name, address, phone, receipt header/footer, buy-price markup %, expiry warning days), `/sales/[id]/receipt` (browser print, 58/80 mm); sale page has "Print on this device's printer" and "Browser print"
- Rules: the receipt is queued in the SAME transaction as the sale but only writes a row, so printer problems can't undo a sale; receipts print the sale's own time/number/totals from the database (legacy used browser form values, guessed receipt number and print-time date); 3 attempts then failed + manual Retry; job claimed with SKIP LOCKED, stuck jobs recovered after 2 min; a pharmacy's jobs only go to its own printers; store name/address/footer are settings (legacy hard-coded them)
- **Verified in the browser + Docker**: added a network printer, test print and a POS sale both arrived (as ESC/POS bytes: starts `1b 40`, ends cut `1d 56 42 03`, 32 columns) at a fake TCP printer on this Mac; jobs show Done; browser receipt page renders
- **NOT verified: any real printer** (thermal or normal), real CUPS `lp` printing, Windows (OS-printer-by-name is explicitly unsupported on Windows; use network printer or browser print), cash drawer, Indonesian characters beyond ASCII (accents stripped, other characters print as `?`), bitmap logo/QR on receipts

## UI redesign (v0 design applied, 2026-10-29)
- Source: `~/Documents/pharmacy-pos-ui-design` (v0 output: shell, UI primitives, confirm dialog, POS). Brief: `docs/UI_BRIEF_FOR_V0.md`.
- Ported: `src/components/ui.tsx` (v0 primitives + `PageHeader`, `Stat`, `buttonClass`; same exports/props, so every page picked up the new look), `confirm-dialog.tsx`, `pos-client.tsx` (same props/actions; cart row uses container queries `@2xl:` because the cart column is narrower than the screen), `app-shell.tsx` (sidebar on desktop, drawer on phone, role-filtered menu from `nav-config.ts`, user + role badge + logout), global CSS (tables, row actions, focus, print), new login page, **real dashboard** (`src/server/dashboard.ts`: today's net/sales/pending, 7-day chart, payables/receivables, expiry and out-of-stock alerts, quick actions; role-limited), status badges in the main lists, sale detail page with buttons.
- Deliberately NOT taken from v0: Google Fonts (must work offline), `ignoreBuildErrors`, shadcn/base-ui/analytics deps, preview stubs. Added dependency: `lucide-react` only.
- Verified (browser + Docker): login, dashboard (matches reports), POS scan → pay → receipt, sales list badges, printer job failed state + Retry (sale still completed with the printer unreachable), phone layout of dashboard and POS. 98 tests, type-check, lint, build pass.
- Not done / ideas: UI text is English (a Bahasa Indonesia dictionary was in the brief but v0 produced English), no dark mode, POS has no sticky bottom total bar on phones (it stacks), "low stock" needs a minimum-stock field, not every list page was individually redesigned (they inherit the new look from shared components + CSS).

## Sample data (2026-10-29)
- `src/seed/sample-data.ts` (58 products, 5 suppliers, 8 customers; prices from online pharmacy listings where found, else estimates), `src/seed/sample.ts` (goes through the real services: products, pack units, PO + goods receipt per supplier → batches, ledger), `src/seed/main.ts` → `dist/seed-sample.mjs`; `createPharmacyForExistingUser` in `pharmacies.ts`; tests: `tests/seed-sample.test.ts` (100/100 pass).
- Seeded into the local Docker DB as pharmacy `SAMPLE` ("Apotek Contoh Sehat"), owner = the admin user, so log in as admin → it opens directly. List: `docs/SAMPLE_DATA.md`.
- Verified in the browser: pharmacy picker, dashboard (16 batches expiring within 90 days), POS search. Temporary demo access to SAMPLE was removed afterwards.

## Round of fixes + legacy import (2026-10-29, later)
**Forms (all of them).** React 19 cleared every `<form action>` after the action finished, even on errors, so typed values vanished. New `src/components/form.tsx`: `ActionForm` calls the action from `onSubmit` (no auto-reset; clears only after success), `Field`/`SelectField` show the server's error under the right input (`fieldErrors` keyed by input `name`), `FormFeedback`, `SubmitButton`. Helpers in `src/lib/form.ts` (`zodErrors`, `fieldError`). All actions return per-field errors; fields got placeholders and hints (password: "At least 8 characters"). POS keeps its own client state.
**Purchase orders: partial receiving.** Migration `0003_partial_receiving`: PO status adds `partial` and `closed`; one PO can have many deliveries (dropped `goods_receipts_po_uq`); `goods_receipts.receipt_no` (GR-yyyymmdd-nnn); `goods_receipt_lines.purchase_order_line_id`. `src/server/purchasing.ts`: order row locked (`FOR UPDATE`) so simultaneous deliveries can't exceed the order; over-receipt refused with "X ordered, Y received, only Z can still be received"; extra items not on the order allowed (recorded as such); status derived: open → partial → received; `closePurchaseOrder` (supplier won't send the rest), `cancelPurchaseOrder` (nothing received), `setPurchaseOrderLineQty` (never below received), lines with deliveries can't be removed. Pages `/purchasing` (tabs To receive / Completed / All, progress bars) and `/purchasing/[id]` (steps, ordered / received / still to come, receive form prefilled with the remainder + "add another batch", delivery history). Verified in the browser: ordered 1000, received 500 → Partially received, 500 still to come; received the other 500 → Received, 2 deliveries.
**Bug found by real data:** `listProducts` capped at 500 rows, so POS and pickers only saw 500 of 2,413 products. Fixed with `ALL_PRODUCTS` for POS / PO picker / opname picker / price list; list pages say when they are cut off. (Scaling note: the POS loads the whole catalogue into the browser; fine for a few thousand products, would need server-side search for tens of thousands.)
**Legacy import** (`src/import/mysql-dump.ts` parser, `legacy-import.ts`, `main.ts` → `dist/import-legacy.mjs`; tests `tests/legacy-import.test.ts` on `tests/fixtures/legacy-sample.sql` = the 2015 dump without the login row). Run on `sqldump_20190911.sql` (phpMyAdmin 3.4.5, MySQL 5.5, 218,231 rows): imported into the existing pharmacy `TEST` ("test", owner `owner`) in 12 s: 2,413 products, 31,148 sales (31,142 completed, total Rp 2,407,556,585.95 = legacy), 105,229 sale lines, 696 returns, 6,344 POs, 6,348 deliveries, 177 stock opnames. Stock 28,668 units = legacy. Reconciliation is built in and aborts on mismatch.
Assumptions and what was changed from the legacy data (all counted in the importer's report):
- One `LEGACY` batch per product (no expiry) holds the legacy stock; **71 products with negative stock were imported as 0** (count them in the first stock opname).
- Patch v1.8 had reduced the ORIGINAL sale line when a return was made (644 lines were 0). Returns on/after `IMPORT_RESTORE_RETURNS_FROM` (default 2017-04-01) and every return on a line with quantity 0 were added back: **472 sales restored**; returns are separate documents. The 2017-04-01 cut-off is an assumption (the real deployment date of v1.8 is unknown).
- Sale dates: the day the sale was created, or the legacy "last updated" day when no return touched it.
- Cost at sale = the product's current base cost (the legacy app never stored it), so historical profit is approximate.
- Payments: one cash payment = legacy `BAYAR` (275 sales were paid less than the total).
- 19% of PO/delivery lines use a unit different from the product's base unit; they are imported with factor 1 (history only, stock unaffected).
- Skipped (reported): 2 sale lines with quantity 0, 6 PO lines and 7 delivery lines with quantity 0, 2 purchase returns without a delivery line; 4 returns reduced to what was left; 15 duplicate opname lines (last kept); 1 product margin clamped to 999.99%.
- Legacy login (`t2_karyawan`) is NOT imported (its `admin` would clash with the platform admin). Legacy POs with a delivery are `received` (all ordered quantity delivered) or `closed` (short); POs without delivery are `open`.
- Lesson: an earlier import created a second pharmacy by mistake (the user's own pharmacy "test" already existed). It was removed (guarded transaction), and the importer now has `IMPORT_INTO_EXISTING=1`.
- Not built: importing legacy users, per-product unit conversion for imported history, a re-run/"replace" mode (an imported pharmacy must be emptied by hand).

## Resume
```bash
colima start apotek
cd ~/Downloads/Apotek/apotek-app && DOCKER_CONTEXT=colima-apotek docker-compose up -d
DOCKER_CONTEXT=colima-apotek pnpm test
```

## Next (Phase 5, in order)
1. ~~Master data screens~~ done
2. ~~Goods receipt with batch/expiry (+ PO) → stock ledger~~ done
3. ~~POS~~ done
4. ~~Sales returns, purchase returns~~ done
5. ~~Stock adjustment, stock opname~~ done
6. ~~Payables/receivables, reports~~ done (order suggestion needs a decision: reorder level per product?)
7. ~~Printing~~ done (needs a test on the real printer)
8. Legacy import tool (needs the real MySQL backup — not found yet; the 14 GB `Downloads/test/Downloads.zip` is NOT it)

## Open questions
- Real legacy DB backup location
- Imported legacy users: role admin or owner?
- Timezone for legacy DATE values (assumed Asia/Jakarta)
