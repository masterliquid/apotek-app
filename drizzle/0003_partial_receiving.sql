ALTER TYPE "public"."purchase_order_status" ADD VALUE 'partial';--> statement-breakpoint
ALTER TYPE "public"."purchase_order_status" ADD VALUE 'closed';--> statement-breakpoint
ALTER TABLE "goods_receipts" DROP CONSTRAINT "goods_receipts_po_uq";--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD COLUMN "purchase_order_line_id" bigint;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD COLUMN "receipt_no" text;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_po_line_fk" FOREIGN KEY ("pharmacy_id","purchase_order_line_id") REFERENCES "public"."purchase_order_lines"("pharmacy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goods_receipt_lines_po_line_idx" ON "goods_receipt_lines" USING btree ("pharmacy_id","purchase_order_line_id");--> statement-breakpoint
CREATE INDEX "goods_receipts_po_idx" ON "goods_receipts" USING btree ("pharmacy_id","purchase_order_id");--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_no_uq" UNIQUE("pharmacy_id","receipt_no");