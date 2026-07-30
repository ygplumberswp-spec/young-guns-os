import type { AgentKey } from './agents.js';

export type TenantCapabilityType = 'tenant_configuration' | 'code_backed';

export type TenantCapabilityStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'testing'
  | 'active'
  | 'attention_required'
  | 'disabled'
  | 'archived'
  | 'failed_deployment';

export type TenantCapabilityTestResult = 'passed' | 'passed_with_warnings' | 'failed';

export type TenantCapabilityRiskLevel = 'low' | 'medium' | 'high';

export type CapabilityDiscoveryQuestion = {
  id: string;
  prompt: string;
  required: boolean;
};

export type CapabilityDuplicateMatch = {
  matchType: 'registry_agent' | 'tenant_capability' | 'capability_group';
  id: string;
  name: string;
  reason: string;
  recommendation: 'extend_existing' | 'create_separate' | 'cancel';
};

export type CapabilityProposalAction = {
  id: string;
  label: string;
  allowed: boolean;
};

export type CapabilityProposal = {
  name: string;
  department: string;
  departmentLabel: string;
  purpose: string;
  capabilityType: TenantCapabilityType;
  dataAccess: string[];
  allowedActions: CapabilityProposalAction[];
  prohibitedActions: string[];
  approvalRequirements: string[];
  providerRequirements: string[];
  riskLevel: TenantCapabilityRiskLevel;
  baseAgentKey: AgentKey | null;
  extendsAgentKey: AgentKey | null;
  extendsAgentName: string | null;
  configurationOnly: boolean;
  estimatedUsageNote: string | null;
};

export type CapabilityDiscoveryResponse = {
  complete: boolean;
  questions: CapabilityDiscoveryQuestion[];
  duplicateMatches: CapabilityDuplicateMatch[];
  recommendation: 'extend_existing' | 'create_tenant' | 'code_backed' | 'needs_more_info';
  recommendationSummary: string;
  proposal: CapabilityProposal | null;
};

export type TenantCapabilitySummary = {
  id: string;
  slug: string;
  name: string;
  department: string;
  purpose: string;
  capabilityType: TenantCapabilityType;
  status: TenantCapabilityStatus;
  version: number;
  baseAgentKey: AgentKey | null;
  extendsAgentKey: AgentKey | null;
  riskLevel: TenantCapabilityRiskLevel;
  healthStatus: string;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
};

export type TenantCapabilityDetail = TenantCapabilitySummary & {
  proposal: CapabilityProposal;
  configuration: Record<string, unknown>;
  approvalPolicy: Record<string, unknown>;
  providerRequirements: string[];
  capabilityTags: string[];
  agentProfileId: string | null;
  appBuilderRequestId: string | null;
};

export type TenantCapabilityVersionSummary = {
  id: string;
  version: number;
  status: TenantCapabilityStatus;
  changeSummary: string | null;
  createdAt: string;
  createdByName: string | null;
};

export type TenantCapabilityTestSummary = {
  id: string;
  result: TenantCapabilityTestResult;
  summary: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type DiscoverCapabilityRequest = {
  description: string;
  answers?: Record<string, string>;
};

export type CreateCapabilityProposalRequest = {
  description: string;
  answers?: Record<string, string>;
  duplicateResolution?: 'extend_existing' | 'create_separate' | 'cancel';
  extendAgentKey?: AgentKey;
  extendCapabilityId?: string;
};

export type UpdateCapabilityProposalRequest = {
  name?: string;
  department?: string;
  purpose?: string;
  dataAccess?: string[];
  allowedLowRiskActions?: boolean;
  roleScope?: string[];
};

export type ActivateCapabilityRequest = {
  confirmApproval: boolean;
};

export const PROHIBITED_CAPABILITY_ACTIONS = [
  'Make payments or refunds',
  'Create accounting entries or change invoice totals',
  'Delete business records',
  'Change users, roles or security policies',
  'Access another tenant',
  'Change credentials or disconnect integrations',
  'Publish public content without approval',
  'Change advertising spend',
  'Make legal or employment commitments',
  'Deploy production code or run database migrations',
] as const;

export const CAPABILITY_DEPARTMENTS = [
  { id: 'executive', label: 'Executive & Strategy' },
  { id: 'finance', label: 'Finance' },
  { id: 'sales', label: 'Sales' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'operations', label: 'Operations' },
  { id: 'customers', label: 'Customers & Communications' },
  { id: 'workforce', label: 'Workforce' },
  { id: 'inventory', label: 'Inventory & Procurement' },
  { id: 'fleet', label: 'Fleet & Assets' },
  { id: 'legal', label: 'Legal & Compliance' },
  { id: 'technology', label: 'Technology, Security & Integrations' },
] as const;
