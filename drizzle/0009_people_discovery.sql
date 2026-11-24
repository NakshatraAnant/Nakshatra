ALTER TABLE "profiles" ADD COLUMN "discoverable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "connection_intents" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX "profiles_discoverable_idx" ON "profiles" USING btree ("discoverable");