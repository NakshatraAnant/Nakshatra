CREATE TABLE "pen_mutes" (
	"muter_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"pen_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pen_mutes_muter_id_author_id_pk" PRIMARY KEY("muter_id","author_id")
);
--> statement-breakpoint
CREATE TABLE "gift_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"purchaser_id" uuid NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_user_id" uuid,
	"message" text DEFAULT '' NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"entitlement_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"user_id" uuid,
	"archetype_key" text NOT NULL,
	"secondary_key" text,
	"scores" jsonb NOT NULL,
	"card_style" text DEFAULT 'classic' NOT NULL,
	"display_name" text,
	"referral_code" text,
	"views" integer DEFAULT 0 NOT NULL,
	"signups" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "as_pseudonym" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "pen_name" text;--> statement-breakpoint
ALTER TABLE "pen_mutes" ADD CONSTRAINT "pen_mutes_muter_id_users_id_fk" FOREIGN KEY ("muter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pen_mutes" ADD CONSTRAINT "pen_mutes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_claims" ADD CONSTRAINT "gift_claims_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_claims" ADD CONSTRAINT "gift_claims_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_claims" ADD CONSTRAINT "gift_claims_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_claims" ADD CONSTRAINT "gift_claims_purchaser_id_users_id_fk" FOREIGN KEY ("purchaser_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_claims" ADD CONSTRAINT "gift_claims_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_shares" ADD CONSTRAINT "identity_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gift_claims_item_uq" ON "gift_claims" USING btree ("order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gift_claims_token_uq" ON "gift_claims" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "gift_claims_recipient_idx" ON "gift_claims" USING btree ("recipient_email","status");--> statement-breakpoint
CREATE INDEX "gift_claims_purchaser_idx" ON "gift_claims" USING btree ("purchaser_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_shares_slug_uq" ON "identity_shares" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "identity_shares_user_idx" ON "identity_shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "blocks_blocked_idx" ON "blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "comments_author_idx" ON "comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "mutes_muted_idx" ON "mutes" USING btree ("muted_id");--> statement-breakpoint
CREATE INDEX "posts_group_created_idx" ON "posts" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id","status");