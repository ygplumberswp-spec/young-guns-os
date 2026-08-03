/**
 * TITAN AURA Ecosystem — AURA Command Centre (Department 2.1)
 *
 * Owner command surface: chat-aware decision support, business health dashboard,
 * business memory foundation, executive assistant mode, and agent coordination
 * registry foundation. Extends existing AURA chat, aura_memory, AGENT_REGISTRY,
 * agent tasks/approvals — does not replace them.
 *
 * Guarantees:
 * - No demo / fake analytics or invented business signals
 * - Tenant isolation on every row
 * - Owner (or Platform Owner) for privileged memory/handoff/action decisions
 * - Actions remain draft until approval; never auto-execute
 * - Personal WhatsApp private data is never sourced
 */

export const AURA_COMMAND_CENTRE_GUARANTEES = {
  noDemoData: true,
  noFakeAnalytics: true,
  tenantIsolated: true,
  ownerControlledMemory: true,
  actionsRequireApproval: true,
  autoExecuted: false as const,
  neverSourcesPersonalWhatsappPrivate: true,
  extendsExistingAuraFoundations: true,
  specialistAgentsFoundationOnly: true,
} as const;

/** Future specialist agents — registry foundation only (not full implementations). */
export const AURA_COMMAND_AGENT_KEYS = [
  'finance',
  'operations',
  'marketing',
  'sales',
  'hr',
  'inventory',
  'customer_support',
  'compliance',
  'fleet',
  'market_intelligence',
] as const;

export type AuraCommandAgentKey = (typeof AURA_COMMAND_AGENT_KEYS)[number];

export const AURA_COMMAND_AGENT_LABELS: Record<AuraCommandAgentKey, string> = {
  finance: 'Finance',
  operations: 'Operations',
  marketing: 'Marketing',
  sales: 'Sales',
  hr: 'HR',
  inventory: 'Inventory',
  customer_support: 'Customer Support',
  compliance: 'Compliance',
  fleet: 'Fleet',
  market_intelligence: 'Market Intelligence',
};

/**
 * Maps command-centre agent keys to existing shared AgentKey values when present.
 * HR / inventory / fleet / market_intelligence may only have partial or adjacent agents today.
 */
export const AURA_COMMAND_AGENT_EXISTING_KEY: Record<AuraCommandAgentKey, string | null> = {
  finance: 'finance',
  operations: 'operations',
  marketing: 'marketing',
  sales: 'sales',
  hr: 'workforce_intelligence',
  inventory: 'procurement',
  customer_support: 'customer_support',
  compliance: 'legal_compliance',
  fleet: 'operations',
  market_intelligence: 'marketing_intelligence',
};

export type AuraCommandMemoryKind =
  | 'approved_decision'
  | 'preference'
  | 'operating_pattern'
  | 'important_context'
  | 'historical_decision';

export const AURA_COMMAND_MEMORY_KINDS: AuraCommandMemoryKind[] = [
  'approved_decision',
  'preference',
  'operating_pattern',
  'important_context',
  'historical_decision',
];

export type AuraCommandMemoryStatus = 'active' | 'archived' | 'superseded';

export type AuraCommandHandoffStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'cancelled';

export type AuraCommandActionStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type AuraCommandFollowUpStatus = 'open' | 'done' | 'cancelled';

export type AuraCommandDepartmentAvailability =
  | 'live_signals'
  | 'partial_signals'
  | 'foundation_only'
  | 'not_built';

export type AuraCommandDepartmentSignal = {
  department: AuraCommandAgentKey;
  label: string;
  availability: AuraCommandDepartmentAvailability;
  summary: string;
  signalCount: number | null;
  honestGap: string | null;
};

export type AuraCommandHealthSnapshot = {
  openJobs: number | null;
  outstandingInvoices: number | null;
  pendingApprovals: number | null;
  fleetIssues: number | null;
  memoryEntries: number | null;
  openFollowUps: number | null;
  /** True when at least one real signal source responded. */
  hasLiveSignals: boolean;
  notes: string[];
};

