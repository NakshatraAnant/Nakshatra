CREATE TABLE "student_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"institution" text NOT NULL,
	"email_domain" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"reviewer_id" uuid,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"user_id" uuid,
	"invite_token_hash" text,
	"invite_expires_at" timestamp with time zone,
	"joined_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "seats" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "eligibility" text DEFAULT 'anyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "seat_cap" integer;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "founding" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "locked_price_paise" integer;--> statement-breakpoint
ALTER TABLE "student_verifications" ADD CONSTRAINT "student_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_members" ADD CONSTRAINT "subscription_members_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_members" ADD CONSTRAINT "subscription_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_verifications_user_idx" ON "student_verifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "student_verifications_status_idx" ON "student_verifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscription_members_sub_idx" ON "subscription_members" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_members_user_idx" ON "subscription_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_members_token_uq" ON "subscription_members" USING btree ("invite_token_hash");