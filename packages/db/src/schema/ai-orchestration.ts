import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { agentKeyEnum } from './agent-profiles';
import { agentRuns } from './agent-runs';
import { auraConversations } from './aura-conversations';
import { companies } from './companies';
import { users } from './users';

export const aiProviderKeyEnum = pgEnum('ai_provider_key', [
  'openai',
  'google_gemini',
  'anthropic_claude',
  'ollama',
  'azure_openai',
  'openrouter',
  'groq',
  'mistral',
  'custom',
]);

export const aiProviderStatusEnum = pgEnum('ai_provider_status', ['active', 'inactive', 'degraded']);

export const aiProviderHealthStatusEnum = pgEnum('ai_provider_health_status', [
  'unknown',
  'healthy',
  'unhealthy',
  'degraded',
]);

export const aiRoutingCategoryEnum = pgEnum('ai_routing_category', [
  'reasoning',
  'coding',
  'business_analysis',
  'finance',
  'legal',
  'marketing',
  'image_understanding',
  'document_analysis',
  'long_context_analysis',
  'speech',
  'translation',
  'summarization',
]);

export const aiRoutingModeEnum = pgEnum('ai_routing_mode', ['automatic', 'manual']);

export const aiPromptCategoryEnum = pgEnum('ai_prompt_category', ['system', 'department', 'agent']);

export const aiPromptVersionStatusEnum = pgEnum('ai_prompt_version_status', [
  'draft',
  'pending_approval',
  'published',
  'archived',
]);

export const aiConfigurationActionTypeEnum = pgEnum('ai_configuration_action_type', [
  'prompt_update',
  'provider_configuration',
]);

export const aiConfigurationActionStatusEnum = pgEnum('ai_configuration_action_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const aiFailoverReasonEnum = pgEnum('ai_failover_reason', [
  'provider_unavailable',
  'timeout',
  'rate_limit',
  'degraded_performance',
  'credit_exhausted',
  'context_window_exceeded',
]);

export const aiAccessModeEnum = pgEnum('ai_access_mode', [
  'platform_managed',
  'tenant_credentials',
  'hybrid',
]);

export const aiMemoryContextTypeEnum = pgEnum('ai_memory_context_type', [
  'business',
  'customer',
  'job',
  'finance',
  'executive',
  'workflow',
]);

