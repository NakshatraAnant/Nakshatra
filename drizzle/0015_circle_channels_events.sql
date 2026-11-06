CREATE TABLE "circle_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'discussion' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circle_report_reviews" (
	"report_id" uuid PRIMARY KEY NOT NULL,
	"circle_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circle_timeouts" (
	"circle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circle_timeouts_circle_id_user_id_pk" PRIMARY KEY("circle_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "event_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"mode" text NOT NULL,
	"location" text,
	"live_url" text,
	"capacity" integer,
	"frequency" text NOT NULL,
	"first_starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"timezone" text NOT NULL,
	"until" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "channel_id" uuid;--> statement-breakpoint
ALTER TABLE "circle_channels" ADD CONSTRAINT "circle_channels_circle_id_groups_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_channels" ADD CONSTRAINT "circle_channels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_report_reviews" ADD CONSTRAINT "circle_report_reviews_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_report_reviews" ADD CONSTRAINT "circle_report_reviews_circle_id_groups_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_timeouts" ADD CONSTRAINT "circle_timeouts_circle_id_groups_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_timeouts" ADD CONSTRAINT "circle_timeouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_series" ADD CONSTRAINT "event_series_circle_id_groups_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_series" ADD CONSTRAINT "event_series_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "circle_channels_circle_idx" ON "circle_channels" USING btree ("circle_id");--> statement-breakpoint
CREATE INDEX "circle_report_reviews_circle_idx" ON "circle_report_reviews" USING btree ("circle_id");--> statement-breakpoint
CREATE INDEX "event_series_circle_idx" ON "event_series" USING btree ("circle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_series_occurrence_uq" ON "events" USING btree ("series_id","starts_at");--> statement-breakpoint
CREATE INDEX "events_group_idx" ON "events" USING btree ("group_id","starts_at");--> statement-breakpoint
CREATE INDEX "posts_channel_idx" ON "posts" USING btree ("group_id","channel_id","created_at");