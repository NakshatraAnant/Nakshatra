CREATE TABLE "quest_claims" (
	"user_id" uuid NOT NULL,
	"quest_key" text NOT NULL,
	"period_key" text NOT NULL,
	"xp" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quest_claims_user_id_quest_key_period_key_pk" PRIMARY KEY("user_id","quest_key","period_key")
);
--> statement-breakpoint
CREATE TABLE "season_claims" (
	"user_id" uuid NOT NULL,
	"season_key" text NOT NULL,
	"milestone" integer NOT NULL,
	"track" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_claims_user_id_season_key_track_milestone_pk" PRIMARY KEY("user_id","season_key","track","milestone")
);
--> statement-breakpoint
CREATE TABLE "vibe_checkins" (
	"user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"mood" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vibe_checkins_user_id_local_date_pk" PRIMARY KEY("user_id","local_date")
);
--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD COLUMN "meta" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD COLUMN "reverses_id" uuid;--> statement-breakpoint
ALTER TABLE "quest_claims" ADD CONSTRAINT "quest_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_claims" ADD CONSTRAINT "season_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vibe_checkins" ADD CONSTRAINT "vibe_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "xp_reverses_uq" ON "xp_ledger" USING btree ("reverses_id");