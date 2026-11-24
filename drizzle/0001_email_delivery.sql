ALTER TABLE "email_outbox" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "email_outbox_status_idx" ON "email_outbox" USING btree ("status","created_at");