export type AuraCommandEventItem = {
  id: string;
  kind: 'approval' | 'risk' | 'opportunity' | 'recommendation' | 'follow_up' | 'memory';
  title: string;
  detail: string;
  department: AuraCommandAgentKey | 'executive' | null;
  createdAt: string | null;
  href: string | null;
};

export type AuraCommandMemoryEntry = {
  id: string;
  kind: AuraCommandMemoryKind;
  title: string;
  content: string;
  status: AuraCommandMemoryStatus;
  sourceModule: string | null;
  importance: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
};

export type AuraCommandAgentRegistryEntry = {
  agentKey: AuraCommandAgentKey;
  label: string;
  status: 'planned' | 'registered' | 'active' | 'paused';
  existingAgentKey: string | null;
  foundationOnly: true;
  capabilities: string[];
  notes: string | null;
  tenantRowId: string | null;
};

export type AuraCommandHandoffSummary = {
  id: string;
  fromAgentKey: AuraCommandAgentKey | 'executive';
  toAgentKey: AuraCommandAgentKey;
  contextSummary: string;
  status: AuraCommandHandoffStatus;
  approvalRequired: true;
  autoExecuted: false;
  createdAt: string;
  decidedAt: string | null;
  decisionNotes: string | null;
};

export type AuraCommandActionDraft = {
  id: string;
  title: string;
  description: string;
  departmentKey: AuraCommandAgentKey | 'executive';
  status: AuraCommandActionStatus;
  approvalRequired: true;
  autoExecuted: false;
  createdAt: string;
  decidedAt: string | null;
  decisionNotes: string | null;
};

export type AuraCommandFollowUp = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  status: AuraCommandFollowUpStatus;
  source: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type AuraCommandExecutiveAssistant = {
  dailyPriorities: Array<{ id: string; title: string; detail: string; href: string | null }>;
  businessQuestions: Array<{ id: string; question: string; context: string }>;
  recommendations: Array<{ id: string; title: string; detail: string; draftOnly: true }>;
  followUps: AuraCommandFollowUp[];
  planningSupport: {
    mode: 'draft';
    summary: string;
    linkedSurfaces: Array<{ label: string; href: string }>;
  };
};

export type AuraCommandCentreDashboard = {
  summary: string;
  health: AuraCommandHealthSnapshot;
  importantEvents: AuraCommandEventItem[];
  pendingApprovals: AuraCommandEventItem[];
  risks: AuraCommandEventItem[];
  opportunities: AuraCommandEventItem[];
  recommendations: AuraCommandEventItem[];
  departments: AuraCommandDepartmentSignal[];
  executiveAssistant: AuraCommandExecutiveAssistant;
  agentRegistry: AuraCommandAgentRegistryEntry[];
  recentMemory: AuraCommandMemoryEntry[];
  recentHandoffs: AuraCommandHandoffSummary[];
  pendingActionDrafts: AuraCommandActionDraft[];
  chatIntegration: {
    auraChatHref: string;
    understandsModules: string[];
    actionsAreDraftUntilApproved: true;
  };
  guarantees: typeof AURA_COMMAND_CENTRE_GUARANTEES;
};

export type CreateAuraCommandMemoryRequest = {
  kind: AuraCommandMemoryKind;
  title: string;
  content: string;
  sourceModule?: string | null;
  importance?: number;
};

export type UpdateAuraCommandMemoryRequest = {
  title?: string;
  content?: string;
  status?: AuraCommandMemoryStatus;
  importance?: number;
  enabled?: boolean;
};

export type CreateAuraCommandHandoffRequest = {
  fromAgentKey?: AuraCommandAgentKey | 'executive';
  toAgentKey: AuraCommandAgentKey;
  contextSummary: string;
  /** Non-private business context only — never Personal WA private payloads. */
  contextPayload?: Record<string, unknown>;
};

export type CreateAuraCommandActionDraftRequest = {
  title: string;
  description: string;
  departmentKey?: AuraCommandAgentKey | 'executive';
  suggestedAction?: Record<string, unknown>;
};