export const aiProviders = pgTable('ai_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerKey: aiProviderKeyEnum('provider_key').notNull(),
  displayName: text('display_name').notNull(),
  status: aiProviderStatusEnum('status').notNull().default('inactive'),
  healthStatus: aiProviderHealthStatusEnum('health_status').notNull().default('unknown'),
  apiVersion: text('api_version'),
  baseUrl: text('base_url'),
  encryptedCredentials: text('encrypted_credentials'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  priorityWeight: integer('priority_weight').notNull().default(100),
  isEnabled: boolean('is_enabled').notNull().default(false),
  averageLatencyMs: integer('average_latency_ms'),
  lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiModels = pgTable('ai_models', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => aiProviders.id, { onDelete: 'cascade' }),
  modelKey: text('model_key').notNull(),
  displayName: text('display_name').notNull(),
  contextWindow: integer('context_window').notNull().default(8192),
  capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
  pricingMetadata: jsonb('pricing_metadata').$type<Record<string, unknown>>().notNull().default({}),
  averageLatencyMs: integer('average_latency_ms'),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiRoutingRules = pgTable('ai_routing_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  category: aiRoutingCategoryEnum('category').notNull(),
  routingMode: aiRoutingModeEnum('routing_mode').notNull().default('automatic'),
  primaryProviderId: uuid('primary_provider_id').references(() => aiProviders.id, { onDelete: 'set null' }),
  primaryModelId: uuid('primary_model_id').references(() => aiModels.id, { onDelete: 'set null' }),
  fallbackChain: jsonb('fallback_chain')
    .$type<Array<{ providerId?: string; modelId?: string; providerKey?: string; modelKey?: string }>>()
    .notNull()
    .default([]),
  priorityOrder: integer('priority_order').notNull().default(100),
  weight: integer('weight').notNull().default(100),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiPromptTemplates = pgTable('ai_prompt_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  templateKey: text('template_key').notNull(),
  category: aiPromptCategoryEnum('category').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  agentKey: agentKeyEnum('agent_key'),
  currentPublishedVersionId: uuid('current_published_version_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiPromptVersions = pgTable('ai_prompt_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id')
    .notNull()
    .references(() => aiPromptTemplates.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  content: text('content').notNull(),
  status: aiPromptVersionStatusEnum('status').notNull().default('draft'),
  changeNotes: text('change_notes'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiConfigurationActions = pgTable('ai_configuration_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: aiConfigurationActionTypeEnum('action_type').notNull(),
  status: aiConfigurationActionStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiUsageRecords = pgTable('ai_usage_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerId: uuid('provider_id').references(() => aiProviders.id, { onDelete: 'set null' }),
  modelId: uuid('model_id').references(() => aiModels.id, { onDelete: 'set null' }),
  departmentKey: text('department_key'),
  workflowKey: text('workflow_key'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  conversationId: uuid('conversation_id').references(() => auraConversations.id, { onDelete: 'set null' }),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  costCents: integer('cost_cents').notNull().default(0),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiQualityEvaluations = pgTable('ai_quality_evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerId: uuid('provider_id').references(() => aiProviders.id, { onDelete: 'set null' }),
  modelId: uuid('model_id').references(() => aiModels.id, { onDelete: 'set null' }),
  agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  conversationId: uuid('conversation_id').references(() => auraConversations.id, { onDelete: 'set null' }),
  responseQualityScore: numeric('response_quality_score', { precision: 5, scale: 2 }),
  success: boolean('success').notNull().default(true),
  correctionRate: numeric('correction_rate', { precision: 5, scale: 4 }),
  hallucinationReported: boolean('hallucination_reported').notNull().default(false),
  responseTimeMs: integer('response_time_ms'),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 4 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiFeedbackRecords = pgTable('ai_feedback_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  providerId: uuid('provider_id').references(() => aiProviders.id, { onDelete: 'set null' }),
  modelId: uuid('model_id').references(() => aiModels.id, { onDelete: 'set null' }),
  agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  conversationId: uuid('conversation_id').references(() => auraConversations.id, { onDelete: 'set null' }),
  rating: integer('rating'),
  correctionText: text('correction_text'),
  accepted: boolean('accepted').notNull().default(false),
  rejected: boolean('rejected').notNull().default(false),
  workflowOutcome: text('workflow_outcome'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiFailoverEvents = pgTable('ai_failover_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  fromProviderId: uuid('from_provider_id').references(() => aiProviders.id, { onDelete: 'set null' }),
  toProviderId: uuid('to_provider_id').references(() => aiProviders.id, { onDelete: 'set null' }),
  reason: aiFailoverReasonEnum('reason').notNull(),
  contextPreserved: boolean('context_preserved').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiMemorySyncRecords = pgTable('ai_memory_sync_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  contextType: aiMemoryContextTypeEnum('context_type').notNull(),
  syncKey: text('sync_key').notNull(),
  providerId: uuid('provider_id').references(() => aiProviders.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AiProvider = typeof aiProviders.$inferSelect;
export type AiModel = typeof aiModels.$inferSelect;
export type AiRoutingRule = typeof aiRoutingRules.$inferSelect;
export type AiPromptTemplate = typeof aiPromptTemplates.$inferSelect;
export type AiPromptVersion = typeof aiPromptVersions.$inferSelect;
export type AiConfigurationAction = typeof aiConfigurationActions.$inferSelect;

export const aiProviderResilienceConfigs = pgTable('ai_provider_resilience_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  fallbackOrder: jsonb('fallback_order')
    .$type<Array<{ providerKey: string; modelKey?: string; providerId?: string }>>()
    .notNull()
    .default([]),
  maxRetries: integer('max_retries').notNull().default(3),
  retryBaseDelayMs: integer('retry_base_delay_ms').notNull().default(500),
  queueEnabled: boolean('queue_enabled').notNull().default(true),
  lowCreditWarningCents: integer('low_credit_warning_cents').notNull().default(1000),
  highUsageWarningTokens: integer('high_usage_warning_tokens').notNull().default(500_000),
  hardSpendingLimitEnabled: boolean('hard_spending_limit_enabled').notNull().default(false),
  hardSpendingLimitCents: integer('hard_spending_limit_cents'),
  taskRoutingEnabled: boolean('task_routing_enabled').notNull().default(true),
  aiAccessMode: aiAccessModeEnum('ai_access_mode').notNull().default('platform_managed'),
  blockedCategories: jsonb('blocked_categories').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiComparisonRuns = pgTable('ai_comparison_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  subject: text('subject').notNull(),
  taskPrompt: text('task_prompt').notNull(),
  routingCategory: aiRoutingCategoryEnum('routing_category'),
  status: text('status').notNull().default('pending_approval'),
  consolidatedRecommendation: text('consolidated_recommendation'),
  disagreementSummary: text('disagreement_summary'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiComparisonResults = pgTable('ai_comparison_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  comparisonRunId: uuid('comparison_run_id')
    .notNull()
    .references(() => aiComparisonRuns.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerId: uuid('provider_id').references(() => aiProviders.id, { onDelete: 'set null' }),
  providerKey: aiProviderKeyEnum('provider_key').notNull(),
  modelKey: text('model_key').notNull(),
  responseContent: text('response_content').notNull(),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  latencyMs: integer('latency_ms'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiRequestQueue = pgTable('ai_request_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('pending'),
  operationType: text('operation_type').notNull(),
  routingCategory: text('routing_category'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  lastError: text('last_error'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
