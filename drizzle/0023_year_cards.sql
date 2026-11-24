CREATE TABLE "year_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"user_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"facts" jsonb NOT NULL,
	"display_name" text,
	"views" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "year_cards" ADD CONSTRAINT "year_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "year_cards_slug_uq" ON "year_cards" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "year_cards_user_idx" ON "year_cards" USING btree ("user_id");