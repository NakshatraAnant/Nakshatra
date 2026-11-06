CREATE TABLE "cod_order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_id" uuid,
	"actor_kind" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cod_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"variant_name" text NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cod_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"shipping_paise" integer NOT NULL,
	"total_paise" integer NOT NULL,
	"address" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"courier_name" text,
	"tracking_ref" text,
	"cash_collected_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"refund_note" text,
	"return_reason" text,
	"cancel_reason" text,
	"delivered_at" timestamp with time zone,
	"placed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merch_inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"order_id" uuid,
	"actor_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merch_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merch_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"price_paise" integer NOT NULL,
	"stock_on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cod_order_events" ADD CONSTRAINT "cod_order_events_order_id_cod_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."cod_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_order_items" ADD CONSTRAINT "cod_order_items_order_id_cod_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."cod_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_order_items" ADD CONSTRAINT "cod_order_items_variant_id_merch_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."merch_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_orders" ADD CONSTRAINT "cod_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_inventory_movements" ADD CONSTRAINT "merch_inventory_movements_variant_id_merch_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."merch_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_variants" ADD CONSTRAINT "merch_variants_product_id_merch_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."merch_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cod_order_events_order_idx" ON "cod_order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "cod_order_items_order_idx" ON "cod_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cod_orders_number_uq" ON "cod_orders" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "cod_orders_idem_uq" ON "cod_orders" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cod_orders_user_idx" ON "cod_orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "cod_orders_status_idx" ON "cod_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "merch_movements_variant_idx" ON "merch_inventory_movements" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merch_products_slug_uq" ON "merch_products" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "merch_variants_sku_uq" ON "merch_variants" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "merch_variants_product_idx" ON "merch_variants" USING btree ("product_id");