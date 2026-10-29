CREATE TYPE "public"."membership_role" AS ENUM('owner', 'admin', 'pharmacist', 'cashier');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('cash', 'non_cash');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TYPE "public"."print_job_status" AS ENUM('queued', 'printing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."printer_connection" AS ENUM('network', 'os_printer');--> statement-breakpoint
CREATE TYPE "public"."printer_type" AS ENUM('thermal_escpos', 'standard');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('open', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sale_status" AS ENUM('pending', 'committed', 'void');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('opening_balance', 'goods_receipt', 'purchase_return', 'sale', 'sales_return', 'adjustment', 'stock_opname');--> statement-breakpoint
CREATE TYPE "public"."stock_opname_status" AS ENUM('pending', 'committed');--> statement-breakpoint
CREATE TABLE "adjustment_reasons" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "adjustment_reasons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "adjustment_reasons_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "adjustment_reasons_name_uq" UNIQUE("pharmacy_id","name")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "categories_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "categories_name_uq" UNIQUE("pharmacy_id","name")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "customers_tenant_uq" UNIQUE("pharmacy_id","id")
);
--> statement-breakpoint
CREATE TABLE "document_counters" (
	"pharmacy_id" bigint NOT NULL,
	"doc_type" text NOT NULL,
	"period" text NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "document_counters_pharmacy_id_doc_type_period_pk" PRIMARY KEY("pharmacy_id","doc_type","period")
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "goods_receipt_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"goods_receipt_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"batch_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"unit_factor" integer NOT NULL,
	"qty" integer NOT NULL,
	"qty_base" integer NOT NULL,
	"unit_price" numeric(15, 2) NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "goods_receipt_lines_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "goods_receipt_lines_qty_positive" CHECK ("goods_receipt_lines"."qty" > 0 AND "goods_receipt_lines"."unit_factor" >= 1 AND "goods_receipt_lines"."qty_base" = "goods_receipt_lines"."qty" * "goods_receipt_lines"."unit_factor")
);
--> statement-breakpoint
CREATE TABLE "goods_receipts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "goods_receipts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"purchase_order_id" bigint NOT NULL,
	"supplier_invoice_no" text NOT NULL,
	"grand_total" numeric(15, 2) NOT NULL,
	"note" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "goods_receipts_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "goods_receipts_po_uq" UNIQUE("pharmacy_id","purchase_order_id")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "memberships_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"pharmacy_id" bigint NOT NULL,
	"role" "membership_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_pharmacy_uq" UNIQUE("user_id","pharmacy_id")
);
--> statement-breakpoint
CREATE TABLE "payables" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payables_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"supplier_id" bigint NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"paid_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "payables_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "payables_amounts_valid" CHECK ("payables"."amount" >= 0 AND "payables"."paid_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_methods_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"name" text NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "payment_methods_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "payment_methods_name_uq" UNIQUE("pharmacy_id","name")
);
--> statement-breakpoint
CREATE TABLE "pharmacies" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pharmacies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"buy_price_markup_pct" numeric(5, 2) DEFAULT '10.00' NOT NULL,
	"expiry_warning_days" integer DEFAULT 90 NOT NULL,
	"receipt_header" text,
	"receipt_footer" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pharmacies_code_unique" UNIQUE("code"),
	CONSTRAINT "pharmacies_markup_non_negative" CHECK ("pharmacies"."buy_price_markup_pct" >= 0)
);
--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "print_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"printer_id" bigint NOT NULL,
	"document_type" text NOT NULL,
	"document_id" bigint NOT NULL,
	"status" "print_job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"printed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "printers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "printers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "printer_type" NOT NULL,
	"connection" "printer_connection" NOT NULL,
	"host" text,
	"port" integer,
	"os_printer_name" text,
	"paper_width_mm" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "printers_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "printers_code_uq" UNIQUE("pharmacy_id","code"),
	CONSTRAINT "printers_connection_fields" CHECK (("printers"."connection" = 'network' AND "printers"."host" IS NOT NULL) OR ("printers"."connection" = 'os_printer' AND "printers"."os_printer_name" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "product_batches" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_batches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"batch_no" text NOT NULL,
	"expiry_date" date,
	"unit_cost" numeric(15, 2) NOT NULL,
	"qty_on_hand" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "product_batches_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "product_batches_batch_uq" UNIQUE("pharmacy_id","product_id","batch_no"),
	CONSTRAINT "product_batches_qty_non_negative" CHECK ("product_batches"."qty_on_hand" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_statuses" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_statuses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "product_statuses_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "product_statuses_name_uq" UNIQUE("pharmacy_id","name")
);
--> statement-breakpoint
CREATE TABLE "product_units" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_units_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"factor" integer NOT NULL,
	"sell_price" numeric(15, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "product_units_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "product_units_product_unit_uq" UNIQUE("pharmacy_id","product_id","unit_id"),
	CONSTRAINT "product_units_factor_gt_one" CHECK ("product_units"."factor" > 1)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category_id" bigint NOT NULL,
	"status_id" bigint NOT NULL,
	"base_unit_id" bigint NOT NULL,
	"base_cost" numeric(15, 2) NOT NULL,
	"buy_price" numeric(15, 2) NOT NULL,
	"margin_pct" numeric(5, 2) NOT NULL,
	"recommended_price" numeric(15, 2) NOT NULL,
	"sell_price" numeric(15, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "products_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "products_code_uq" UNIQUE("pharmacy_id","code"),
	CONSTRAINT "products_prices_non_negative" CHECK ("products"."base_cost" >= 0 AND "products"."buy_price" >= 0 AND "products"."recommended_price" >= 0 AND "products"."sell_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchase_order_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"purchase_order_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"unit_factor" integer NOT NULL,
	"qty" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "purchase_order_lines_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "purchase_order_lines_qty_positive" CHECK ("purchase_order_lines"."qty" > 0 AND "purchase_order_lines"."unit_factor" >= 1)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchase_orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"po_no" text NOT NULL,
	"supplier_id" bigint NOT NULL,
	"status" "purchase_order_status" DEFAULT 'open' NOT NULL,
	"note" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "purchase_orders_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "purchase_orders_no_uq" UNIQUE("pharmacy_id","po_no")
);
--> statement-breakpoint
CREATE TABLE "purchase_return_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchase_return_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"purchase_return_id" bigint NOT NULL,
	"goods_receipt_line_id" bigint NOT NULL,
	"qty_base" integer NOT NULL,
	CONSTRAINT "purchase_return_lines_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "purchase_return_lines_qty_positive" CHECK ("purchase_return_lines"."qty_base" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_returns" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchase_returns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"return_no" text NOT NULL,
	"goods_receipt_id" bigint NOT NULL,
	"reason" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "purchase_returns_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "purchase_returns_no_uq" UNIQUE("pharmacy_id","return_no")
);
--> statement-breakpoint
CREATE TABLE "receivables" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "receivables_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"customer_id" bigint NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"paid_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "receivables_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "receivables_amounts_valid" CHECK ("receivables"."amount" >= 0 AND "receivables"."paid_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sale_line_allocations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sale_line_allocations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"sale_line_id" bigint NOT NULL,
	"batch_id" bigint NOT NULL,
	"qty_base" integer NOT NULL,
	"unit_cost" numeric(15, 2) NOT NULL,
	CONSTRAINT "sale_line_allocations_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "sale_line_allocations_qty_positive" CHECK ("sale_line_allocations"."qty_base" > 0)
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sale_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"sale_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"unit_factor" integer NOT NULL,
	"qty" integer NOT NULL,
	"qty_base" integer NOT NULL,
	"unit_price" numeric(15, 2) NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "sale_lines_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "sale_lines_qty_positive" CHECK ("sale_lines"."qty" > 0 AND "sale_lines"."unit_factor" >= 1 AND "sale_lines"."qty_base" = "sale_lines"."qty" * "sale_lines"."unit_factor"),
	CONSTRAINT "sale_lines_discount_range" CHECK ("sale_lines"."discount_pct" >= 0 AND "sale_lines"."discount_pct" <= 100)
);
--> statement-breakpoint
CREATE TABLE "sale_payments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sale_payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"sale_id" bigint NOT NULL,
	"payment_method_id" bigint NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"reference_no" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "sale_payments_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "sale_payments_amount_positive" CHECK ("sale_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sales_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"receipt_no" text,
	"status" "sale_status" DEFAULT 'pending' NOT NULL,
	"customer_id" bigint,
	"customer_name" text,
	"subtotal" numeric(15, 2) DEFAULT '0' NOT NULL,
	"discount_total" numeric(15, 2) DEFAULT '0' NOT NULL,
	"grand_total" numeric(15, 2) DEFAULT '0' NOT NULL,
	"paid_total" numeric(15, 2) DEFAULT '0' NOT NULL,
	"change_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"committed_at" timestamp with time zone,
	"committed_by" bigint,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "sales_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "sales_receipt_no_uq" UNIQUE("pharmacy_id","receipt_no"),
	CONSTRAINT "sales_committed_has_receipt" CHECK ("sales"."status" <> 'committed' OR ("sales"."receipt_no" IS NOT NULL AND "sales"."committed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "sales_return_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sales_return_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"sales_return_id" bigint NOT NULL,
	"sale_line_allocation_id" bigint NOT NULL,
	"qty_base" integer NOT NULL,
	"refund_amount" numeric(15, 2) NOT NULL,
	CONSTRAINT "sales_return_lines_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "sales_return_lines_qty_positive" CHECK ("sales_return_lines"."qty_base" > 0)
);
--> statement-breakpoint
CREATE TABLE "sales_returns" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sales_returns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"return_no" text NOT NULL,
	"sale_id" bigint NOT NULL,
	"reason" text,
	"total_refund" numeric(15, 2) NOT NULL,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "sales_returns_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "sales_returns_no_uq" UNIQUE("pharmacy_id","return_no")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"pharmacy_id" bigint,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_adjustments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"batch_id" bigint NOT NULL,
	"reason_id" bigint NOT NULL,
	"qty_change" integer NOT NULL,
	"note" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "stock_adjustments_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "stock_adjustments_qty_non_zero" CHECK ("stock_adjustments"."qty_change" <> 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_movements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"batch_id" bigint NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"qty_change" integer NOT NULL,
	"document_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	CONSTRAINT "stock_movements_qty_non_zero" CHECK ("stock_movements"."qty_change" <> 0)
);
--> statement-breakpoint
CREATE TABLE "stock_opname_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_opname_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"stock_opname_id" bigint NOT NULL,
	"batch_id" bigint NOT NULL,
	"system_qty_base" integer NOT NULL,
	"physical_qty_base" integer NOT NULL,
	"unit_cost" numeric(15, 2) NOT NULL,
	"difference_value" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "stock_opname_lines_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "stock_opname_lines_batch_uq" UNIQUE("pharmacy_id","stock_opname_id","batch_id"),
	CONSTRAINT "stock_opname_lines_physical_non_negative" CHECK ("stock_opname_lines"."physical_qty_base" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_opnames" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_opnames_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"opname_no" text NOT NULL,
	"status" "stock_opname_status" DEFAULT 'pending' NOT NULL,
	"total_difference_value" numeric(15, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"committed_at" timestamp with time zone,
	"committed_by" bigint,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "stock_opnames_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "stock_opnames_no_uq" UNIQUE("pharmacy_id","opname_no")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "suppliers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "suppliers_tenant_uq" UNIQUE("pharmacy_id","id")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "units_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pharmacy_id" bigint NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "units_tenant_uq" UNIQUE("pharmacy_id","id"),
	CONSTRAINT "units_name_uq" UNIQUE("pharmacy_id","name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"username" text NOT NULL,
	"full_name" text NOT NULL,
	"password_hash" text,
	"legacy_password_sha1" text,
	"legacy_password_salt" text,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "adjustment_reasons" ADD CONSTRAINT "adjustment_reasons_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustment_reasons" ADD CONSTRAINT "adjustment_reasons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustment_reasons" ADD CONSTRAINT "adjustment_reasons_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receipt_fk" FOREIGN KEY ("pharmacy_id","goods_receipt_id") REFERENCES "public"."goods_receipts"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_product_fk" FOREIGN KEY ("pharmacy_id","product_id") REFERENCES "public"."products"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_batch_fk" FOREIGN KEY ("pharmacy_id","batch_id") REFERENCES "public"."product_batches"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_unit_fk" FOREIGN KEY ("pharmacy_id","unit_id") REFERENCES "public"."units"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_po_fk" FOREIGN KEY ("pharmacy_id","purchase_order_id") REFERENCES "public"."purchase_orders"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplier_fk" FOREIGN KEY ("pharmacy_id","supplier_id") REFERENCES "public"."suppliers"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printer_fk" FOREIGN KEY ("pharmacy_id","printer_id") REFERENCES "public"."printers"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printers" ADD CONSTRAINT "printers_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printers" ADD CONSTRAINT "printers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printers" ADD CONSTRAINT "printers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_product_fk" FOREIGN KEY ("pharmacy_id","product_id") REFERENCES "public"."products"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_statuses" ADD CONSTRAINT "product_statuses_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_statuses" ADD CONSTRAINT "product_statuses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_statuses" ADD CONSTRAINT "product_statuses_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_product_fk" FOREIGN KEY ("pharmacy_id","product_id") REFERENCES "public"."products"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_unit_fk" FOREIGN KEY ("pharmacy_id","unit_id") REFERENCES "public"."units"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_fk" FOREIGN KEY ("pharmacy_id","category_id") REFERENCES "public"."categories"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_status_fk" FOREIGN KEY ("pharmacy_id","status_id") REFERENCES "public"."product_statuses"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_base_unit_fk" FOREIGN KEY ("pharmacy_id","base_unit_id") REFERENCES "public"."units"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_po_fk" FOREIGN KEY ("pharmacy_id","purchase_order_id") REFERENCES "public"."purchase_orders"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_fk" FOREIGN KEY ("pharmacy_id","product_id") REFERENCES "public"."products"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_unit_fk" FOREIGN KEY ("pharmacy_id","unit_id") REFERENCES "public"."units"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_fk" FOREIGN KEY ("pharmacy_id","supplier_id") REFERENCES "public"."suppliers"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_return_lines" ADD CONSTRAINT "purchase_return_lines_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_return_lines" ADD CONSTRAINT "purchase_return_lines_return_fk" FOREIGN KEY ("pharmacy_id","purchase_return_id") REFERENCES "public"."purchase_returns"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_return_lines" ADD CONSTRAINT "purchase_return_lines_receipt_line_fk" FOREIGN KEY ("pharmacy_id","goods_receipt_line_id") REFERENCES "public"."goods_receipt_lines"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_receipt_fk" FOREIGN KEY ("pharmacy_id","goods_receipt_id") REFERENCES "public"."goods_receipts"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_customer_fk" FOREIGN KEY ("pharmacy_id","customer_id") REFERENCES "public"."customers"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line_allocations" ADD CONSTRAINT "sale_line_allocations_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line_allocations" ADD CONSTRAINT "sale_line_allocations_line_fk" FOREIGN KEY ("pharmacy_id","sale_line_id") REFERENCES "public"."sale_lines"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line_allocations" ADD CONSTRAINT "sale_line_allocations_batch_fk" FOREIGN KEY ("pharmacy_id","batch_id") REFERENCES "public"."product_batches"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_fk" FOREIGN KEY ("pharmacy_id","sale_id") REFERENCES "public"."sales"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_product_fk" FOREIGN KEY ("pharmacy_id","product_id") REFERENCES "public"."products"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_unit_fk" FOREIGN KEY ("pharmacy_id","unit_id") REFERENCES "public"."units"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_fk" FOREIGN KEY ("pharmacy_id","sale_id") REFERENCES "public"."sales"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_method_fk" FOREIGN KEY ("pharmacy_id","payment_method_id") REFERENCES "public"."payment_methods"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_committed_by_users_id_fk" FOREIGN KEY ("committed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_fk" FOREIGN KEY ("pharmacy_id","customer_id") REFERENCES "public"."customers"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_return_lines" ADD CONSTRAINT "sales_return_lines_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_return_lines" ADD CONSTRAINT "sales_return_lines_return_fk" FOREIGN KEY ("pharmacy_id","sales_return_id") REFERENCES "public"."sales_returns"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_return_lines" ADD CONSTRAINT "sales_return_lines_alloc_fk" FOREIGN KEY ("pharmacy_id","sale_line_allocation_id") REFERENCES "public"."sale_line_allocations"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_sale_fk" FOREIGN KEY ("pharmacy_id","sale_id") REFERENCES "public"."sales"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_batch_fk" FOREIGN KEY ("pharmacy_id","batch_id") REFERENCES "public"."product_batches"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_reason_fk" FOREIGN KEY ("pharmacy_id","reason_id") REFERENCES "public"."adjustment_reasons"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_fk" FOREIGN KEY ("pharmacy_id","product_id") REFERENCES "public"."products"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_fk" FOREIGN KEY ("pharmacy_id","batch_id") REFERENCES "public"."product_batches"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_opname_lines" ADD CONSTRAINT "stock_opname_lines_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_opname_lines" ADD CONSTRAINT "stock_opname_lines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_opname_lines" ADD CONSTRAINT "stock_opname_lines_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_opname_lines" ADD CONSTRAINT "stock_opname_lines_opname_fk" FOREIGN KEY ("pharmacy_id","stock_opname_id") REFERENCES "public"."stock_opnames"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_opname_lines" ADD CONSTRAINT "stock_opname_lines_batch_fk" FOREIGN KEY ("pharmacy_id","batch_id") REFERENCES "public"."product_batches"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_opnames" ADD CONSTRAINT "stock_opnames_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_opnames" ADD CONSTRAINT "stock_opnames_committed_by_users_id_fk" FOREIGN KEY ("committed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_opnames" ADD CONSTRAINT "stock_opnames_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_opnames" ADD CONSTRAINT "stock_opnames_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "print_jobs_queue_idx" ON "print_jobs" USING btree ("pharmacy_id","status","created_at");--> statement-breakpoint
CREATE INDEX "product_batches_fefo_idx" ON "product_batches" USING btree ("pharmacy_id","product_id","expiry_date");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("pharmacy_id","name");--> statement-breakpoint
CREATE INDEX "sales_committed_at_idx" ON "sales" USING btree ("pharmacy_id","committed_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("pharmacy_id","product_id","created_at");