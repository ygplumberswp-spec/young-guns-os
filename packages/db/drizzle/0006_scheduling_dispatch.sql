ALTER TABLE "jobs" ADD COLUMN "scheduled_end_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "assigned_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "jobs_assigned_user_id_idx" ON "jobs" USING btree ("assigned_user_id");
--> statement-breakpoint
CREATE INDEX "jobs_scheduled_at_idx" ON "jobs" USING btree ("scheduled_at");
