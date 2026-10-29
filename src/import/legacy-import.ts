import Decimal from "decimal.js";
import type { Client } from "pg";
import type { DumpRow, ParsedDump } from "./mysql-dump";

// Imports the legacy MySQL data (one pharmacy) into a NEW pharmacy of this app. Rules follow docs/PHASE3_MIGRATION_MAPPING.md.
// Everything is written in one transaction: if anything fails, nothing is imported. Legacy data is only read.

export type ImportOptions = {
  pharmacyCode: string;
  pharmacyName: string;
  owner: { username: string; fullName: string; passwordHash: string | null }; // null = dry run
  // Sales returns made on or after this date reduced the ORIGINAL sale line in the legacy app (patch v1.8). They are
  // restored here, because in the new system a return never changes the sale. Items whose quantity was reduced to 0
  // are always restored.
  restoreReturnsFrom: string;
  dryRun: boolean;
  // Fill a pharmacy that already exists (it must have no products, sales or orders yet). Lookups with the same name
  // (units, categories, payment methods …) are reused instead of duplicated.
  existingPharmacy?: boolean;
};

export type ImportReport = { counts: Record<string, number>; notes: string[]; reconciliation: string[] };

type Cell = string | number | null;
type Table = { columns: string[]; rows: Cell[][] };

