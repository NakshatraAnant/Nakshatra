CREATE TABLE "collab_drops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"opening" text NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"post_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collab_members" (
	"collab_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"line" text DEFAULT '' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "collab_members_collab_id_user_id_pk" PRIMARY KEY("collab_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "environment" text DEFAULT 'observatory' NOT NULL;--> statement-breakpoint
ALTER TABLE "collab_drops" ADD CONSTRAINT "collab_drops_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_members" ADD CONSTRAINT "collab_members_collab_id_collab_drops_id_fk" FOREIGN KEY ("collab_id") REFERENCES "public"."collab_drops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_members" ADD CONSTRAINT "collab_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collab_drops_owner_idx" ON "collab_drops" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "collab_members_user_idx" ON "collab_members" USING btree ("user_id","status");