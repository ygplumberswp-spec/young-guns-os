import type { AgentKey } from '@titan/shared';

export type CapabilityGroupId =
  | 'executive'
  | 'finance'
  | 'sales'
  | 'marketing'
  | 'operations'
  | 'customers'
  | 'workforce'
  | 'inventory'
  | 'fleet'
  | 'legal'
  | 'technology';

export type CapabilityStatus =
  | 'active'
  | 'needs_setup'
  | 'provider_required'
  | 'approval_required'
  | 'unavailable';

export type CapabilityGroupDefinition = {
  id: CapabilityGroupId;
  label: string;
  description: string;
  agentKeys: AgentKey[];
};

export const CAPABILITY_GROUPS: CapabilityGroupDefinition[] = [
  {
    id: 'executive',
    label: 'Executive & Strategy',
    description: 'Business overview, planning and decision support.',
    agentKeys: ['executive', 'executive_operations', 'decision_intelligence', 'business_intelligence'],
  },
  {
    id: 'finance',
    label: 'Finance',
    description: 'Cash flow, invoicing, accounting and financial planning.',
    agentKeys: ['finance', 'financial_planning'],
  },
  {
    id: 'sales',
    label: 'Sales',
    description: 'Pipeline, leads, quotes and revenue growth.',
    agentKeys: ['sales', 'sales_intelligence', 'lead_generation'],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'Campaigns, content, audiences and channel performance.',
    agentKeys: ['marketing'],
  },
  {
    id: 'operations',
    label: 'Operations',
    description: 'Jobs, scheduling, service delivery and field operations.',
    agentKeys: ['operations', 'mobile_field', 'automation'],
  },
  {
    id: 'customers',
    label: 'Customers & Communications',
    description: 'Customer support, messaging and experience.',
    agentKeys: ['customer_support', 'customer_experience', 'communications', 'voice_receptionist'],
  },
  {
    id: 'workforce',
    label: 'Workforce',
    description: 'Recruiting, capacity and workforce planning.',
    agentKeys: ['workforce_intelligence', 'recruiting'],
  },
  {
    id: 'inventory',
    label: 'Inventory & Procurement',
    description: 'Stock, purchasing and supplier coordination.',
    agentKeys: ['procurement'],
  },
  {
    id: 'fleet',
    label: 'Fleet & Assets',
    description: 'Vehicles, assets and fleet intelligence.',
    agentKeys: ['asset_intelligence'],
  },
  {
    id: 'legal',
    label: 'Legal & Compliance',
    description: 'Contracts, compliance and regulatory guidance.',
    agentKeys: ['legal_compliance'],
  },
  {
    id: 'technology',
    label: 'Technology, Security & Integrations',
    description: 'IT operations, security, integrations and platform health.',
    agentKeys: ['security', 'integration', 'developer', 'saas', 'production_operations', 'knowledge', 'evolution'],
  },
];

export function formatCapabilityStatus(status: CapabilityStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'needs_setup':
      return 'Needs setup';
    case 'provider_required':
      return 'Provider required';
    case 'approval_required':
      return 'Approval required';
    case 'unavailable':
      return 'Temporarily unavailable';
  }
}