const ISSUE_SAMPLE = 3;
const zero = new Decimal(0);
const money = (v: Decimal.Value | null | undefined) => new Decimal(v ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
const dec = (v: string | null | undefined) => (v == null || v === "" || Number.isNaN(Number(v)) ? zero : new Decimal(v));
const validDate = (v: string | null | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !v.startsWith("0000");
// Legacy dates have no time. Noon in Jakarta keeps every record on its own calendar day in any timezone.
const noon = (v: string | null | undefined, fallback: string) => `${validDate(v) ? v : fallback}T12:00:00+07:00`;

class Notes {
  readonly lines: string[] = [];
  private seen = new Map<string, number>();
  add(key: string, message: string) {
    const n = (this.seen.get(key) ?? 0) + 1;
    this.seen.set(key, n);
    if (n <= ISSUE_SAMPLE) this.lines.push(message);
  }
  total(key: string) {
    return this.seen.get(key) ?? 0;
  }
  summary(labels: Record<string, string>) {
    return Object.entries(labels).filter(([k]) => this.total(k) > 0).map(([k, label]) => `${this.total(k)} × ${label}`);
  }
}

class Ids {
  private next: number;
  readonly map = new Map<string, number>();
  constructor(base: number) {
    this.next = base;
  }
  assign(legacyKey: string): number {
    const id = this.next++;
    this.map.set(legacyKey, id);
    return id;
  }
  take(): number {
    return this.next++;
  }
  link(legacyKey: string, id: number) {
    this.map.set(legacyKey, id);
  }
  get(legacyKey: string | null | undefined): number | undefined {
    return legacyKey == null ? undefined : this.map.get(legacyKey);
  }
}

const TABLES = [
  "categories", "units", "product_statuses", "adjustment_reasons", "suppliers", "customers", "payment_methods", "products", "product_batches", "stock_movements",
  "sales", "sale_lines", "sale_line_allocations", "sale_payments", "sales_returns", "sales_return_lines", "payables", "receivables", "purchase_orders",
  "purchase_order_lines", "goods_receipts", "goods_receipt_lines", "purchase_returns", "purchase_return_lines", "stock_adjustments", "stock_opnames", "stock_opname_lines",
] as const;

async function baseIds(client: Client): Promise<Record<string, number>> {
  const bases: Record<string, number> = {};
  for (const t of TABLES) bases[t] = Number((await client.query(`select coalesce(max(id), 0) + 1 as n from "${t}"`)).rows[0].n);
  return bases;
}

async function bulkInsert(client: Client, table: string, { columns, rows }: Table) {
  if (rows.length === 0) return;
  const perRow = columns.length;
  const maxRows = Math.floor(60000 / perRow);
  const names = columns.map((c) => `"${c}"`).join(", ");
  for (let i = 0; i < rows.length; i += maxRows) {
    const slice = rows.slice(i, i + maxRows);
    const placeholders = slice.map((_, r) => `(${columns.map((_c, c) => `$${r * perRow + c + 1}`).join(", ")})`).join(", ");
    await client.query(`insert into "${table}" (${names}) overriding system value values ${placeholders}`, slice.flat());
  }
  // Explicit ids were used, so move the sequence past them.
  await client.query(`select setval(pg_get_serial_sequence('"${table}"', 'id'), (select max(id) from "${table}"))`);
}

export async function importLegacy(client: Client, data: ParsedDump, options: ImportOptions): Promise<ImportReport> {
  const get = (name: string): DumpRow[] => data.get(name) ?? [];
  const notes = new Notes();
  const out = Object.fromEntries(TABLES.map((t) => [t, { columns: [] as string[], rows: [] as Cell[][] }])) as Record<(typeof TABLES)[number], Table>;
  const put = (table: (typeof TABLES)[number], columns: string[], row: Cell[]) => {
    out[table].columns = columns;
    out[table].rows.push(row);
  };

  await client.query("begin");
  try {
    // ---- pharmacy, owner ----------------------------------------------------------------------------------------
    const code = options.pharmacyCode.trim().toUpperCase();
    const found = await client.query("select id, name from pharmacies where code = $1", [code]);
    let pharmacyId = 0;
    let ownerId = 0;
    let ownerNote = "";
    if (options.existingPharmacy) {
      if (!found.rowCount) throw new Error(`There is no pharmacy with code ${code}.`);
      pharmacyId = Number(found.rows[0].id);
      const used = (await client.query("select (select count(*) from products where pharmacy_id = $1) + (select count(*) from sales where pharmacy_id = $1) + (select count(*) from purchase_orders where pharmacy_id = $1) as n", [pharmacyId])).rows[0].n;
      if (Number(used) > 0) throw new Error(`Pharmacy ${code} already has products, sales or orders. Import only into an empty pharmacy; nothing was imported.`);
      const owner = (await client.query("select u.id, u.username from memberships m join users u on u.id = m.user_id where m.pharmacy_id = $1 and m.role = 'owner' and m.is_active order by m.id limit 1", [pharmacyId])).rows[0];
      if (!owner) throw new Error(`Pharmacy ${code} has no owner to attribute the imported records to.`);
      ownerId = Number(owner.id);
      ownerNote = `Imported into the existing pharmacy "${found.rows[0].name}" (${code}); records are attributed to its owner "${owner.username}".`;
    } else {
      if (found.rowCount) throw new Error(`A pharmacy with code ${code} already exists. Nothing was imported.`);
      if (!options.dryRun) {
        pharmacyId = Number((await client.query("insert into pharmacies (code, name) values ($1, $2) returning id", [code, options.pharmacyName.trim()])).rows[0].id);
        const existing = await client.query("select id from users where username = $1", [options.owner.username]);
        if (existing.rowCount) {
          ownerId = Number(existing.rows[0].id);
          ownerNote = `User "${options.owner.username}" already existed; it was made owner of the new pharmacy and its password was left unchanged.`;
        } else {
          ownerId = Number((await client.query("insert into users (username, full_name, password_hash) values ($1, $2, $3) returning id", [options.owner.username, options.owner.fullName, options.owner.passwordHash])).rows[0].id);
          ownerNote = `Created owner user "${options.owner.username}".`;
        }
        await client.query("insert into memberships (user_id, pharmacy_id, role) values ($1, $2, 'owner')", [ownerId, pharmacyId]);
      }
    }

    const bases = options.dryRun ? Object.fromEntries(TABLES.map((t) => [t, 1])) : await baseIds(client);
    const ids = Object.fromEntries(TABLES.map((t) => [t, new Ids(bases[t])])) as Record<(typeof TABLES)[number], Ids>;
    const today = new Date().toISOString().slice(0, 10);
    const createdAt = (r: DumpRow, prefix: string) => noon(r[`${prefix}_TGL_BUAT__`], today);

    // Names that already exist in the target pharmacy (only when filling an existing one).
    type Reusable = Record<"categories" | "units" | "product_statuses" | "adjustment_reasons" | "payment_methods", Map<string, number>>;
    const reusable: Reusable = { categories: new Map(), units: new Map(), product_statuses: new Map(), adjustment_reasons: new Map(), payment_methods: new Map() };
    if (options.existingPharmacy) {
      for (const t of Object.keys(reusable) as (keyof Reusable)[]) {
        for (const r of (await client.query(`select id, lower(name) as name from "${t}" where pharmacy_id = $1`, [pharmacyId])).rows) reusable[t].set(r.name as string, Number(r.id));
      }
    }

    // ---- simple lookups ---------------------------------------------------------------------------------------------
    const lookup = (table: "categories" | "units" | "product_statuses" | "adjustment_reasons", rows: DumpRow[], pk: string, nameCol: string, prefix: string) => {
      const used = new Set<string>();
      for (const r of rows) {
        const already = reusable[table].get((r[nameCol] ?? "").trim().toLowerCase());
        if (already !== undefined && !used.has((r[nameCol] ?? "").trim().toLowerCase())) {
          used.add((r[nameCol] ?? "").trim().toLowerCase());
          ids[table].link(r[pk]!, already);
          continue;
        }
        let name = (r[nameCol] ?? "").trim() || `(unnamed ${r[pk]})`;
        while (used.has(name.toLowerCase())) {
          notes.add("renamed", `A duplicate name "${name}" in ${table} was kept as "${name} (${r[pk]})".`);
          name = `${name} (${r[pk]})`;
        }
        used.add(name.toLowerCase());
        put(table, ["id", "pharmacy_id", "name", "legacy_id", "created_at", "created_by"], [ids[table].assign(r[pk]!), pharmacyId, name, Number(r[pk]), createdAt(r, prefix), ownerId || null]);
      }
    };
    lookup("categories", get("t1_kategori"), "KATEGORI_PK__", "KATEGORI_NAMA__", "KATEGORI");
    lookup("units", get("t1_satuan"), "SATUAN_PK__", "SATUAN_NAMA__", "SATUAN");
    lookup("product_statuses", get("t1_status"), "STATUS_PK__", "STATUS_NAMA__", "STATUS");
    lookup("adjustment_reasons", get("t1_penyesuaian_status"), "PENY_ST_PK__", "PENY_ST_NAMA__", "PENY_ST");

    const partner = (table: "suppliers" | "customers", rows: DumpRow[], pk: string, prefix: string) => {
      for (const r of rows) {
        put(table, ["id", "pharmacy_id", "name", "phone", "address", "legacy_id", "created_at", "created_by"], [ids[table].assign(r[pk]!), pharmacyId, (r[`${prefix}_NAMA__`] ?? "").trim() || `(unnamed ${r[pk]})`, r[`${prefix}_NO_TELP__`], r[`${prefix}_ALAMAT__`], Number(r[pk]), createdAt(r, prefix), ownerId || null]);
      }
    };
    partner("suppliers", get("t1_supplier"), "SUPPLIER_PK__", "SUPPLIER");
    partner("customers", get("t2_costumer"), "CST_PK__", "CST");

    // Payment methods are new in this app; imported payments are recorded as cash (Tunai).
    let cashId = reusable.payment_methods.get("tunai") ?? 0;
    for (const [name, kind] of [["Tunai", "cash"], ["Transfer Bank", "non_cash"], ["QRIS", "non_cash"], ["Kartu Debit", "non_cash"]] as const) {
      if (reusable.payment_methods.has(name.toLowerCase())) continue;
      const id = ids.payment_methods.take();
      if (name === "Tunai") cashId = id;
      put("payment_methods", ["id", "pharmacy_id", "name", "kind", "created_by"], [id, pharmacyId, name, kind, ownerId || null]);
    }

    // ---- products + one LEGACY batch each (the legacy app had a single stock number per product) ---------------------
    const productInfo = new Map<string, { id: number; batchId: number; unitId: number; cost: Decimal }>();
    let negativeStock = 0;
    for (const b of get("t2_barang")) {
      const productId = ids.products.assign(b.BARANG_PK__!);
      const batchId = ids.product_batches.take();
      const unitId = ids.units.get(b.SATUAN_PK__)!;
      const cost = Decimal.max(dec(b.BARANG_NILAI_ASLI__), zero);
      let margin = dec(b.BARANG_MARGIN__);
      if (margin.greaterThan(999.99) || margin.isNegative()) {
        notes.add("margin", `Product ${b.BARANG_KODE__}: margin ${margin.toFixed(2)}% does not fit the new column; set to ${margin.isNegative() ? "0" : "999.99"}%.`);
        margin = margin.isNegative() ? zero : new Decimal("999.99");
      }
      put("products", ["id", "pharmacy_id", "code", "name", "category_id", "status_id", "base_unit_id", "base_cost", "buy_price", "margin_pct", "recommended_price", "sell_price", "legacy_id", "created_at", "created_by"], [
        productId, pharmacyId, (b.BARANG_KODE__ ?? "").trim(), (b.BARANG_NAMA__ ?? "").trim(), ids.categories.get(b.KATEGORI_PK__)!, ids.product_statuses.get(b.STATUS_PK__)!, unitId,
        money(cost), money(Decimal.max(dec(b.BARANG_HARGA_BELI__), zero)), margin.toFixed(2), money(Decimal.max(dec(b.BARANG_HARGA_JUAL_REKOMENDASI__), zero)), money(Decimal.max(dec(b.BARANG_HARGA_JUAL_SEBENARNYA__), zero)),
        Number(b.BARANG_PK__), createdAt(b, "BARANG"), ownerId || null,
      ]);
      let stock = Math.trunc(Number(b.BARANG_JUMLAH_STOCK__ ?? 0));
      if (stock < 0) {
        negativeStock += 1;
        notes.add("negative", `Product ${b.BARANG_KODE__} had negative stock (${stock}); imported as 0. Count it in the first stock opname.`);
        stock = 0;
      }
      put("product_batches", ["id", "pharmacy_id", "product_id", "batch_no", "expiry_date", "unit_cost", "qty_on_hand", "created_at", "created_by"], [batchId, pharmacyId, productId, "LEGACY", null, money(cost), stock, createdAt(b, "BARANG"), ownerId || null]);
      if (stock > 0) put("stock_movements", ["id", "pharmacy_id", "product_id", "batch_id", "type", "qty_change", "document_id", "created_at", "created_by"], [ids.stock_movements.take(), pharmacyId, productId, batchId, "opening_balance", stock, null, new Date().toISOString(), ownerId || null]);
      productInfo.set(b.BARANG_PK__!, { id: productId, batchId, unitId, cost });
    }

    // ---- sales ---------------------------------------------------------------------------------------------------------
    const items = get("t3_penjualan_item");
    const returns = get("t3_retur_penjualan");
    const returnsByItem = new Map<string, DumpRow[]>();
    for (const r of returns) returnsByItem.set(r.ITM_JUAL_PK!, [...(returnsByItem.get(r.ITM_JUAL_PK!) ?? []), r]);
    const itemsBySale = new Map<string, DumpRow[]>();
    for (const i of items) itemsBySale.set(i.PENJUALAN_PK__!, [...(itemsBySale.get(i.PENJUALAN_PK__!) ?? []), i]);
    const isRestored = (itemQty: Decimal, r: DumpRow) => itemQty.isZero() || (validDate(r.RETUR_JUAL_TGL_BUAT__) && r.RETUR_JUAL_TGL_BUAT__ >= options.restoreReturnsFrom);

    const lineOfItem = new Map<string, { saleId: number; lineId: number; allocationId: number | null; price: Decimal; discount: Decimal; qty: number }>();
    let restoredSales = 0;
    let committedGrand = zero;
    for (const s of get("t3_penjualan")) {
      const saleId = ids.sales.assign(s.PENJUALAN_PK__!);
      const committed = s.FLAG_PK__ === "2";
      const saleItems = itemsBySale.get(s.PENJUALAN_PK__!) ?? [];
      let restoredValue = zero;
      let gross = zero;
      const lines: { item: DumpRow; qty: number; total: Decimal; price: Decimal; discount: Decimal; productKey: string }[] = [];
      for (const i of saleItems) {
        const current = dec(i.ITM_JUAL_JUMLAH__);
        const price = Decimal.max(dec(i.ITM_JUAL_HARGA__), zero);
        const discount = Decimal.min(Decimal.max(dec(i.ITM_JUAL_DISC__), zero), 100);
        let qty = current;
        let total = dec(i.ITM_JUAL_TOTAL__);
        let restored = zero;
        for (const r of returnsByItem.get(i.ITM_JUAL_PK!) ?? []) if (isRestored(current, r)) restored = restored.add(dec(r.RETUR_JUAL_JUMLAH__));
        if (restored.greaterThan(0)) {
          qty = current.add(restored);
          const restoredTotal = new Decimal(money(price.mul(restored).mul(new Decimal(100).sub(discount)).div(100)));
          total = total.add(restoredTotal);
          restoredValue = restoredValue.add(restoredTotal);
        }
        if (qty.lessThanOrEqualTo(0) || !qty.isInteger() || !productInfo.has(i.BARANG_PK__!)) {
          notes.add("skipline", `Sale ${s.PENJUALAN_NO_STRUK__}: one line (quantity ${current.toString()}) could not be imported.`);
          continue;
        }
        gross = gross.add(price.mul(qty));
        lines.push({ item: i, qty: qty.toNumber(), total, price, discount, productKey: i.BARANG_PK__! });
      }
      if (!restoredValue.isZero()) restoredSales += 1;

      // Sales dated by the day they were completed. The legacy "last updated" date moved whenever a return was made,
      // so for sales whose returns were restored the creation date is used instead.
      const completedDate = !restoredValue.isZero() ? s.PENJUALAN_TGL_BUAT__ : validDate(s.PENJUALAN_TGL_UPD__) ? s.PENJUALAN_TGL_UPD__ : s.PENJUALAN_TGL_BUAT__;
      const grand = dec(s.PENJUALAN_GRAND_TOTAL__).add(restoredValue);
      const paid = Decimal.max(dec(s.PENJUALAN_BAYAR__), zero);
      const committedAt = noon(completedDate, today);
      if (committed) committedGrand = committedGrand.add(grand);
      put("sales", ["id", "pharmacy_id", "receipt_no", "status", "customer_name", "subtotal", "discount_total", "grand_total", "paid_total", "change_amount", "note", "committed_at", "committed_by", "legacy_id", "created_at", "created_by"], [
        saleId, pharmacyId, s.PENJUALAN_NO_STRUK__, committed ? "committed" : "pending", s.PENJUALAN_CST_NM__?.trim() || null, money(Decimal.max(gross, grand)), money(Decimal.max(gross.sub(grand), zero)), money(grand), money(paid),
        money(committed ? Decimal.max(paid.sub(grand), zero) : zero), s.PENJUALAN_KET__, committed ? committedAt : null, committed ? ownerId || null : null, Number(s.PENJUALAN_PK__), noon(s.PENJUALAN_TGL_BUAT__, today), ownerId || null,
      ]);
      for (const l of lines) {
        const p = productInfo.get(l.productKey)!;
        const lineId = ids.sale_lines.take();
        put("sale_lines", ["id", "pharmacy_id", "sale_id", "product_id", "unit_id", "unit_factor", "qty", "qty_base", "unit_price", "discount_pct", "line_total", "created_at", "created_by"], [lineId, pharmacyId, saleId, p.id, p.unitId, 1, l.qty, l.qty, money(l.price), l.discount.toFixed(2), money(l.total), noon(s.PENJUALAN_TGL_BUAT__, today), ownerId || null]);
        let allocationId: number | null = null;
        if (committed) {
          allocationId = ids.sale_line_allocations.take();
          // The legacy app never stored the cost at the time of sale; the product's current base cost is the best available.
          put("sale_line_allocations", ["id", "pharmacy_id", "sale_line_id", "batch_id", "qty_base", "unit_cost"], [allocationId, pharmacyId, lineId, p.batchId, l.qty, money(p.cost)]);
        }
        lineOfItem.set(l.item.ITM_JUAL_PK!, { saleId, lineId, allocationId, price: l.price, discount: l.discount, qty: l.qty });
      }
      if (committed && paid.greaterThan(0)) {
        put("sale_payments", ["id", "pharmacy_id", "sale_id", "payment_method_id", "amount", "status", "confirmed_at", "confirmed_by", "created_at", "created_by"], [ids.sale_payments.take(), pharmacyId, saleId, cashId, money(paid), "paid", committedAt, ownerId || null, committedAt, ownerId || null]);
      }
    }

    // ---- sales returns (each legacy return becomes its own document; sales are never changed by them) --------------------
    const returnedSoFar = new Map<string, number>();
    for (const r of returns) {
      const line = lineOfItem.get(r.ITM_JUAL_PK!);
      if (!line || line.allocationId === null) {
        notes.add("skipreturn", `A return (legacy #${r.RETUR_JUAL_PK__}) refers to a sale line that is missing or not completed; skipped.`);
        continue;
      }
      let qty = Math.trunc(Number(r.RETUR_JUAL_JUMLAH__ ?? 0));
      const left = line.qty - (returnedSoFar.get(r.ITM_JUAL_PK!) ?? 0);
      if (qty > left) {
        notes.add("clampreturn", `A return (legacy #${r.RETUR_JUAL_PK__}) was larger than what was left to return (${qty} > ${left}); reduced.`);
        qty = left;
      }
      if (qty <= 0) continue;
      returnedSoFar.set(r.ITM_JUAL_PK!, (returnedSoFar.get(r.ITM_JUAL_PK!) ?? 0) + qty);
      const refund = money(line.price.mul(qty).mul(new Decimal(100).sub(line.discount)).div(100));
      const returnId = ids.sales_returns.assign(r.RETUR_JUAL_PK__!);
      const when = noon(r.RETUR_JUAL_TGL_BUAT__, today);
      put("sales_returns", ["id", "pharmacy_id", "return_no", "sale_id", "reason", "total_refund", "legacy_id", "created_at", "created_by"], [returnId, pharmacyId, `SR-LEGACY-${r.RETUR_JUAL_PK__}`, line.saleId, r.RETUR_JUAL_KET__, refund, Number(r.RETUR_JUAL_PK__), when, ownerId || null]);
      put("sales_return_lines", ["id", "pharmacy_id", "sales_return_id", "sale_line_allocation_id", "qty_base", "refund_amount"], [ids.sales_return_lines.take(), pharmacyId, returnId, line.allocationId, qty, refund]);
    }

    // ---- debts (manual records in the legacy app) -----------------------------------------------------------------------
    for (const h of get("t3_hutang")) {
      const amount = Decimal.max(dec(h.HUTANG_JUMLAH__), zero);
      put("payables", ["id", "pharmacy_id", "supplier_id", "amount", "paid_amount", "note", "legacy_id", "created_at", "created_by"], [ids.payables.take(), pharmacyId, ids.suppliers.get(h.SUPPLIER_PK__) ?? null, money(amount), money(Decimal.min(dec(h.HUTANG_DIBAYAR__), amount)), h.HUTANG_KET__, Number(h.HUTANG_PK__), createdAt(h, "HUTANG"), ownerId || null]);
    }
    for (const h of get("t3_piutang")) {
      const amount = Decimal.max(dec(h.PIUTANG_JUMLAH__), zero);
      put("receivables", ["id", "pharmacy_id", "customer_id", "amount", "paid_amount", "note", "legacy_id", "created_at", "created_by"], [ids.receivables.take(), pharmacyId, ids.customers.get(h.CST_PK__) ?? null, money(amount), money(Decimal.min(dec(h.PIUTANG_DIBAYAR__), amount)), h.PIUTANG_KET__, Number(h.PIUTANG_PK__), createdAt(h, "PIUTANG"), ownerId || null]);
    }

    // ---- purchase orders and their deliveries -------------------------------------------------------------------------------
    const poLinesByPo = new Map<string, { id: number; productKey: string; unitKey: string; qty: number; received: number }[]>();
    const poItemsRaw = new Map<string, DumpRow[]>();
    for (const i of get("t3_purchase_order_item")) poItemsRaw.set(i.PO_PK__!, [...(poItemsRaw.get(i.PO_PK__!) ?? []), i]);
    const receiptsByPo = new Map<string, DumpRow[]>();
    for (const r of get("t3_purchase_units")) receiptsByPo.set(r.PO_PK__!, [...(receiptsByPo.get(r.PO_PK__!) ?? []), r]);
    const receiptItems = new Map<string, DumpRow[]>();
    for (const i of get("t3_purchase_units_item")) receiptItems.set(i.PU_PK__!, [...(receiptItems.get(i.PU_PK__!) ?? []), i]);

    const poRows: { po: DumpRow; poId: number }[] = [];
    for (const po of get("t3_purchase_order")) {
      const poId = ids.purchase_orders.assign(po.PO_PK__!);
      poRows.push({ po, poId });
      const lines: { id: number; productKey: string; unitKey: string; qty: number; received: number }[] = [];
      for (const i of poItemsRaw.get(po.PO_PK__!) ?? []) {
        const qty = Math.trunc(Number(i.PO_ITM_JUMLAH__ ?? 0));
        if (!productInfo.has(i.BARANG_PK__!) || qty <= 0) {
          notes.add("skippoline", `Purchase order ${po.PO_NOMOR__}: an item with quantity ${i.PO_ITM_JUMLAH__} could not be imported.`);
          continue;
        }
        const id = ids.purchase_order_lines.take();
        // The legacy order line keeps its own unit. Stock was never converted between units in the legacy app, so the factor is 1.
        put("purchase_order_lines", ["id", "pharmacy_id", "purchase_order_id", "product_id", "unit_id", "unit_factor", "qty", "created_at", "created_by"], [id, pharmacyId, poId, productInfo.get(i.BARANG_PK__!)!.id, ids.units.get(i.SATUAN_PK__)!, 1, qty, createdAt(po, "PO"), ownerId || null]);
        lines.push({ id, productKey: i.BARANG_PK__!, unitKey: i.SATUAN_PK__!, qty, received: 0 });
      }
      poLinesByPo.set(po.PO_PK__!, lines);
    }

    const receiptLineByLegacy = new Map<string, number>();
    const poStatus = new Map<string, "open" | "received" | "closed">();
    for (const { po, poId } of poRows) {
      const receipts = receiptsByPo.get(po.PO_PK__!) ?? [];
      const lines = poLinesByPo.get(po.PO_PK__!) ?? [];
      for (const r of receipts) {
        const receiptId = ids.goods_receipts.assign(r.PU_PK__!);
        put("goods_receipts", ["id", "pharmacy_id", "purchase_order_id", "receipt_no", "supplier_invoice_no", "grand_total", "note", "legacy_id", "created_at", "created_by"], [receiptId, pharmacyId, poId, null, (r.PU_NO_FAKTUR__ ?? "").trim() || "-", money(dec(r.PU_GRAND_TOTAL__)), r.PU_KET__, Number(r.PU_PK__), createdAt(r, "PU"), ownerId || null]);
        for (const i of receiptItems.get(r.PU_PK__!) ?? []) {
          const qty = Math.trunc(Number(i.PU_ITM_JUMLAH__ ?? 0));
          const product = productInfo.get(i.BARANG_PK__!);
          if (!product || qty <= 0) {
            notes.add("skipreceiptline", `Delivery ${r.PU_NO_FAKTUR__}: an item with quantity ${i.PU_ITM_JUMLAH__} could not be imported.`);
            continue;
          }
          // Count the delivery against the ordered line of the same product and unit that still has room.
          const target = lines.find((l) => l.productKey === i.BARANG_PK__ && l.unitKey === i.SATUAN_PK__ && l.received < l.qty);
          if (target) target.received += qty;
          const lineId = ids.goods_receipt_lines.assign(i.PU_ITM_PK__!);
          receiptLineByLegacy.set(i.PU_ITM_PK__!, lineId);
          put("goods_receipt_lines", ["id", "pharmacy_id", "goods_receipt_id", "purchase_order_line_id", "product_id", "batch_id", "unit_id", "unit_factor", "qty", "qty_base", "unit_price", "discount_pct", "line_total", "created_at", "created_by"], [
            lineId, pharmacyId, receiptId, target?.id ?? null, product.id, product.batchId, ids.units.get(i.SATUAN_PK__)!, 1, qty, qty, money(Decimal.max(dec(i.PU_ITM_HARGA_BELI__), zero)),
            Decimal.min(Decimal.max(dec(i.PU_ITM_DISC__), zero), 100).toFixed(2), money(dec(i.PU_ITM_TOTAL_BELI__)), createdAt(r, "PU"), ownerId || null,
          ]);
        }
      }
      // Under the old "one delivery per order" rule an order with a delivery was finished, even if items were short.
      poStatus.set(po.PO_PK__!, receipts.length === 0 ? "open" : lines.every((l) => l.received >= l.qty) ? "received" : "closed");
    }
    for (const { po, poId } of poRows) {
      put("purchase_orders", ["id", "pharmacy_id", "po_no", "supplier_id", "status", "note", "legacy_id", "created_at", "created_by"], [poId, pharmacyId, po.PO_NOMOR__, ids.suppliers.get(po.SUPPLIER_PK__) ?? null, poStatus.get(po.PO_PK__!)!, po.PO_KET__, Number(po.PO_PK__), createdAt(po, "PO"), ownerId || null]);
    }

    for (const r of get("t3_retur_purchase")) {
      const lineId = receiptLineByLegacy.get(r.PU_ITM_PK__!);
      const qty = Math.trunc(Number(r.RETUR_PURCHASE_JUMLAH__ ?? 0));
      const receiptLine = lineId === undefined ? undefined : out.goods_receipt_lines.rows.find((x) => x[0] === lineId);
      if (lineId === undefined || !receiptLine || qty <= 0) {
        notes.add("skippurchasereturn", `A purchase return (legacy #${r.RETUR_PURCHASE_PK__}) could not be linked to a delivery line; skipped.`);
        continue;
      }
      const returnId = ids.purchase_returns.assign(r.RETUR_PURCHASE_PK__!);
      put("purchase_returns", ["id", "pharmacy_id", "return_no", "goods_receipt_id", "reason", "legacy_id", "created_at", "created_by"], [returnId, pharmacyId, `PR-LEGACY-${r.RETUR_PURCHASE_PK__}`, receiptLine[2], r.RETUR_PURCHASE_KET__, Number(r.RETUR_PURCHASE_PK__), noon(r.RETUR_PURCHASE_TGL_BUAT__, today), ownerId || null]);
      put("purchase_return_lines", ["id", "pharmacy_id", "purchase_return_id", "goods_receipt_line_id", "qty_base"], [ids.purchase_return_lines.take(), pharmacyId, returnId, lineId, qty]);
    }

    // ---- adjustments and stock opname -----------------------------------------------------------------------------------------
    for (const a of get("t3_penyesuaian_item")) {
      const product = productInfo.get(a.BARANG_PK__!);
      const qty = Math.trunc(Number(a.PENY_ITEM_JML__ ?? 0));
      if (!product || qty === 0) continue;
      put("stock_adjustments", ["id", "pharmacy_id", "batch_id", "reason_id", "qty_change", "note", "legacy_id", "created_at", "created_by"], [ids.stock_adjustments.take(), pharmacyId, product.batchId, ids.adjustment_reasons.get(a.PENY_ST_PK__)!, qty, a.PENY_ITEM_KET__, Number(a.PENY_ITEM_PK__), noon(a.PENY_TGL_BUAT__, today), ownerId || null]);
    }
    const opnameItems = new Map<string, Map<string, DumpRow>>();
    for (const i of get("t3_stock_opname_item")) {
      const bySo = opnameItems.get(i.SO_PK__!) ?? new Map<string, DumpRow>();
      if (bySo.has(i.BARANG_PK__!)) notes.add("dupopname", `Stock opname item for product ${i.BARANG_PK__} appears twice; the last one was kept.`);
      bySo.set(i.BARANG_PK__!, i);
      opnameItems.set(i.SO_PK__!, bySo);
    }
    for (const so of get("t3_stock_opname")) {
      const soId = ids.stock_opnames.assign(so.SO_PK__!);
      const committed = so.FLAG_PK__ === "2";
      put("stock_opnames", ["id", "pharmacy_id", "opname_no", "status", "total_difference_value", "note", "committed_at", "committed_by", "legacy_id", "created_at", "created_by"], [
        soId, pharmacyId, so.SO_KODE__, committed ? "committed" : "pending", money(dec(so.SO_GRAND_TOTAL_SELISIH__)), so.SO_KET__, committed ? noon(validDate(so.SO_TGL_UPD__) ? so.SO_TGL_UPD__ : so.SO_TGL_BUAT__, today) : null, committed ? ownerId || null : null, Number(so.SO_PK__), createdAt(so, "SO"), ownerId || null,
      ]);
      for (const i of opnameItems.get(so.SO_PK__!)?.values() ?? []) {
        const product = productInfo.get(i.BARANG_PK__!);
        if (!product) continue;
        put("stock_opname_lines", ["id", "pharmacy_id", "stock_opname_id", "batch_id", "system_qty_base", "physical_qty_base", "unit_cost", "difference_value", "created_at", "created_by"], [
          ids.stock_opname_lines.take(), pharmacyId, soId, product.batchId, Math.trunc(Number(i.SO_ITM_JML_SISTEM__ ?? 0)), Math.max(Math.trunc(Number(i.SO_ITM_JML_FISIK__ ?? 0)), 0), money(i.SO_ITM_HARGA__ == null ? product.cost : dec(i.SO_ITM_HARGA__)), money(dec(i.SO_ITM_TOTAL_SELISIH__)), createdAt(so, "SO"), ownerId || null,
        ]);
      }
    }

    // ---- write ------------------------------------------------------------------------------------------------------------------
    const counts: Record<string, number> = {};
    for (const t of TABLES) counts[t] = out[t].rows.length;
    const reconciliation: string[] = [];
    if (!options.dryRun) {
      for (const t of TABLES) await bulkInsert(client, t, out[t]);
      // Verify what was written against what was read.
      const q = async (sql: string) => (await client.query(sql, [pharmacyId])).rows[0];
      const stock = await q("select coalesce(sum(qty_on_hand), 0)::bigint as n from product_batches where pharmacy_id = $1");
      const sales = await q("select count(*) filter (where status = 'committed')::int as committed, count(*)::int as total, coalesce(sum(grand_total) filter (where status = 'committed'), 0)::text as grand from sales where pharmacy_id = $1");
      const ledger = await q("select count(*)::int as n from product_batches b where b.pharmacy_id = $1 and b.qty_on_hand <> coalesce((select sum(qty_change) from stock_movements m where m.batch_id = b.id), 0)");
      const legacyStock = get("t2_barang").reduce((t, b) => t + Math.max(Math.trunc(Number(b.BARANG_JUMLAH_STOCK__ ?? 0)), 0), 0);
      reconciliation.push(`Products: legacy ${get("t2_barang").length} → imported ${counts.products}`);
      reconciliation.push(`Stock (units): legacy ${legacyStock} (negatives counted as 0) → imported ${stock.n}`);
      reconciliation.push(`Sales: legacy ${get("t3_penjualan").length} → imported ${sales.total} (${sales.committed} completed)`);
      reconciliation.push(`Completed sales total: expected ${money(committedGrand)} → imported ${sales.grand}`);
      reconciliation.push(`Batches whose stock differs from the ledger: ${ledger.n} (must be 0)`);
      if (Number(stock.n) !== legacyStock || sales.grand !== money(committedGrand) || Number(ledger.n) !== 0 || Number(sales.total) !== get("t3_penjualan").length) throw new Error(`Reconciliation failed:\n${reconciliation.join("\n")}`);
      await client.query("commit");
    } else {
      await client.query("rollback");
    }

    const summary = notes.summary({
      negative: `products with negative stock imported as 0 (${negativeStock})`,
      margin: "products with a margin outside 0–999.99%",
      skipline: "sale lines skipped (quantity 0 or unknown product)",
      skipreturn: "returns skipped (their sale line is missing)",
      clampreturn: "returns reduced to what was left to return",
      skippoline: "purchase order lines skipped (quantity 0)",
      skipreceiptline: "delivery lines skipped (quantity 0)",
      skippurchasereturn: "purchase returns skipped",
      dupopname: "duplicate stock opname lines (last one kept)",
      renamed: "duplicate lookup names renamed",
    });
    return {
      counts,
      notes: [
        ownerNote,
        `${restoredSales} sales had their original quantities restored from returns made after ${options.restoreReturnsFrom} (the legacy v1.8 patch had reduced them).`,
        ...summary,
        "Examples:",
        ...notes.lines.map((l) => `  - ${l}`),
      ].filter(Boolean),
      reconciliation,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}
