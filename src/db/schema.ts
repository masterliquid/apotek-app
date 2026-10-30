// Database schema. See docs/PHASE3_MIGRATION_MAPPING.md for how each table maps to the legacy MySQL schema.
//
// Conventions:
// - Every pharmacy-owned table has `pharmacy_id`, protected by Row-Level Security (see drizzle/*_rls.sql),
//   and a UNIQUE (pharmacy_id, id) so child rows reference parents with composite foreign keys.
//   A composite FK makes it impossible for a row of pharmacy A to point at a row of pharmacy B.
// - Quantities are integers in the product's base unit (e.g. tablets). Pack units only convert at input.
// - Money is NUMERIC(15,2) (returned as string by the driver; use decimal.js, never JS number).
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

const money = (name: string) => numeric(name, { precision: 15, scale: 2 });
const percent = (name: string) => numeric(name, { precision: 5, scale: 2 });
const ref = (name: string) => bigint(name, { mode: "number" });
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

const idColumn = () => bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity();

// Composite FK (pharmacy_id, column) -> target (pharmacy_id, id).
type TenantTable = { pharmacyId: AnyPgColumn; id: AnyPgColumn };
function tenantFk(name: string, pharmacyIdCol: AnyPgColumn, col: AnyPgColumn, target: TenantTable) {
  return foreignKey({
    name,
    columns: [pharmacyIdCol, col],
    foreignColumns: [target.pharmacyId, target.id],
  });
}

// ---------------------------------------------------------------------------
// Platform tables (not pharmacy-scoped, no RLS)
// ---------------------------------------------------------------------------

export const membershipRole = pgEnum("membership_role", ["owner", "admin", "pharmacist", "cashier"]);

