CREATE TABLE "org_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"require_domain" boolean DEFAULT false NOT NULL,
	"max_uses" integer DEFAULT 50 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_members" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"include_in_aggregate" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_members_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"email_domain" text,
	"seat_limit" integer DEFAULT 50 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_invites_token_uq" ON "org_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "org_members_user_idx" ON "org_members" USING btree ("user_id");