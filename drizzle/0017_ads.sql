CREATE TABLE "ad_advertisers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"website" text NOT NULL,
	"contact_email" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advertiser_id" uuid NOT NULL,
	"name" text NOT NULL,
	"headline" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"cta_label" text DEFAULT 'Learn more' NOT NULL,
	"destination_url" text NOT NULL,
	"placement" text DEFAULT 'feed' NOT NULL,
	"targeting" jsonb DEFAULT '{"topics":[],"languages":[]}'::jsonb NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"frequency_cap_per_day" integer DEFAULT 2 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"submitted_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_delivery" (
	"campaign_id" uuid NOT NULL,
	"viewer_key" text NOT NULL,
	"day" date NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ad_delivery_campaign_id_viewer_key_day_pk" PRIMARY KEY("campaign_id","viewer_key","day")
);
--> statement-breakpoint
CREATE TABLE "ad_hides" (
	"campaign_id" uuid NOT NULL,
	"viewer_key" text NOT NULL,
	"reason" text DEFAULT 'not_relevant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_hides_campaign_id_viewer_key_pk" PRIMARY KEY("campaign_id","viewer_key")
);
--> statement-breakpoint
ALTER TABLE "ad_advertisers" ADD CONSTRAINT "ad_advertisers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_advertiser_id_ad_advertisers_id_fk" FOREIGN KEY ("advertiser_id") REFERENCES "public"."ad_advertisers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_delivery" ADD CONSTRAINT "ad_delivery_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_hides" ADD CONSTRAINT "ad_hides_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_campaigns_status_idx" ON "ad_campaigns" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "ad_delivery_day_idx" ON "ad_delivery" USING btree ("day");