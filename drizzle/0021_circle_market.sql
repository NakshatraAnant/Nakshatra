CREATE TABLE "circle_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_paise" integer,
	"condition" text,
	"image_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_interests" (
	"listing_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_interests_listing_id_user_id_pk" PRIMARY KEY("listing_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "listing_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "circle_listings" ADD CONSTRAINT "circle_listings_circle_id_groups_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_listings" ADD CONSTRAINT "circle_listings_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_interests" ADD CONSTRAINT "listing_interests_listing_id_circle_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."circle_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_interests" ADD CONSTRAINT "listing_interests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_messages" ADD CONSTRAINT "listing_messages_listing_id_circle_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."circle_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_messages" ADD CONSTRAINT "listing_messages_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_messages" ADD CONSTRAINT "listing_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "circle_listings_circle_idx" ON "circle_listings" USING btree ("circle_id","status","created_at");--> statement-breakpoint
CREATE INDEX "circle_listings_seller_idx" ON "circle_listings" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "listing_messages_thread_idx" ON "listing_messages" USING btree ("listing_id","buyer_id","created_at");