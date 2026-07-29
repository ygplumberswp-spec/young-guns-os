CREATE TYPE "public"."communication_channel" AS ENUM('email', 'phone', 'sms', 'note');
--> statement-breakpoint
CREATE TYPE "public"."communication_direction" AS ENUM('inbound', 'outbound');
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"channel" "communication_channel" DEFAULT 'note' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"template_id" uuid,
	"channel" "communication_channel" DEFAULT 'note' NOT NULL,
	"direction" "communication_direction" DEFAULT 'outbound' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "message_templates_company_id_idx" ON "message_templates" USING btree ("company_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_company_name_idx" ON "message_templates" USING btree ("company_id", "name");
--> statement-breakpoint
CREATE INDEX "communications_company_id_idx" ON "communications" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "communications_customer_id_idx" ON "communications" USING btree ("customer_id");
--> statement-breakpoint
CREATE INDEX "communications_occurred_at_idx" ON "communications" USING btree ("company_id", "occurred_at");