export type CreateAuraCommandFollowUpRequest = {
  title: string;
  notes?: string | null;
  dueAt?: string | null;
  source?: string | null;
};

export type DecideAuraCommandRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export function canAccessAuraCommandCentre(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  if (permissions.includes('agents:read') || permissions.includes('intelligence:read')) return true;
  if (permissions.includes('agents:write') || permissions.includes('intelligence:write')) return true;
  const role = identity.roleName ?? '';
  return role === 'Platform Owner' || role === 'Company Owner' || role === 'Owner';
}

export function canWriteAuraCommandCentre(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  if (!canAccessAuraCommandCentre(identity)) return false;
  const role = identity.roleName ?? '';
  if (role === 'Platform Owner' || role === 'Company Owner' || role === 'Owner') return true;
  const permissions = identity.permissions ?? [];
  return (
    permissions.includes('*') ||
    permissions.includes('agents:write') ||
    permissions.includes('intelligence:write')
  );
}

/** Privileged memory / handoff / action decisions — Owner or Platform Owner only. */
export function canDecideAuraCommandCentre(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Platform Owner' || role === 'Company Owner' || role === 'Owner') return true;
  const permissions = identity.permissions ?? [];
  return permissions.includes('*');
}

export function isAuraCommandAgentKey(value: string): value is AuraCommandAgentKey {
  return (AURA_COMMAND_AGENT_KEYS as readonly string[]).includes(value);
}

export function defaultAuraCommandAgentCapabilities(agentKey: AuraCommandAgentKey): string[] {
  switch (agentKey) {
    case 'finance':
      return ['cashflow_signals', 'receivables_read', 'draft_finance_action'];
    case 'operations':
      return ['jobs_read', 'scheduling_read', 'dispatch_signals'];
    case 'marketing':
      return ['campaign_read_future', 'content_draft_future'];
    case 'sales':
      return ['pipeline_read', 'lead_signals'];
    case 'hr':
      return ['workforce_signals_partial', 'recruiting_foundation'];
    case 'inventory':
      return ['stock_signals_partial', 'procurement_foundation'];
    case 'customer_support':
      return ['cx_signals_partial', 'draft_customer_response'];
    case 'compliance':
      return ['compliance_foundation'];
    case 'fleet':
      return ['vehicle_status_read', 'fleet_issue_signals'];
    case 'market_intelligence':
      return ['market_foundation'];
    default:
      return [];
  }
}

export function auraCommandDepartmentAvailability(
  agentKey: AuraCommandAgentKey,
): AuraCommandDepartmentAvailability {
  switch (agentKey) {
    case 'finance':
    case 'operations':
    case 'fleet':
    case 'sales':
      return 'live_signals';
    case 'inventory':
    case 'customer_support':
    case 'hr':
    case 'marketing':
      return 'partial_signals';
    case 'compliance':
    case 'market_intelligence':
      return 'foundation_only';
    default:
      return 'not_built';
  }
}

export function auraCommandDepartmentGap(agentKey: AuraCommandAgentKey): string | null {
  switch (agentKey) {
    case 'marketing':
      return 'Full Marketing Agent / social channel intelligence remains on the roadmap.';
    case 'hr':
      return 'Dedicated HR Intelligence (payroll, leave, performance) is not built yet; workforce signals are partial.';
    case 'inventory':
      return 'Inventory Intelligence forecasting / reorder automation remains on the roadmap.';
    case 'compliance':
      return 'Compliance Intelligence agent is foundation-only.';
    case 'market_intelligence':
      return 'Market Intelligence agent is foundation-only.';
    case 'customer_support':
      return 'Customer Experience portal depth remains on the roadmap; support drafts use existing agents when configured.';
    default:
      return null;
  }
}

export const AURA_COMMAND_UNDERSTANDS_MODULES = [
  'Customers',
  'Jobs',
  'Quotes',
  'Invoices',
  'Payments',
  'Fleet',
  'Inventory',
  'Communications',
  'Maintenance',
  'Reports',
] as const;
