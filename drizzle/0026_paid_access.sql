CREATE TABLE "creator_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circle_tier_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"tier_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_id" uuid,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_offerings" ADD COLUMN "unlock_content" text;--> statement-breakpoint
ALTER TABLE "creator_offerings" ADD COLUMN "unlock_link" text;--> statement-breakpoint
ALTER TABLE "circle_member_tiers" ADD COLUMN "source" text DEFAULT 'assigned' NOT NULL;--> statement-breakpoint
ALTER TABLE "circle_member_tiers" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "circle_tiers" ADD COLUMN "price_paise" integer;--> statement-breakpoint
ALTER TABLE "creator_purchases" ADD CONSTRAINT "creator_purchases_offering_id_creator_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."creator_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_purchases" ADD CONSTRAINT "creator_purchases_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_purchases" ADD CONSTRAINT "creator_purchases_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_purchases" ADD CONSTRAINT "creator_purchases_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_tier_purchases" ADD CONSTRAINT "circle_tier_purchases_circle_id_groups_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_tier_purchases" ADD CONSTRAINT "circle_tier_purchases_tier_id_circle_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."circle_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_tier_purchases" ADD CONSTRAINT "circle_tier_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_purchases_buyer_idx" ON "creator_purchases" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "creator_purchases_offering_idx" ON "creator_purchases" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "circle_tier_purchases_user_idx" ON "circle_tier_purchases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "circle_tier_purchases_circle_idx" ON "circle_tier_purchases" USING btree ("circle_id");