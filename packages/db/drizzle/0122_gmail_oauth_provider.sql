-- Gmail OAuth: provider enum value for integration_oauth_states / connections.
ALTER TYPE "public"."integration_provider" ADD VALUE IF NOT EXISTS 'gmail';
--> statement-breakpoint
-- Confident entity linking may target CRM leads from business Gmail.
ALTER TYPE "public"."comm_platform_link_target_type" ADD VALUE IF NOT EXISTS 'lead';
