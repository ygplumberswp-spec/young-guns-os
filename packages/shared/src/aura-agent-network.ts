/** Department 2.2: controlled AURA agent-to-agent coordination. */
export const AURA_AGENT_NETWORK_GUARANTEES = {
  noDemoData: true,
  tenantIsolated: true,
  ownerControlled: true,
  actionsRequireApproval: true,
  autoExecuted: false as const,
  neverSourcesPersonalWhatsappPrivate: true,
  extendsCommandCentreRegistry: true,
} as const;

export const AURA_NETWORK_AGENT_KEYS = [
  'executive', 'finance', 'operations', 'marketing', 'sales', 'hr', 'inventory',
  'customer_support', 'compliance', 'fleet', 'market_intelligence',
] as const;
export type AuraNetworkAgentKey = (typeof AURA_NETWORK_AGENT_KEYS)[number];
export const AURA_NETWORK_LINKED_AGENT_KEYS: Record<Exclude<AuraNetworkAgentKey, 'executive'>, string> = {
  finance: 'finance', operations: 'operations', marketing: 'marketing', sales: 'sales',
  hr: 'workforce_intelligence', inventory: 'procurement', customer_support: 'customer_support',
  compliance: 'legal_compliance', fleet: 'operations', market_intelligence: 'industry_intelligence',
};
export type AuraNetworkContextDomain =
  | 'finance' | 'operations' | 'marketing' | 'sales' | 'hr' | 'inventory'
  | 'customer_support' | 'compliance' | 'fleet' | 'market_intelligence' | 'business_memory'
  | 'personal_wa_private';
export const AURA_NETWORK_ALLOWED_CONTEXT_DOMAINS: AuraNetworkContextDomain[] = [
  'finance', 'operations', 'marketing', 'sales', 'hr', 'inventory', 'customer_support',
  'compliance', 'fleet', 'market_intelligence', 'business_memory',
];
export const AURA_NETWORK_FORBIDDEN_CONTEXT_DOMAINS: AuraNetworkContextDomain[] = ['personal_wa_private'];
export type AuraNetworkCatalogEntry = {
  agentKey: AuraNetworkAgentKey; label: string; linkedAgentKey: string | null;
  allowedContextDomains: AuraNetworkContextDomain[];
};
export const AURA_NETWORK_CATALOG: AuraNetworkCatalogEntry[] = AURA_NETWORK_AGENT_KEYS.map((agentKey) => ({
  agentKey, label: agentKey === 'customer_support' ? 'Customer Support' : agentKey === 'market_intelligence' ? 'Market Intelligence' : agentKey === 'hr' ? 'HR' : agentKey[0]!.toUpperCase() + agentKey.slice(1),
  linkedAgentKey: agentKey === 'executive' ? null : AURA_NETWORK_LINKED_AGENT_KEYS[agentKey],
  allowedContextDomains: [...AURA_NETWORK_ALLOWED_CONTEXT_DOMAINS],
}));
export const AURA_NETWORK_EXAMPLE_FLOW = {
  from: 'finance', through: 'executive', outcome: 'communication_draft',
  description: 'Finance → Executive → Communication draft; outbound communication remains an Owner-approved draft.',
} as const;
export type AuraNetworkMessageKind = 'handoff' | 'delegation' | 'insight' | 'draft';
export type AuraNetworkApprovalType = 'handoff' | 'delegation' | 'workflow_start' | 'context_share' | 'financial_action' | 'message_send';
export type AuraNetworkStatus = 'draft' | 'awaiting_approval' | 'approved' | 'rejected' | 'active' | 'completed' | 'cancelled';
export type AuraNetworkMessage = { id: string; fromAgentKey: AuraNetworkAgentKey; toAgentKey: AuraNetworkAgentKey; kind: AuraNetworkMessageKind; subject: string; body: string; status: AuraNetworkStatus; autoExecuted: false; createdAt: string };
export type AuraNetworkWorkflow = { id: string; name: string; description: string | null; mode: 'sequential' | 'parallel'; status: AuraNetworkStatus; createdAt: string };
export type AuraNetworkApproval = { id: string; type: AuraNetworkApprovalType; entityId: string; status: AuraNetworkStatus; autoExecuted: false; createdAt: string; decidedAt: string | null };
export function messageRequiresOwnerApproval(kind: AuraNetworkMessageKind): boolean { return kind === 'handoff' || kind === 'delegation'; }
export function isForbiddenContextDomain(domain: string): boolean { return (AURA_NETWORK_FORBIDDEN_CONTEXT_DOMAINS as readonly string[]).includes(domain); }
export function isAllowedContextDomain(domain: string): domain is AuraNetworkContextDomain { return (AURA_NETWORK_ALLOWED_CONTEXT_DOMAINS as readonly string[]).includes(domain); }
export function getAuraNetworkCatalogEntry(key: string) { return AURA_NETWORK_CATALOG.find((entry) => entry.agentKey === key) ?? null; }
export function isSensitiveNetworkApprovalType(type: AuraNetworkApprovalType): boolean { return ['financial_action', 'message_send', 'handoff', 'delegation', 'context_share'].includes(type); }
