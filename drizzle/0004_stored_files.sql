CREATE TABLE "stored_files" (
	"path" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"is_private" boolean NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