export const users = pgTable("users", {
  id: idColumn(),
  username: text("username").notNull().unique(),
  fullName: text("full_name").notNull(),
  // argon2id hash. NULL only for imported users that still have a legacy hash.
  passwordHash: text("password_hash"),
  // Legacy sha1(salt + password) from t2_karyawan; replaced by passwordHash on first successful login.
  legacyPasswordSha1: text("legacy_password_sha1"),
  legacyPasswordSalt: text("legacy_password_salt"),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamptz("last_login_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  email: text("email").unique(),
});

export const pharmacies = pgTable(
  "pharmacies",
  {
    id: idColumn(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    // Legacy rule: buy price = base cost + 10%. Kept as the default, configurable per pharmacy.
    buyPriceMarkupPct: percent("buy_price_markup_pct").notNull().default("10.00"),
    expiryWarningDays: integer("expiry_warning_days").notNull().default(90),
    receiptHeader: text("receipt_header"),
    receiptFooter: text("receipt_footer"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [check("pharmacies_markup_non_negative", sql`${t.buyPriceMarkupPct} >= 0`)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: idColumn(),
    userId: ref("user_id").notNull().references(() => users.id),
    pharmacyId: ref("pharmacy_id").notNull().references(() => pharmacies.id),
    role: membershipRole("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [unique("memberships_user_pharmacy_uq").on(t.userId, t.pharmacyId)],
);

export const sessions = pgTable(
  "sessions",
  {
    // sha256 of the random token stored in the cookie; the raw token is never stored.
    id: text("id").primaryKey(),
    userId: ref("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // Pharmacy the user is currently working in. NULL until chosen (or for platform admin).
    pharmacyId: ref("pharmacy_id").references(() => pharmacies.id),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Pharmacy-owned tables (RLS on pharmacy_id)
// ---------------------------------------------------------------------------

const tenantColumns = () => ({
  id: idColumn(),
  pharmacyId: ref("pharmacy_id").notNull().references(() => pharmacies.id),
});

const auditColumns = () => ({
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  createdBy: ref("created_by").references(() => users.id),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  updatedBy: ref("updated_by").references(() => users.id),
});

// Legacy id kept for traceability of imported rows (NULL for rows created in the new app).
const legacyId = () => integer("legacy_id");

// --- Lookups ---------------------------------------------------------------

function lookupTable<N extends string>(name: N) {
  return pgTable(
    name,
    { ...tenantColumns(), name: text("name").notNull(), isActive: boolean("is_active").notNull().default(true), legacyId: legacyId(), ...auditColumns() },
    (t) => [unique(`${name}_tenant_uq`).on(t.pharmacyId, t.id), unique(`${name}_name_uq`).on(t.pharmacyId, t.name)],
  );
}

export const categories = lookupTable("categories"); // t1_kategori
export const units = lookupTable("units"); // t1_satuan
export const productStatuses = lookupTable("product_statuses"); // t1_status
export const adjustmentReasons = lookupTable("adjustment_reasons"); // t1_penyesuaian_status

export const suppliers = pgTable(
  "suppliers",
  {
    ...tenantColumns(),
    name: text("name").notNull(),
    phone: text("phone"),
    address: text("address"),
    isActive: boolean("is_active").notNull().default(true),
    legacyId: legacyId(),
    ...auditColumns(),
  },
  (t) => [unique("suppliers_tenant_uq").on(t.pharmacyId, t.id)],
);

export const customers = pgTable(
  "customers",
  {
    ...tenantColumns(),
    name: text("name").notNull(),
    phone: text("phone"),
    address: text("address"),
    isActive: boolean("is_active").notNull().default(true),
    legacyId: legacyId(),
    ...auditColumns(),
  },
  (t) => [unique("customers_tenant_uq").on(t.pharmacyId, t.id)],
);

// --- Products, units, batches ------------------------------------------------

export const products = pgTable(
  "products",
  {
    ...tenantColumns(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    categoryId: ref("category_id").notNull(),
    statusId: ref("status_id").notNull(),
    baseUnitId: ref("base_unit_id").notNull(),
    // Pricing per base unit (legacy t2_barang):
    // base_cost (NILAI_ASLI) -> buy_price = base_cost * (1 + markup%) -> recommended = buy_price * (1 + margin%).
    // Only sell_price (HARGA_JUAL_SEBENARNYA, set manually) is used at the POS.
    baseCost: money("base_cost").notNull(),
    buyPrice: money("buy_price").notNull(),
    marginPct: percent("margin_pct").notNull(),
    recommendedPrice: money("recommended_price").notNull(),
    sellPrice: money("sell_price").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    legacyId: legacyId(),
    ...auditColumns(),
  },
  (t) => [
    unique("products_tenant_uq").on(t.pharmacyId, t.id),
    unique("products_code_uq").on(t.pharmacyId, t.code),
    tenantFk("products_category_fk", t.pharmacyId, t.categoryId, categories),
    tenantFk("products_status_fk", t.pharmacyId, t.statusId, productStatuses),
    tenantFk("products_base_unit_fk", t.pharmacyId, t.baseUnitId, units),
    check("products_prices_non_negative", sql`${t.baseCost} >= 0 AND ${t.buyPrice} >= 0 AND ${t.recommendedPrice} >= 0 AND ${t.sellPrice} >= 0`),
    index("products_name_idx").on(t.pharmacyId, t.name),
  ],
);

// Pack units, e.g. strip = 10 tablets, box = 100 tablets. The base unit itself is not listed here.
export const productUnits = pgTable(
  "product_units",
  {
    ...tenantColumns(),
    productId: ref("product_id").notNull(),
    unitId: ref("unit_id").notNull(),
    factor: integer("factor").notNull(),
    // Optional own sell price for this pack; NULL means factor * product.sell_price.
    sellPrice: money("sell_price"),
    ...auditColumns(),
  },
  (t) => [
    unique("product_units_tenant_uq").on(t.pharmacyId, t.id),
    unique("product_units_product_unit_uq").on(t.pharmacyId, t.productId, t.unitId),
    tenantFk("product_units_product_fk", t.pharmacyId, t.productId, products),
    tenantFk("product_units_unit_fk", t.pharmacyId, t.unitId, units),
    check("product_units_factor_gt_one", sql`${t.factor} > 1`),
  ],
);

export const productBatches = pgTable(
  "product_batches",
  {
    ...tenantColumns(),
    productId: ref("product_id").notNull(),
    batchNo: text("batch_no").notNull(),
    expiryDate: date("expiry_date"),
    // Base cost per base unit at the time of receipt.
    unitCost: money("unit_cost").notNull(),
    qtyOnHand: integer("qty_on_hand").notNull().default(0),
    ...auditColumns(),
  },
  (t) => [
    unique("product_batches_tenant_uq").on(t.pharmacyId, t.id),
    unique("product_batches_batch_uq").on(t.pharmacyId, t.productId, t.batchNo),
    tenantFk("product_batches_product_fk", t.pharmacyId, t.productId, products),
    // Owner decision: stock may never go negative.
    check("product_batches_qty_non_negative", sql`${t.qtyOnHand} >= 0`),
    index("product_batches_fefo_idx").on(t.pharmacyId, t.productId, t.expiryDate),
  ],
);

export const stockMovementType = pgEnum("stock_movement_type", [
  "opening_balance",
  "goods_receipt",
  "purchase_return",
  "sale",
  "sales_return",
  "adjustment",
  "stock_opname",
]);

// Append-only ledger: every stock change, per batch, with the document that caused it.
export const stockMovements = pgTable(
  "stock_movements",
  {
    ...tenantColumns(),
    productId: ref("product_id").notNull(),
    batchId: ref("batch_id").notNull(),
    type: stockMovementType("type").notNull(),
    qtyChange: integer("qty_change").notNull(),
    documentId: ref("document_id"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    createdBy: ref("created_by").references(() => users.id),
  },
  (t) => [
    tenantFk("stock_movements_product_fk", t.pharmacyId, t.productId, products),
    tenantFk("stock_movements_batch_fk", t.pharmacyId, t.batchId, productBatches),
    check("stock_movements_qty_non_zero", sql`${t.qtyChange} <> 0`),
    index("stock_movements_product_idx").on(t.pharmacyId, t.productId, t.createdAt),
  ],
);

// Gap-free document numbers per pharmacy, type and period (e.g. receipts per day).
export const documentCounters = pgTable(
  "document_counters",
  {
    pharmacyId: ref("pharmacy_id").notNull().references(() => pharmacies.id),
    docType: text("doc_type").notNull(),
    period: text("period").notNull(),
    lastValue: integer("last_value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.pharmacyId, t.docType, t.period] })],
);

// --- Sales ---------------------------------------------------------------------

export const saleStatus = pgEnum("sale_status", ["pending", "committed", "void"]);
export const paymentKind = pgEnum("payment_kind", ["cash", "non_cash"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "paid"]);

export const paymentMethods = pgTable(
  "payment_methods",
  {
    ...tenantColumns(),
    name: text("name").notNull(),
    kind: paymentKind("kind").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns(),
  },
  (t) => [unique("payment_methods_tenant_uq").on(t.pharmacyId, t.id), unique("payment_methods_name_uq").on(t.pharmacyId, t.name)],
);

export const sales = pgTable(
  "sales",
  {
    ...tenantColumns(),
    // Assigned on commit (legacy format ddmmyyyy + daily sequence). NULL while pending.
    receiptNo: text("receipt_no"),
    status: saleStatus("status").notNull().default("pending"),
    customerId: ref("customer_id"),
    // Free-text name as in legacy PENJUALAN_CST_NM__.
    customerName: text("customer_name"),
    subtotal: money("subtotal").notNull().default("0"),
    discountTotal: money("discount_total").notNull().default("0"),
    grandTotal: money("grand_total").notNull().default("0"),
    paidTotal: money("paid_total").notNull().default("0"),
    changeAmount: money("change_amount").notNull().default("0"),
    note: text("note"),
    committedAt: timestamptz("committed_at"),
    committedBy: ref("committed_by").references(() => users.id),
    legacyId: legacyId(),
    ...auditColumns(),
  },
  (t) => [
    unique("sales_tenant_uq").on(t.pharmacyId, t.id),
    unique("sales_receipt_no_uq").on(t.pharmacyId, t.receiptNo),
    tenantFk("sales_customer_fk", t.pharmacyId, t.customerId, customers),
    check("sales_committed_has_receipt", sql`${t.status} <> 'committed' OR (${t.receiptNo} IS NOT NULL AND ${t.committedAt} IS NOT NULL)`),
    index("sales_committed_at_idx").on(t.pharmacyId, t.committedAt),
  ],
);

export const saleLines = pgTable(
  "sale_lines",
  {
    ...tenantColumns(),
    saleId: ref("sale_id").notNull(),
    productId: ref("product_id").notNull(),
    // Unit chosen at the till; factor converts to base units (1 for the base unit).
    unitId: ref("unit_id").notNull(),
    unitFactor: integer("unit_factor").notNull(),
    qty: integer("qty").notNull(),
    qtyBase: integer("qty_base").notNull(),
    unitPrice: money("unit_price").notNull(),
    discountPct: percent("discount_pct").notNull().default("0"),
    lineTotal: money("line_total").notNull(),
    ...auditColumns(),
  },
  (t) => [
    unique("sale_lines_tenant_uq").on(t.pharmacyId, t.id),
    tenantFk("sale_lines_sale_fk", t.pharmacyId, t.saleId, sales),
    tenantFk("sale_lines_product_fk", t.pharmacyId, t.productId, products),
    tenantFk("sale_lines_unit_fk", t.pharmacyId, t.unitId, units),
    check("sale_lines_qty_positive", sql`${t.qty} > 0 AND ${t.unitFactor} >= 1 AND ${t.qtyBase} = ${t.qty} * ${t.unitFactor}`),
    check("sale_lines_discount_range", sql`${t.discountPct} >= 0 AND ${t.discountPct} <= 100`),
  ],
);

// Which batches a committed sale line took stock from (FEFO), with the cost at that moment for profit reports.
export const saleLineAllocations = pgTable(
  "sale_line_allocations",
  {
    ...tenantColumns(),
    saleLineId: ref("sale_line_id").notNull(),
    batchId: ref("batch_id").notNull(),
    qtyBase: integer("qty_base").notNull(),
    unitCost: money("unit_cost").notNull(),
  },
  (t) => [
    unique("sale_line_allocations_tenant_uq").on(t.pharmacyId, t.id),
    tenantFk("sale_line_allocations_line_fk", t.pharmacyId, t.saleLineId, saleLines),
    tenantFk("sale_line_allocations_batch_fk", t.pharmacyId, t.batchId, productBatches),
    check("sale_line_allocations_qty_positive", sql`${t.qtyBase} > 0`),
  ],
);

export const salePayments = pgTable(
  "sale_payments",
  {
    ...tenantColumns(),
    saleId: ref("sale_id").notNull(),
    paymentMethodId: ref("payment_method_id").notNull(),
    amount: money("amount").notNull(),
    referenceNo: text("reference_no"),
    // Owner decision: a sale can only be committed when all payments are 'paid' and cover the total.
    status: paymentStatus("status").notNull().default("pending"),
    confirmedAt: timestamptz("confirmed_at"),
    confirmedBy: ref("confirmed_by").references(() => users.id),
    ...auditColumns(),
  },
  (t) => [
    unique("sale_payments_tenant_uq").on(t.pharmacyId, t.id),
    tenantFk("sale_payments_sale_fk", t.pharmacyId, t.saleId, sales),
    tenantFk("sale_payments_method_fk", t.pharmacyId, t.paymentMethodId, paymentMethods),
    check("sale_payments_amount_positive", sql`${t.amount} > 0`),
  ],
);

export const salesReturns = pgTable(
  "sales_returns",
  {
    ...tenantColumns(),
    returnNo: text("return_no").notNull(),
    saleId: ref("sale_id").notNull(),
    reason: text("reason"),
    totalRefund: money("total_refund").notNull(),
    legacyId: legacyId(),
    ...auditColumns(),
  },
  (t) => [
    unique("sales_returns_tenant_uq").on(t.pharmacyId, t.id),
    unique("sales_returns_no_uq").on(t.pharmacyId, t.returnNo),
    tenantFk("sales_returns_sale_fk", t.pharmacyId, t.saleId, sales),
  ],
);

export const salesReturnLines = pgTable(
  "sales_return_lines",
  {
    ...tenantColumns(),
    salesReturnId: ref("sales_return_id").notNull(),
    saleLineAllocationId: ref("sale_line_allocation_id").notNull(),
    qtyBase: integer("qty_base").notNull(),
    refundAmount: money("refund_amount").notNull(),
  },
  (t) => [
    unique("sales_return_lines_tenant_uq").on(t.pharmacyId, t.id),
    tenantFk("sales_return_lines_return_fk", t.pharmacyId, t.salesReturnId, salesReturns),
    tenantFk("sales_return_lines_alloc_fk", t.pharmacyId, t.saleLineAllocationId, saleLineAllocations),
    check("sales_return_lines_qty_positive", sql`${t.qtyBase} > 0`),
  ],
);

// --- Purchasing --------------------------------------------------------------------

// open = nothing received yet; partial = some received, some still to come; received = everything arrived;
// closed = closed with a shortfall (the rest will not come); cancelled = cancelled before anything arrived.
export const purchaseOrderStatus = pgEnum("purchase_order_status", ["open", "received", "cancelled", "partial", "closed"]);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    ...tenantColumns(),
    poNo: text("po_no").notNull(),
    supplierId: ref("supplier_id").notNull(),
    status: purchaseOrderStatus("status").notNull().default("open"),
    note: text("note"),
    legacyId: legacyId(),
    ...auditColumns(),
  },
  (t) => [
    unique("purchase_orders_tenant_uq").on(t.pharmacyId, t.id),
    unique("purchase_orders_no_uq").on(t.pharmacyId, t.poNo),
    tenantFk("purchase_orders_supplier_fk", t.pharmacyId, t.supplierId, suppliers),
  ],
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    ...tenantColumns(),
    purchaseOrderId: ref("purchase_order_id").notNull(),
    productId: ref("product_id").notNull(),
    unitId: ref("unit_id").notNull(),
    unitFactor: integer("unit_factor").notNull(),
    qty: integer("qty").notNull(),
    ...auditColumns(),
  },
  (t) => [
    unique("purchase_order_lines_tenant_uq").on(t.pharmacyId, t.id),
    tenantFk("purchase_order_lines_po_fk", t.pharmacyId, t.purchaseOrderId, purchaseOrders),
    tenantFk("purchase_order_lines_product_fk", t.pharmacyId, t.productId, products),
    tenantFk("purchase_order_lines_unit_fk", t.pharmacyId, t.unitId, units),
    check("purchase_order_lines_qty_positive", sql`${t.qty} > 0 AND ${t.unitFactor} >= 1`),
  ],
);

// Legacy t3_purchase_units: goods received against a PO (one receipt per PO in legacy).
export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    ...tenantColumns(),
    purchaseOrderId: ref("purchase_order_id").notNull(),
    // Human-readable number (GR-20261029-001). NULL for receipts imported from the legacy system.
    receiptNo: text("receipt_no"),
    supplierInvoiceNo: text("supplier_invoice_no").notNull(),
    grandTotal: money("grand_total").notNull(),
    note: text("note"),
    legacyId: legacyId(),
    ...auditColumns(),
  },
  (t) => [
    unique("goods_receipts_tenant_uq").on(t.pharmacyId, t.id),
    // A PO can now be received in several deliveries, so there is no longer one receipt per PO.
    unique("goods_receipts_no_uq").on(t.pharmacyId, t.receiptNo),
    index("goods_receipts_po_idx").on(t.pharmacyId, t.purchaseOrderId),
    tenantFk("goods_receipts_po_fk", t.pharmacyId, t.purchaseOrderId, purchaseOrders),
  ],
);

export const goodsReceiptLines = pgTable(
  "goods_receipt_lines",
  {
    ...tenantColumns(),
    goodsReceiptId: ref("goods_receipt_id").notNull(),
    // The ordered line this delivery counts against; NULL for an item that arrived but was not on the order.
    purchaseOrderLineId: ref("purchase_order_line_id"),
    productId: ref("product_id").notNull(),
    batchId: ref("batch_id").notNull(),
    unitId: ref("unit_id").notNull(),
    unitFactor: integer("unit_factor").notNull(),
    qty: integer("qty").notNull(),
    qtyBase: integer("qty_base").notNull(),
    // Price per chosen unit, as on the supplier invoice.
    unitPrice: money("unit_price").notNull(),
    discountPct: percent("discount_pct").notNull().default("0"),
    lineTotal: money("line_total").notNull(),
    ...auditColumns(),
  },
  (t) => [
    unique("goods_receipt_lines_tenant_uq").on(t.pharmacyId, t.id),
    tenantFk("goods_receipt_lines_receipt_fk", t.pharmacyId, t.goodsReceiptId, goodsReceipts),
    tenantFk("goods_receipt_lines_po_line_fk", t.pharmacyId, t.purchaseOrderLineId, purchaseOrderLines),
    index("goods_receipt_lines_po_line_idx").on(t.pharmacyId, t.purchaseOrderLineId),
    tenantFk("goods_receipt_lines_product_fk", t.pharmacyId, t.productId, products),
    tenantFk("goods_receipt_lines_batch_fk", t.pharmacyId, t.batchId, productBatches),
    tenantFk("goods_receipt_lines_unit_fk", t.pharmacyId, t.unitId, units),
    check("goods_receipt_lines_qty_positive", sql`${t.qty} > 0 AND ${t.unitFactor} >= 1 AND ${t.qtyBase} = ${t.qty} * ${t.unitFactor}`),
  ],
);

export const purchaseReturns = pgTable(
  "purchase_returns",
  {
    ...tenantColumns(),
    returnNo: text("return_no").notNull(),
    goodsReceiptId: ref("goods_receipt_id").notNull(),
    reason: text("reason"),
    legacyId: legacyId(),
    ...auditColumns(),
  },
  (t) => [
    unique("purchase_returns_tenant_uq").on(t.pharmacyId, t.id),
    unique("purchase_returns_no_uq").on(t.pharmacyId, t.returnNo),
    tenantFk("purchase_returns_receipt_fk", t.pharmacyId, t.goodsReceiptId, goodsReceipts),
  ],
);

export const purchaseReturnLines = pgTable(
  "purchase_return_lines",
  {
    ...tenantColumns(),
    purchaseReturnId: ref("purchase_return_id").notNull(),
    goodsReceiptLineId: ref("goods_receipt_line_id").notNull(),
    qtyBase: integer("qty_base").notNull(),
  },
  (t) => [
    unique("purchase_return_lines_tenant_uq").on(t.pharmacyId, t.id),
    tenantFk("purchase_return_lines_return_fk", t.pharmacyId, t.purchaseReturnId, purchaseReturns),
    tenantFk("purchase_return_lines_receipt_line_fk", t.pharmacyId, t.goodsReceiptLineId, goodsReceiptLines),
    check("purchase_return_lines_qty_positive", sql`${t.qtyBase} > 0`),
  ],
);

// --- Inventory control -------------------------------------------------------------

export const stockAdjustments = pgTable(
  "stock_adjustments",
  {
    ...tenantColumns(),
    batchId: ref("batch_id").notNull(),
    reasonId: ref("reason_id").notNull(),
    // Signed, in base units (legacy PENY_ITEM_JML__ was signed too).
    qtyChange: integer("qty_change").notNull(),
    note: text("note"),
    legacyId: legacyId(),
    ...auditColumns(),
  },
  (t) => [
    unique("stock_adjustments_tenant_uq").on(t.pharmacyId, t.id),
    tenantFk("stock_adjustments_batch_fk", t.pharmacyId, t.batchId, productBatches),
    tenantFk("stock_adjustments_reason_fk", t.pharmacyId, t.reasonId, adjustmentReasons),
    check("stock_adjustments_qty_non_zero", sql`${t.qtyChange} <> 0`),
  ],
);

export const stockOpnameStatus = pgEnum("stock_opname_status", ["pending", "committed"]);

export const stockOpnames = pgTable(
  "stock_opnames",
  {
    ...tenantColumns(),
    opnameNo: text("opname_no").notNull(),
    status: stockOpnameStatus("status").notNull().default("pending"),
    totalDifferenceValue: money("total_difference_value").notNull().default("0"),
    note: text("note"),
    committedAt: timestamptz("committed_at"),
    committedBy: ref("committed_by").references(() => users.id),
    legacyId: legacyId(),
    ...auditColumns(),
  },
  (t) => [unique("stock_opnames_tenant_uq").on(t.pharmacyId, t.id), unique("stock_opnames_no_uq").on(t.pharmacyId, t.opnameNo)],
);

export const stockOpnameLines = pgTable(
  "stock_opname_lines",
  {
    ...tenantColumns(),
    stockOpnameId: ref("stock_opname_id").notNull(),
    batchId: ref("batch_id").notNull(),
    // System quantity when counted; on commit the difference (physical - system) is applied,
    // so sales made between counting and committing are not lost (legacy overwrote stock).
    systemQtyBase: integer("system_qty_base").notNull(),
    physicalQtyBase: integer("physical_qty_base").notNull(),
    unitCost: money("unit_cost").notNull(),
    differenceValue: money("difference_value").notNull(),
    ...auditColumns(),
  },
  (t) => [
    unique("stock_opname_lines_tenant_uq").on(t.pharmacyId, t.id),
    unique("stock_opname_lines_batch_uq").on(t.pharmacyId, t.stockOpnameId, t.batchId),
    tenantFk("stock_opname_lines_opname_fk", t.pharmacyId, t.stockOpnameId, stockOpnames),
    tenantFk("stock_opname_lines_batch_fk", t.pharmacyId, t.batchId, productBatches),
    check("stock_opname_lines_physical_non_negative", sql`${t.physicalQtyBase} >= 0`),
  ],
);

// --- Debts (legacy parity: manual records, not linked to documents) -----------------

export const payables = pgTable(
  "payables",
  {
    ...tenantColumns(),
    supplierId: ref("supplier_id").notNull(),
    amount: money("amount").notNull(),
    paidAmount: money("paid_amount").notNull().default("0"),
    note: text("note"),
    legacyId: legacyId(),
    ...auditColumns(),
  },
  (t) => [
    unique("payables_tenant_uq").on(t.pharmacyId, t.id),
    tenantFk("payables_supplier_fk", t.pharmacyId, t.supplierId, suppliers),
    check("payables_amounts_valid", sql`${t.amount} >= 0 AND ${t.paidAmount} >= 0`),
  ],
);

export const receivables = pgTable(
  "receivables",
  {
    ...tenantColumns(),
    customerId: ref("customer_id").notNull(),
    amount: money("amount").notNull(),
    paidAmount: money("paid_amount").notNull().default("0"),
    note: text("note"),
    legacyId: legacyId(),
    ...auditColumns(),
  },
  (t) => [
    unique("receivables_tenant_uq").on(t.pharmacyId, t.id),
    tenantFk("receivables_customer_fk", t.pharmacyId, t.customerId, customers),
    check("receivables_amounts_valid", sql`${t.amount} >= 0 AND ${t.paidAmount} >= 0`),
  ],
);

// --- Printing ----------------------------------------------------------------------

export const printerType = pgEnum("printer_type", ["thermal_escpos", "standard"]);
export const printerConnection = pgEnum("printer_connection", ["network", "os_printer"]);
export const printJobStatus = pgEnum("print_job_status", ["queued", "printing", "done", "failed"]);

export const printers = pgTable(
  "printers",
  {
    ...tenantColumns(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: printerType("type").notNull(),
    connection: printerConnection("connection").notNull(),
    host: text("host"),
    port: integer("port"),
    osPrinterName: text("os_printer_name"),
    paperWidthMm: integer("paper_width_mm").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns(),
  },
  (t) => [
    unique("printers_tenant_uq").on(t.pharmacyId, t.id),
    unique("printers_code_uq").on(t.pharmacyId, t.code),
    check(
      "printers_connection_fields",
      sql`(${t.connection} = 'network' AND ${t.host} IS NOT NULL) OR (${t.connection} = 'os_printer' AND ${t.osPrinterName} IS NOT NULL)`,
    ),
  ],
);

export const printJobs = pgTable(
  "print_jobs",
  {
    ...tenantColumns(),
    printerId: ref("printer_id").notNull(),
    documentType: text("document_type").notNull(),
    documentId: ref("document_id").notNull(),
    status: printJobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    createdBy: ref("created_by").references(() => users.id),
    printedAt: timestamptz("printed_at"),
    // Set when the worker takes the job; a job stuck in "printing" for too long is put back in the queue.
    claimedAt: timestamptz("claimed_at"),
  },
  (t) => [
    tenantFk("print_jobs_printer_fk", t.pharmacyId, t.printerId, printers),
    index("print_jobs_queue_idx").on(t.pharmacyId, t.status, t.createdAt),
  ],
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
