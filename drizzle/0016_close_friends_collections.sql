CREATE TABLE "close_friends" (
	"owner_id" uuid NOT NULL,
	"friend_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "close_friends_owner_id_friend_id_pk" PRIMARY KEY("owner_id","friend_id")
);
--> statement-breakpoint
CREATE TABLE "collection_items" (
	"collection_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_items_collection_id_post_id_pk" PRIMARY KEY("collection_id","post_id")
);
--> statement-breakpoint
CREATE TABLE "post_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "close_friends" ADD CONSTRAINT "close_friends_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "close_friends" ADD CONSTRAINT "close_friends_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_post_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."post_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_collections" ADD CONSTRAINT "post_collections_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "close_friends_friend_idx" ON "close_friends" USING btree ("friend_id");--> statement-breakpoint
CREATE INDEX "collection_items_post_idx" ON "collection_items" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_collections_owner_idx" ON "post_collections" USING btree ("owner_id");