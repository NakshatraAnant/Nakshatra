CREATE TABLE "circle_member_tiers" (
	"circle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tier_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circle_member_tiers_circle_id_user_id_pk" PRIMARY KEY("circle_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "circle_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text DEFAULT 'saffron' NOT NULL,
	"position" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "circle_channels" ADD COLUMN "tier_id" uuid;--> statement-breakpoint
ALTER TABLE "circle_member_tiers" ADD CONSTRAINT "circle_member_tiers_circle_id_groups_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_member_tiers" ADD CONSTRAINT "circle_member_tiers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_member_tiers" ADD CONSTRAINT "circle_member_tiers_tier_id_circle_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."circle_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_tiers" ADD CONSTRAINT "circle_tiers_circle_id_groups_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "circle_tiers_circle_idx" ON "circle_tiers" USING btree ("circle_id");