# Phase 3 — Legacy → New Schema Mapping

Source: reconstructed legacy app (v1.5 + patches v1.6–v1.8) and `apotek.sql` (MySQL 5.5). Target: `src/db/schema.ts`.
Decisions referenced: `_audit/PHASE1_AUDIT_AND_PHASE2_PROPOSAL.md` §9–§10.

**Status:** schema implemented as migrations; the **import tool is not built yet** (Phase 5, needs the real backup to validate against). Real production data has **not** been seen — only the 2015 sample dump.

## 1. Global rules

| Legacy | New | Note |
|---|---|---|
| One database = one pharmacy | `pharmacy_id` on every pharmacy-owned row | Legacy data imports into **one** pharmacy (owner decision: legacy data → first member) |
| `*_PK__` int | `id` bigint identity + `legacy_id` int | `legacy_id` kept for traceability and re-runs |
| `*_BUAT_OLEH__` / `*_UPD_OLEH__` (username text) | `created_by` / `updated_by` → `users.id` | Matched by username; unmatched → NULL (reported) |
| `*_TGL_BUAT__` / `*_TGL_UPD__` (DATE) | `created_at` / `updated_at` (timestamptz) | Imported as 00:00 Asia/Jakarta [A: timezone to confirm] |
| `DECIMAL(15,2)` | `NUMERIC(15,2)` | Lossless |
| Stock in `t2_barang.BARANG_JUMLAH_STOCK__` | `product_batches.qty_on_hand` + `stock_movements` | Imported as one `LEGACY` batch per product + `opening_balance` movement |

## 2. Table mapping

| Legacy table | New table(s) | Column notes |
|---|---|---|
| `t1_kategori` | `categories` | name |
| `t1_satuan` | `units` | name |
| `t1_status` | `product_statuses` | name |
| `t1_penyesuaian_status` | `adjustment_reasons` | name |
| `t1_role` | — (replaced by `membership_role` enum) | Legacy had only role 1 = Administrator → imported users get **admin** [A: confirm, or owner] |
| `t1_flag` | — (replaced by `status` enums) | 1 Pending → `pending`, 2 Commit → `committed` |
| `t1_supplier` | `suppliers` | NO_TELP → phone, ALAMAT → address |
| `t2_costumer` | `customers` | same |
| `t2_karyawan` | `users` + `memberships` | USERNAME (lowercased) → username; PASSWORD/SALT → `legacy_password_sha1/salt` (upgraded to Argon2id on first login); NAMA → full_name; NO_TELP, ALAMAT, JABATAN **not migrated** [?] keep? |
| `t2_barang` | `products` | KODE → code; NAMA → name; NILAI_ASLI → base_cost; HARGA_BELI → buy_price; MARGIN → margin_pct; HARGA_JUAL_REKOMENDASI → recommended_price; HARGA_JUAL_SEBENARNYA → sell_price; SATUAN → base_unit_id; JUMLAH_KECIL → see §3; JUMLAH_STOCK → `LEGACY` batch |
| `t3_penjualan` | `sales` | NO_STRUK → receipt_no; CST_NM → customer_name; BAYAR → paid_total + one `sale_payments` row (method **Tunai**, status paid); GRAND_TOTAL → grand_total; KET → note; committed_at ← see §4 |
| `t3_penjualan_item` | `sale_lines` + `sale_line_allocations` | Original sold qty = current qty + Σ returns (v1.8 rewrote it, §4); allocation → `LEGACY` batch, unit_cost = product base_cost at import [A: legacy never stored historical cost] |
| `t3_retur_penjualan` | `sales_returns` + `sales_return_lines` | One return document per legacy row; refund = price after discount × qty |
| `t3_purchase_order` | `purchase_orders` | NOMOR → po_no; status = `received` if a `t3_purchase_units` row exists, else `open` |
| `t3_purchase_order_item` | `purchase_order_lines` | SATUAN → unit_id; factor from §3 |
| `t3_purchase_units` | `goods_receipts` | NO_FAKTUR → supplier_invoice_no |
| `t3_purchase_units_item` | `goods_receipt_lines` | batch → `LEGACY` batch of that product (no batch/expiry in legacy) |
| `t3_retur_purchase` | `purchase_returns` + `purchase_return_lines` | one document per legacy row |
| `t3_penyesuaian_item` | `stock_adjustments` | signed qty preserved; batch → `LEGACY` |
| `t3_stock_opname` | `stock_opnames` | KODE → opname_no; flag → status |
| `t3_stock_opname_item` | `stock_opname_lines` | JML_SISTEM / JML_FISIK / HARGA / TOTAL_SELISIH preserved |
| `t3_hutang` | `payables` | JUMLAH → amount; DIBAYAR (nullable) → paid_amount (NULL → 0) |
| `t3_piutang` | `receivables` | same |
| — | `payment_methods`, `sale_payments` | new (status-only payments) |
| — | `product_units`, `product_batches`, `stock_movements`, `document_counters` | new |
| — | `printers`, `print_jobs` | new (replaces hard-coded `printerName`) |
| — | `pharmacies`, `memberships`, `sessions` | new (multi-pharmacy, auth) |

## 3. Units

Legacy stock math never converted units (receiving 1 box added 1). The import therefore **cannot know** for sure which unit each stock number is in.

- Base unit = `t2_barang.SATUAN_PK__`.
- `BARANG_JUMLAH_KECIL__` (if > 1) is offered as a candidate pack factor, **not applied automatically**.
- PO / receipt lines with a unit different from the product's unit are listed in the import report for manual review.

## 4. Known legacy data defects the importer must handle

| Defect (Phase 1 §6) | Import handling |
|---|---|
| v1.8 returns reduced `ITM_JUAL_JUMLAH__` / `ITM_JUAL_TOTAL__` and the sale grand total | Rebuild original line: qty = qty + Σ returned; recompute line and grand totals; flag mismatches with BAYAR |
| `PENJUALAN_TGL_UPD__` overwritten by later edits/returns | committed_at = TGL_UPD, but if any return exists for the sale, fall back to TGL_BUAT and flag |
| Negative stock possible | Negative product stock is **reported and blocked** (new schema forbids it); owner decides correction before import |
| Duplicate / colliding receipt numbers | Unique per pharmacy; duplicates reported, suffix `-DUPn` [A] |
| Deletes that did not reverse stock | Not reconstructable; current stock is taken as truth (opening balance) |
| Sale lines referencing deleted products | Reported; import stops for that sale |

## 5. Import tool design (to build in Phase 5)

1. Read-only connection to a **restored copy** of the legacy MySQL DB (never the original).
2. `--dry-run` (default): schema check against expected legacy columns, data-quality report, no writes.
3. Real run: one transaction into a **new, empty** pharmacy; aborts entirely on any error.
4. Reconciliation report: per table row counts, Σ stock, Σ sales grand total, Σ payables/receivables — legacy vs new.
5. Destructive operations: none on legacy. On the new DB, re-running requires deleting that pharmacy's imported data — the tool will refuse unless the target pharmacy is empty.

## 6. Acceptance criteria for the import

- Row counts match per table (minus explicitly reported rejects).
- Σ product stock (legacy) = Σ `LEGACY` batch qty (new).
- Σ committed sales grand total (rebuilt originals) − Σ returns = Σ legacy current grand total, per day.
- Every imported user can log in with their old password once and is upgraded to Argon2id.
