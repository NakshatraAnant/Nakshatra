CREATE TABLE "ad_participation" (
	"campaign_id" uuid NOT NULL,
	"viewer_key" text NOT NULL,
	"kind" text NOT NULL,
	"score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_participation_campaign_id_viewer_key_kind_pk" PRIMARY KEY("campaign_id","viewer_key","kind")
);
--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "content" jsonb;--> statement-breakpoint
ALTER TABLE "ad_participation" ADD CONSTRAINT "ad_participation_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;