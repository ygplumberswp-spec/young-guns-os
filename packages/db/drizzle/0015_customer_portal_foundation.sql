CREATE TABLE "portal_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_user_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_user_permissions" ADD CONSTRAINT "portal_user_permissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_user_permissions" ADD CONSTRAINT "portal_user_permissions_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "portal_users_company_id_idx" ON "portal_users" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "portal_users_customer_id_idx" ON "portal_users" USING btree ("customer_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "portal_users_company_customer_idx" ON "portal_users" USING btree ("company_id", "customer_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "portal_users_company_email_idx" ON "portal_users" USING btree ("company_id", "email");
--> statement-breakpoint
CREATE INDEX "portal_sessions_portal_user_id_idx" ON "portal_sessions" USING btree ("portal_user_id");
--> statement-breakpoint
CREATE INDEX "portal_sessions_company_id_idx" ON "portal_sessions" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "portal_user_permissions_company_id_idx" ON "portal_user_permissions" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "portal_user_permissions_portal_user_id_idx" ON "portal_user_permissions" USING btree ("portal_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "portal_user_permissions_user_permission_idx" ON "portal_user_permissions" USING btree ("portal_user_id", "permission");
