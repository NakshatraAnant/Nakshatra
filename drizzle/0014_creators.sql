CREATE TABLE "creator_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"gross_paise" integer NOT NULL,
	"fee_paise" integer NOT NULL,
	"net_paise" integer NOT NULL,
	"status" text DEFAULT 'held' NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_offering_interests" (
	"offering_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_offering_interests_offering_id_user_id_pk" PRIMARY KEY("offering_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "creator_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_paise" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"featured_post_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"tips_enabled" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_tips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"show_on_wall" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_ledger" ADD CONSTRAINT "creator_ledger_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_offering_interests" ADD CONSTRAINT "creator_offering_interests_offering_id_creator_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."creator_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_offering_interests" ADD CONSTRAINT "creator_offering_interests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_offerings" ADD CONSTRAINT "creator_offerings_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_tips" ADD CONSTRAINT "creator_tips_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_tips" ADD CONSTRAINT "creator_tips_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_tips" ADD CONSTRAINT "creator_tips_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creator_ledger_source_uq" ON "creator_ledger" USING btree ("kind","source_id");--> statement-breakpoint
CREATE INDEX "creator_ledger_creator_idx" ON "creator_ledger" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "creator_offerings_creator_idx" ON "creator_offerings" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "creator_profiles_status_idx" ON "creator_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "creator_tips_creator_idx" ON "creator_tips" USING btree ("creator_id","created_at");--> statement-breakpoint
CREATE INDEX "creator_tips_from_idx" ON "creator_tips" USING btree ("from_user_id","created_at");