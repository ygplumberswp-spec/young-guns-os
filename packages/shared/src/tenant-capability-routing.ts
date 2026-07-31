import type { AgentKey } from './agents.js';

export type CapabilityKeywordRoute = {
  keywords: string[];
  department: string;
  baseAgentKey: AgentKey;
  registryAgentKey?: AgentKey;
  requiresCode?: boolean;
  providerRequirements?: string[];
};

export const CAPABILITY_KEYWORD_ROUTES: CapabilityKeywordRoute[] = [
  {
    keywords: ['tender', 'rfp', 'bid'],
    department: 'sales',
    baseAgentKey: 'sales_intelligence',
    registryAgentKey: 'sales_intelligence',
    providerRequirements: ['Web research provider'],
  },
  {
    keywords: ['unpaid', 'overdue', 'debt', 'collection', 'invoice follow'],
    department: 'finance',
    baseAgentKey: 'finance',
    registryAgentKey: 'finance',
  },
  {
    keywords: ['certificate', 'certification', 'technician license', 'compliance staff'],
    department: 'workforce',
    baseAgentKey: 'workforce_intelligence',
    registryAgentKey: 'workforce_intelligence',
  },
  {
    keywords: ['warranty', 'follow-up', 'follow up'],
    department: 'customers',
    baseAgentKey: 'customer_support',
    registryAgentKey: 'customer_support',
  },
  {
    keywords: ['plumbing compliance', 'compliance requirement', 'regulatory'],
    department: 'legal',
    baseAgentKey: 'legal_compliance',
    registryAgentKey: 'legal_compliance',
  },
  {
    keywords: ['stock', 'inventory', 'shortage', 'before job', 'scheduled job stock'],
    department: 'inventory',
    baseAgentKey: 'procurement',
    registryAgentKey: 'procurement',
  },
  {
    keywords: ['retention', 'churn', 'win back'],
    department: 'sales',
    baseAgentKey: 'sales_intelligence',
    registryAgentKey: 'sales_intelligence',
  },
  {
    keywords: ['maintenance reminder', 'service reminder'],
    department: 'operations',
    baseAgentKey: 'operations',
    registryAgentKey: 'operations',
  },
  {
    keywords: [
      'new integration',
      'new api',
      'new connector',
      'new database',
      'new schema',
      'new ui',
    ],
    department: 'technology',
    baseAgentKey: 'app_builder',
    requiresCode: true,
  },
];

const CODE_BACKED_PHRASES = [
  'new api',
  'new integration',
  'new database',
  'new schema',
  'custom code',
  'new ui',
] as const;

const CREATION_INTENT_PHRASES = [
  'create agent',
  'add an agent',
  'add agent',
  'new agent',
  'create capability',
  'add capability',
  'new capability',
  'build agent',
  'need an agent',
  'need a agent',
] as const;

export function matchCapabilityKeywordRoute(description: string): CapabilityKeywordRoute | null {
  const normalized = description.toLowerCase();
  for (const route of CAPABILITY_KEYWORD_ROUTES) {
    if (route.keywords.some((keyword) => normalized.includes(keyword))) {
      return route;
    }
  }
  return null;
}

export function indicatesCodeBackedCapability(description: string): boolean {
  const normalized = description.toLowerCase();
  return CODE_BACKED_PHRASES.some((phrase) => normalized.includes(phrase));
}

export function indicatesCapabilityCreationIntent(message: string): boolean {
  const normalized = message.toLowerCase();
  return CREATION_INTENT_PHRASES.some((phrase) => normalized.includes(phrase));
}

export function scoreCapabilityMessageMatch(
  message: string,
  capability: { name: string; purpose: string; tags: string[] },
): number {
  const normalized = message.toLowerCase();
  let score = 0;

  for (const tag of capability.tags) {
    if (normalized.includes(tag.toLowerCase())) score += 3;
  }
  if (normalized.includes(capability.name.toLowerCase())) score += 5;
  for (const word of capability.purpose.toLowerCase().split(/\s+/)) {
    if (word.length > 4 && normalized.includes(word)) score += 1;
  }

  return score;
}

export const CAPABILITY_MATCH_THRESHOLD = 3;
