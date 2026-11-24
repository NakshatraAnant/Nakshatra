ALTER TABLE "posts" ADD COLUMN "image_urls" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "audio_url" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "audio_seconds" integer;