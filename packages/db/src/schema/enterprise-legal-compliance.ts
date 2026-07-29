import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { users } from './users';

export const lcWorkflowStatusEnum = pgEnum('lc_workflow_status', [
  'draft',
  'review',
  'pending_approval',
  'approved',
  'executed',
  'cancelled',
]);

export const lcContractStatusEnum = pgEnum('lc_contract_status', [
  'request',
  'draft',
  'internal_review',
  'external_review',
  'negotiation',
  'pending_approval',
  'approved',
  'signature',
  'active',
  'amendment',
  'renewal',
  'suspended',
  'expired',
  'terminated',
  'archived',
]);

export const lcSignatureProviderTypeEnum = pgEnum('lc_signature_provider_type', [
  'docusign',
  'adobe_sign',
  'dropbox_sign',
  'pandadoc',
  'signnow',
  'zoho_sign',
  'onespan',
  'microsoft',
  'manual_upload',
  'generic_rest',
  'webhook',
  'custom',
]);

export const lcAdapterStatusEnum = pgEnum('lc_adapter_status', ['active', 'inactive', 'testing', 'error']);

export const lcSignatureRequestStatusEnum = pgEnum('lc_signature_request_status', [
  'draft',
  'sent',
  'partially_signed',
  'completed',
  'declined',
  'expired',
  'cancelled',
]);

export const lcObligationStatusEnum = pgEnum('lc_obligation_status', [
  'pending',
  'in_progress',
  'completed',
  'overdue',
  'waived',
  'cancelled',
]);

export const lcRiskCategoryEnum = pgEnum('lc_risk_category', [
  'strategic',
  'operational',
  'financial',
  'legal',
  'compliance',
  'cybersecurity',
  'data_privacy',
  'supplier',
  'customer',
  'workforce',
  'health_safety',
  'fleet',
  'asset',
  'environmental',
  'reputation',
  'project',
  'custom',
]);

export const lcRiskStatusEnum = pgEnum('lc_risk_status', [
  'identified',
  'assessed',
  'treatment_planned',
  'mitigated',
  'accepted',
  'closed',
]);

export const lcControlStatusEnum = pgEnum('lc_control_status', [
  'active',
  'inactive',
  'failed',
  'remediation',
]);

export const lcPolicyStatusEnum = pgEnum('lc_policy_status', [
  'draft',
  'review',
  'pending_approval',
  'published',
  'expired',
  'archived',
]);

export const lcLegalMatterStatusEnum = pgEnum('lc_legal_matter_status', [
  'open',
  'in_progress',
  'pending',
  'resolved',
  'closed',
  'archived',
]);

export const lcPrivacyRequestTypeEnum = pgEnum('lc_privacy_request_type', [
  'access',
  'correction',
  'deletion',
  'portability',
  'objection',
]);

export const lcPrivacyRequestStatusEnum = pgEnum('lc_privacy_request_status', [
  'pending',
  'in_review',
  'approved',
  'rejected',
  'completed',
]);

export const lcLegalDraftTypeEnum = pgEnum('lc_legal_draft_type', [
  'contract_summary',
  'policy_document',
  'compliance_report',
  'risk_report',
  'legal_matter_summary',
  'customer_notice',
  'supplier_notice',
  'internal_communication',
  'control_improvement',
  'clause_recommendation',
]);

