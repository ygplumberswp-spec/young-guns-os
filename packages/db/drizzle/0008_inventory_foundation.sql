CREATE TYPE "public"."inventory_item_status" AS ENUM('active', 'inactive');
--> statement-breakpoint
CREATE TABLE "inventory_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"address" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"unit" text DEFAULT 'each' NOT NULL,
	"reorder_level" integer DEFAULT 0 NOT NULL,
	"status" "inventory_item_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_stock_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity_on_hand" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_stock_levels" ADD CONSTRAINT "inventory_stock_levels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_stock_levels" ADD CONSTRAINT "inventory_stock_levels_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_stock_levels" ADD CONSTRAINT "inventory_stock_levels_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "inventory_locations_company_id_idx" ON "inventory_locations" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "inventory_items_company_id_idx" ON "inventory_items" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "inventory_stock_levels_company_id_idx" ON "inventory_stock_levels" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "inventory_stock_levels_item_id_idx" ON "inventory_stock_levels" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX "inventory_stock_levels_location_id_idx" ON "inventory_stock_levels" USING btree ("location_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_company_sku_idx" ON "inventory_items" USING btree ("company_id", "sku");
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_stock_levels_item_location_idx" ON "inventory_stock_levels" USING btree ("item_id", "location_id");
