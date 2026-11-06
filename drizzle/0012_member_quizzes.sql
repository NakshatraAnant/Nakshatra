CREATE TABLE "member_quiz_attempts" (
	"quiz_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"score" integer NOT NULL,
	"outcome" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_quiz_attempts_quiz_id_user_id_pk" PRIMARY KEY("quiz_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "member_quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"definition" jsonb NOT NULL,
	"visibility" text DEFAULT 'members' NOT NULL,
	"group_id" uuid,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_quiz_attempts" ADD CONSTRAINT "member_quiz_attempts_quiz_id_member_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."member_quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_quiz_attempts" ADD CONSTRAINT "member_quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_quizzes" ADD CONSTRAINT "member_quizzes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_quizzes" ADD CONSTRAINT "member_quizzes_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_quizzes_author_idx" ON "member_quizzes" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "member_quizzes_group_idx" ON "member_quizzes" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "member_quizzes_created_idx" ON "member_quizzes" USING btree ("created_at");