export const lcPlatformConfig = pgTable('lc_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  globalPolicies: jsonb('global_policies').$type<Record<string, unknown>>().notNull().default({}),
  providerAdapterTemplates: jsonb('provider_adapter_templates')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  jurisdictionTemplates: jsonb('jurisdiction_templates').$type<Record<string, unknown>>().notNull().default({}),
  riskMethodology: jsonb('risk_methodology').$type<Record<string, unknown>>().notNull().default({}),
  retentionTemplates: jsonb('retention_templates').$type<Record<string, unknown>>().notNull().default({}),
  privacyDefaults: jsonb('privacy_defaults').$type<Record<string, unknown>>().notNull().default({}),
  clauseLibraryTemplates: jsonb('clause_library_templates').$type<Record<string, unknown>>().notNull().default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcLegalCategories = pgTable('lc_legal_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  categoryKey: text('category_key').notNull(),
  description: text('description'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcJurisdictions = pgTable('lc_jurisdictions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  country: text('country'),
  provinceOrState: text('province_or_state'),
  municipalityOrRegion: text('municipality_or_region'),
  industry: text('industry'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcContracts = pgTable('lc_contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => lcLegalCategories.id, { onDelete: 'set null' }),
  jurisdictionId: uuid('jurisdiction_id').references(() => lcJurisdictions.id, { onDelete: 'set null' }),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  contractNumber: text('contract_number'),
  contractType: text('contract_type'),
  counterpartyName: text('counterparty_name'),
  counterpartyId: uuid('counterparty_id'),
  counterpartyType: text('counterparty_type'),
  businessUnit: text('business_unit'),
  status: lcContractStatusEnum('status').notNull().default('draft'),
  workflowStatus: lcWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  effectiveDate: date('effective_date'),
  expiryDate: date('expiry_date'),
  renewalTerms: text('renewal_terms'),
  noticePeriodDays: integer('notice_period_days'),
  contractValueCents: integer('contract_value_cents'),
  currency: text('currency').default('USD'),
  paymentTerms: text('payment_terms'),
  governingJurisdiction: text('governing_jurisdiction'),
  obligations: jsonb('obligations').$type<Record<string, unknown>>().notNull().default({}),
  linkedMetadata: jsonb('linked_metadata').$type<Record<string, unknown>>().notNull().default({}),
  documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcContractLifecycleHistory = pgTable('lc_contract_lifecycle_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  contractId: uuid('contract_id')
    .notNull()
    .references(() => lcContracts.id, { onDelete: 'cascade' }),
  status: lcContractStatusEnum('status').notNull(),
  workflowStatus: lcWorkflowStatusEnum('workflow_status').notNull().default('executed'),
  title: text('title').notNull(),
  description: text('description'),
  responsibleUserId: uuid('responsible_user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcContractTemplates = pgTable('lc_contract_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  templateKey: text('template_key').notNull(),
  description: text('description'),
  jurisdictionId: uuid('jurisdiction_id').references(() => lcJurisdictions.id, { onDelete: 'set null' }),
  version: text('version').notNull().default('1.0'),
  isApproved: boolean('is_approved').notNull().default(false),
  content: text('content'),
  clauseIds: jsonb('clause_ids').$type<string[]>().notNull().default([]),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcClauseLibrary = pgTable('lc_clause_library', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  clauseKey: text('clause_key').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  jurisdictionId: uuid('jurisdiction_id').references(() => lcJurisdictions.id, { onDelete: 'set null' }),
  isMandatory: boolean('is_mandatory').notNull().default(false),
  isRestricted: boolean('is_restricted').notNull().default(false),
  isApproved: boolean('is_approved').notNull().default(false),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  effectiveDate: date('effective_date'),
  expiryDate: date('expiry_date'),
  alternatives: jsonb('alternatives').$type<string[]>().notNull().default([]),
  version: text('version').notNull().default('1.0'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcSignatureProviderAdapters = pgTable('lc_signature_provider_adapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerType: lcSignatureProviderTypeEnum('provider_type').notNull(),
  providerKey: text('provider_key').notNull(),
  name: text('name').notNull(),
  status: lcAdapterStatusEnum('status').notNull().default('inactive'),
  isPrimary: boolean('is_primary').notNull().default(false),
  endpointUrl: text('endpoint_url'),
  credentialsVaultKey: text('credentials_vault_key'),
  signerRoleMappings: jsonb('signer_role_mappings').$type<Record<string, unknown>>().notNull().default({}),
  fieldMappings: jsonb('field_mappings').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  lastTestAt: timestamp('last_test_at', { withTimezone: true }),
  lastTestStatus: text('last_test_status'),
  lastTestMessage: text('last_test_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcSignatureRequests = pgTable('lc_signature_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  contractId: uuid('contract_id').references(() => lcContracts.id, { onDelete: 'set null' }),
  providerAdapterId: uuid('provider_adapter_id').references(() => lcSignatureProviderAdapters.id, {
    onDelete: 'set null',
  }),
  status: lcSignatureRequestStatusEnum('status').notNull().default('draft'),
  subject: text('subject').notNull(),
  signers: jsonb('signers').$type<Record<string, unknown>[]>().notNull().default([]),
  workflowStatus: lcWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  externalRequestId: text('external_request_id'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcContractIntelligenceAnalyses = pgTable('lc_contract_intelligence_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  contractId: uuid('contract_id')
    .notNull()
    .references(() => lcContracts.id, { onDelete: 'cascade' }),
  analysisType: text('analysis_type').notNull(),
  summary: text('summary'),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  sourceSections: jsonb('source_sections').$type<Record<string, unknown>[]>().notNull().default([]),
  supportingEvidence: jsonb('supporting_evidence').$type<Record<string, unknown>>().notNull().default({}),
  limitations: text('limitations'),
  requiresHumanReview: boolean('requires_human_review').notNull().default(true),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  disclaimer: text('disclaimer').notNull().default('AI-generated analysis — not legal advice. Requires professional review.'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcObligations = pgTable('lc_obligations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  contractId: uuid('contract_id').references(() => lcContracts.id, { onDelete: 'set null' }),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  status: lcObligationStatusEnum('status').notNull().default('pending'),
  dueDate: date('due_date'),
  frequency: text('frequency'),
  sourceType: text('source_type'),
  sourceId: uuid('source_id'),
  evidenceDocumentIds: jsonb('evidence_document_ids').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcComplianceFrameworks = pgTable('lc_compliance_frameworks', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  frameworkKey: text('framework_key').notNull(),
  jurisdictionId: uuid('jurisdiction_id').references(() => lcJurisdictions.id, { onDelete: 'set null' }),
  description: text('description'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcComplianceRecords = pgTable('lc_compliance_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  frameworkId: uuid('framework_id').references(() => lcComplianceFrameworks.id, { onDelete: 'set null' }),
  recordKey: text('record_key').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('pending'),
  dueDate: date('due_date'),
  expiryDate: date('expiry_date'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcRiskRegister = pgTable('lc_risk_register', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  category: lcRiskCategoryEnum('category').notNull().default('custom'),
  customCategoryName: text('custom_category_name'),
  title: text('title').notNull(),
  description: text('description'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  businessArea: text('business_area'),
  status: lcRiskStatusEnum('status').notNull().default('identified'),
  likelihood: integer('likelihood'),
  impact: integer('impact'),
  inherentRiskScore: numeric('inherent_risk_score', { precision: 8, scale: 2 }),
  residualRiskScore: numeric('residual_risk_score', { precision: 8, scale: 2 }),
  controls: jsonb('controls').$type<Record<string, unknown>[]>().notNull().default([]),
  treatmentPlan: text('treatment_plan'),
  dueDate: date('due_date'),
  reviewDate: date('review_date'),
  scoringMethodology: jsonb('scoring_methodology').$type<Record<string, unknown>>().notNull().default({}),
  linkedMetadata: jsonb('linked_metadata').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: lcWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcControls = pgTable('lc_controls', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  controlKey: text('control_key').notNull(),
  title: text('title').notNull(),
  objective: text('objective'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  processArea: text('process_area'),
  frequency: text('frequency'),
  status: lcControlStatusEnum('status').notNull().default('active'),
  lastPerformedAt: timestamp('last_performed_at', { withTimezone: true }),
  nextDueAt: timestamp('next_due_at', { withTimezone: true }),
  evidenceRequired: text('evidence_required'),
  testResults: jsonb('test_results').$type<Record<string, unknown>>().notNull().default({}),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcPolicies = pgTable('lc_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  policyKey: text('policy_key').notNull(),
  description: text('description'),
  status: lcPolicyStatusEnum('status').notNull().default('draft'),
  workflowStatus: lcWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  version: text('version').notNull().default('1.0'),
  effectiveDate: date('effective_date'),
  expiryDate: date('expiry_date'),
  reviewCycleDays: integer('review_cycle_days'),
  content: text('content'),
  audience: text('audience'),
  documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcPolicyAcknowledgements = pgTable('lc_policy_acknowledgements', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  policyId: uuid('policy_id')
    .notNull()
    .references(() => lcPolicies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
});

export const lcLegalMatters = pgTable('lc_legal_matters', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  matterNumber: text('matter_number'),
  matterType: text('matter_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: lcLegalMatterStatusEnum('status').notNull().default('open'),
  priority: text('priority').notNull().default('medium'),
  responsibleUserId: uuid('responsible_user_id').references(() => users.id, { onDelete: 'set null' }),
  externalAdviser: text('external_adviser'),
  counterpartyName: text('counterparty_name'),
  deadlineDate: date('deadline_date'),
  costCents: integer('cost_cents'),
  currency: text('currency').default('USD'),
  outcome: text('outcome'),
  documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcInsurancePolicies = pgTable('lc_insurance_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  policyNumber: text('policy_number').notNull(),
  coverageType: text('coverage_type').notNull(),
  insurerName: text('insurer_name'),
  brokerName: text('broker_name'),
  premiumCents: integer('premium_cents'),
  excessCents: integer('excess_cents'),
  coverageLimitCents: integer('coverage_limit_cents'),
  currency: text('currency').default('USD'),
  effectiveDate: date('effective_date'),
  expiryDate: date('expiry_date'),
  renewalDate: date('renewal_date'),
  coveredMetadata: jsonb('covered_metadata').$type<Record<string, unknown>>().notNull().default({}),
  documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcInsuranceClaims = pgTable('lc_insurance_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  policyId: uuid('policy_id')
    .notNull()
    .references(() => lcInsurancePolicies.id, { onDelete: 'cascade' }),
  claimNumber: text('claim_number'),
  title: text('title').notNull(),
  status: text('status').notNull().default('open'),
  claimAmountCents: integer('claim_amount_cents'),
  paidAmountCents: integer('paid_amount_cents'),
  currency: text('currency').default('USD'),
  documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcConsentRecords = pgTable('lc_consent_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  subjectType: text('subject_type').notNull(),
  subjectId: uuid('subject_id'),
  purpose: text('purpose').notNull(),
  consentSource: text('consent_source'),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcPrivacyRequests = pgTable('lc_privacy_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  requestType: lcPrivacyRequestTypeEnum('request_type').notNull(),
  status: lcPrivacyRequestStatusEnum('status').notNull().default('pending'),
  subjectName: text('subject_name'),
  description: text('description'),
  workflowStatus: lcWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  legalHoldBlocked: boolean('legal_hold_blocked').notNull().default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcRetentionSchedules = pgTable('lc_retention_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  recordCategory: text('record_category').notNull(),
  retentionDays: integer('retention_days').notNull(),
  jurisdictionId: uuid('jurisdiction_id').references(() => lcJurisdictions.id, { onDelete: 'set null' }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcLegalHolds = pgTable('lc_legal_holds', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  reason: text('reason').notNull(),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  workflowStatus: lcWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  affectedRecordRefs: jsonb('affected_record_refs').$type<Record<string, unknown>[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcEvidenceRecords = pgTable('lc_evidence_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  evidenceType: text('evidence_type').notNull(),
  title: text('title').notNull(),
  sourceRef: text('source_ref'),
  documentId: uuid('document_id'),
  integrityHash: text('integrity_hash'),
  chainOfCustody: jsonb('chain_of_custody').$type<Record<string, unknown>[]>().notNull().default([]),
  linkedEntityType: text('linked_entity_type'),
  linkedEntityId: uuid('linked_entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcLegalActionDrafts = pgTable('lc_legal_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  draftType: lcLegalDraftTypeEnum('draft_type').notNull(),
  status: lcWorkflowStatusEnum('status').notNull().default('draft'),
  subject: text('subject').notNull(),
  description: text('description'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  disclaimer: text('disclaimer'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcAnalyticsSnapshots = pgTable('lc_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  activeContractCount: integer('active_contract_count').notNull().default(0),
  expiringContractCount: integer('expiring_contract_count').notNull().default(0),
  contractValueCents: integer('contract_value_cents').notNull().default(0),
  overdueObligationCount: integer('overdue_obligation_count').notNull().default(0),
  complianceGapCount: integer('compliance_gap_count').notNull().default(0),
  openRiskCount: integer('open_risk_count').notNull().default(0),
  failedControlCount: integer('failed_control_count').notNull().default(0),
  openLegalMatterCount: integer('open_legal_matter_count').notNull().default(0),
  openClaimCount: integer('open_claim_count').notNull().default(0),
  pendingPrivacyRequestCount: integer('pending_privacy_request_count').notNull().default(0),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lcAuditLogs = pgTable('lc_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type LcPlatformConfig = typeof lcPlatformConfig.$inferSelect;
export type LcContract = typeof lcContracts.$inferSelect;
export type LcRiskRegisterEntry = typeof lcRiskRegister.$inferSelect;
export type LcPolicy = typeof lcPolicies.$inferSelect;
export type LcLegalMatter = typeof lcLegalMatters.$inferSelect;
export type LcAnalyticsSnapshot = typeof lcAnalyticsSnapshots.$inferSelect;
