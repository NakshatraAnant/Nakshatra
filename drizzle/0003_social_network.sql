CREATE TABLE "assessment_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"version" text NOT NULL,
	"answers" jsonb NOT NULL,
	"scores" jsonb NOT NULL,
	"archetype_key" text NOT NULL,
	"secondary_key" text,
	"confidence" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circle_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_participants" (
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"allow_reuse" boolean DEFAULT false NOT NULL,
	"share_identity" boolean DEFAULT false NOT NULL,
	"left_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_participants_session_id_user_id_pk" PRIMARY KEY("session_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_key" text NOT NULL,
	"game_version" integer NOT NULL,
	"circle_id" uuid,
	"host_id" uuid NOT NULL,
	"status" text DEFAULT 'lobby' NOT NULL,
	"round_index" integer DEFAULT -1 NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"round_index" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ritual_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ritual_key" text NOT NULL,
	"period_key" text NOT NULL,
	"circle_key" text DEFAULT '' NOT NULL,
	"prompt_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "pseudonym" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "identity_labels" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "card_style" text DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "theme" text DEFAULT 'dusk' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "invite_policy" text DEFAULT 'members' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "pseudonymous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "decision_reason" text;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "reward_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_invites" ADD CONSTRAINT "circle_invites_circle_id_groups_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_invites" ADD CONSTRAINT "circle_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_circle_id_groups_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_submissions" ADD CONSTRAINT "game_submissions_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_submissions" ADD CONSTRAINT "game_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ritual_responses" ADD CONSTRAINT "ritual_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessment_user_idx" ON "assessment_results" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "circle_invites_token_uq" ON "circle_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "circle_invites_circle_idx" ON "circle_invites" USING btree ("circle_id");--> statement-breakpoint
CREATE INDEX "game_participants_user_idx" ON "game_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "game_sessions_circle_idx" ON "game_sessions" USING btree ("circle_id","created_at");--> statement-breakpoint
CREATE INDEX "game_sessions_host_idx" ON "game_sessions" USING btree ("host_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_submissions_uq" ON "game_submissions" USING btree ("session_id","round_index","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ritual_responses_uq" ON "ritual_responses" USING btree ("user_id","ritual_key","period_key","circle_key");--> statement-breakpoint
CREATE INDEX "ritual_responses_prompt_idx" ON "ritual_responses" USING btree ("ritual_key","period_key","circle_key");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_pseudonym_uq" ON "profiles" USING btree (lower("pseudonym"));--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrer_id","status");