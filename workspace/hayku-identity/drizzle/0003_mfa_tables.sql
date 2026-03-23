CREATE TABLE "mfa_totp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"secret" varchar(255) NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mfa_totp_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "mfa_pending" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pending_token" varchar(255) NOT NULL,
	"user_id" uuid NOT NULL,
	"oidc_params" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mfa_pending_pending_token_unique" UNIQUE("pending_token")
);
--> statement-breakpoint
ALTER TABLE "mfa_totp" ADD CONSTRAINT "mfa_totp_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_pending" ADD CONSTRAINT "mfa_pending_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mfa_pending_token" ON "mfa_pending" USING btree ("pending_token");--> statement-breakpoint
CREATE INDEX "idx_mfa_pending_expires" ON "mfa_pending" USING btree ("expires_at");
