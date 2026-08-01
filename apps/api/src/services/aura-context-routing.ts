import type { AuraPageContext } from '@titan/shared';

export type AuraContextDomain =
  | 'crm'
  | 'jobs'
  | 'scheduling'
  | 'finance'
  | 'inventory'
  | 'fleet'
  | 'communications'
  | 'documents'
  | 'automation'
  | 'agents'
  | 'portal'
  | 'whatsapp'
  | 'recruiting'
  | 'integrations'
  | 'intelligence'
  | 'memory'
  | 'dayPlan'
  | 'analytics'
  | 'orchestration'
  | 'sales'
  | 'marketing'
  | 'leads'
  | 'voice'
  | 'customerSupport'
  | 'workforce'
  | 'procurement'
  | 'financeIntelligence'
  | 'knowledge'
  | 'businessIntelligence'
  | 'enterpriseAnalytics'
  | 'enterpriseAutomationStudio'
  | 'enterpriseKnowledgeGraph'
  | 'enterpriseDigitalTwin'
  | 'enterpriseMissionControl'
  | 'enterpriseEvolution'
  | 'enterpriseDeveloperPlatform'
  | 'enterpriseSaasPlatform'
  | 'executive'
  | 'mobile'
  | 'mobileWorkforce'
  | 'qualityAssurance'
  | 'communicationsIntelligence'
  | 'assetEquipment'
  | 'aiOrchestration'
  | 'dispatchIntelligence'
  | 'fleetIntelligence'
  | 'personalCommunications'
  | 'security'
  | 'integrationPlatform';

const ALL_DOMAINS: AuraContextDomain[] = [
  'crm',
  'jobs',
  'scheduling',
  'finance',
  'inventory',
  'fleet',
  'communications',
  'documents',
  'automation',
  'agents',
  'portal',
  'whatsapp',
  'recruiting',
  'integrations',
  'intelligence',
  'memory',
  'dayPlan',
  'analytics',
  'orchestration',
  'sales',
  'marketing',
  'leads',
  'voice',
  'customerSupport',
  'workforce',
  'procurement',
  'financeIntelligence',
  'knowledge',
  'businessIntelligence',
  'enterpriseAnalytics',
  'enterpriseAutomationStudio',
  'enterpriseKnowledgeGraph',
  'enterpriseDigitalTwin',
  'enterpriseMissionControl',
  'enterpriseEvolution',
  'enterpriseDeveloperPlatform',
  'enterpriseSaasPlatform',
  'executive',
  'mobile',
  'mobileWorkforce',
  'qualityAssurance',
  'communicationsIntelligence',
  'assetEquipment',
  'aiOrchestration',
  'dispatchIntelligence',
  'fleetIntelligence',
  'personalCommunications',
  'security',
  'integrationPlatform',
];

const KEYWORD_DOMAINS: Array<{ pattern: RegExp; domains: AuraContextDomain[] }> = [
  { pattern: /\b(customer|client|crm|contact|lead)\b/i, domains: ['crm', 'leads', 'sales'] },
  {
    pattern: /\b(job|work order|dispatch|schedule|scheduling|appointment)\b/i,
    domains: ['jobs', 'scheduling', 'dispatchIntelligence'],
  },
  {
    pattern: /\b(invoice|payment|finance|accounting|xero|revenue|expense|profit)\b/i,
    domains: ['finance', 'financeIntelligence', 'integrations'],
  },
  { pattern: /\b(inventory|stock|parts|warehouse)\b/i, domains: ['inventory', 'procurement'] },
  {
    pattern: /\b(fleet|vehicle|driver|gps|tracking)\b/i,
    domains: ['fleet', 'fleetIntelligence', 'integrations'],
  },
  {
    pattern: /\b(email|sms|message|communication|whatsapp|call|voice)\b/i,
    domains: ['communications', 'whatsapp', 'voice', 'communicationsIntelligence'],
  },
  { pattern: /\b(document|file|contract|attachment)\b/i, domains: ['documents'] },
  {
    pattern: /\b(automation|workflow|trigger)\b/i,
    domains: ['automation', 'enterpriseAutomationStudio'],
  },
  { pattern: /\b(agent|specialist|department)\b/i, domains: ['agents', 'orchestration'] },
  { pattern: /\b(portal|customer portal)\b/i, domains: ['portal'] },
  {
    pattern: /\b(recruit|hiring|candidate|workforce|technician|employee)\b/i,
    domains: ['recruiting', 'workforce', 'mobileWorkforce'],
  },
  {
    pattern: /\b(integration|api|webhook|sync)\b/i,
    domains: ['integrations', 'integrationPlatform'],
  },
  {
    pattern: /\b(analytic|report|dashboard|metric|kpi|bi)\b/i,
    domains: ['analytics', 'businessIntelligence', 'enterpriseAnalytics'],
  },
  { pattern: /\b(marketing|campaign|advertis)\b/i, domains: ['marketing'] },
  { pattern: /\b(support|ticket|complaint)\b/i, domains: ['customerSupport'] },
  { pattern: /\b(knowledge|wiki|faq)\b/i, domains: ['knowledge', 'enterpriseKnowledgeGraph'] },
  { pattern: /\b(security|permission|access control|audit)\b/i, domains: ['security'] },
  {
    pattern: /\b(executive|mission control|digital twin|evolution)\b/i,
    domains: [
      'executive',
      'enterpriseMissionControl',
      'enterpriseDigitalTwin',
      'enterpriseEvolution',
    ],
  },
  { pattern: /\b(quality|inspection|compliance)\b/i, domains: ['qualityAssurance'] },
  { pattern: /\b(asset|equipment|maintenance)\b/i, domains: ['assetEquipment'] },
  { pattern: /\b(recommend|insight|intelligence|memory)\b/i, domains: ['intelligence', 'memory'] },
  {
    pattern: /\b(today'?s plan|day plan|daily priorit|today'?s focus|today'?s priorit)\b/i,
    domains: ['dayPlan', 'executive'],
  },
  { pattern: /\b(procurement|purchase order|supplier|vendor)\b/i, domains: ['procurement'] },
  {
    pattern: /\b(saas|platform|developer)\b/i,
    domains: ['enterpriseSaasPlatform', 'enterpriseDeveloperPlatform'],
  },
];

const GENERAL_PLATFORM_PATTERNS = [
  /\boverview\b/i,
  /\bwhat can titan\b/i,
  /\bwhat does titan\b/i,
  /\bhelp me manage\b/i,
  /\bwhat can you help\b/i,
  /\bgetting started\b/i,
  /\bintroduce\b/i,
  /\bwhat is titan\b/i,
  /\bbrief overview\b/i,
];

export function isGeneralPlatformQuestion(message: string): boolean {
  const normalized = message.toLowerCase();

  if (GENERAL_PLATFORM_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  return (
    normalized.includes('titan') &&
    (normalized.includes('manage') ||
      normalized.includes('help') ||
      normalized.includes('overview') ||
      normalized.includes('capabilities'))
  );
}

export function shouldLoadTenantCapabilities(message: string): boolean {
  const normalized = message.toLowerCase();
  return /\b(capabilit(y|ies)|custom agent|new agent|create agent|build agent|tenant capability)\b/i.test(
    normalized,
  );
}

function addPageContextDomains(
  pageContext: AuraPageContext | undefined,
  domains: Set<AuraContextDomain>,
) {
  if (!pageContext) {
    return;
  }

  if (pageContext.customerId) {
    domains.add('crm');
    domains.add('communications');
    domains.add('documents');
    domains.add('portal');
    domains.add('whatsapp');
  }

  if (pageContext.jobId) {
    domains.add('jobs');
    domains.add('documents');
  }

  if (pageContext.vehicleId) {
    domains.add('fleet');
  }

  if (pageContext.schedulingView) {
    domains.add('scheduling');
  }

  if (pageContext.agentProfileId) {
    domains.add('agents');
  }

  if (pageContext.workflowId) {
    domains.add('automation');
  }

  if (pageContext.mobileRole === 'owner') {
    domains.add('mobile');
  }

  if (pageContext.mobileRole === 'technician') {
    domains.add('mobile');
    domains.add('mobileWorkforce');
  }
}

function addKeywordDomains(message: string, domains: Set<AuraContextDomain>) {
  for (const entry of KEYWORD_DOMAINS) {
    if (entry.pattern.test(message)) {
      for (const domain of entry.domains) {
        domains.add(domain);
      }
    }
  }
}

export function resolveAuraContextDomains(
  message: string,
  pageContext?: AuraPageContext,
): { domains: Set<AuraContextDomain>; agentsMinimal: boolean } {
  const domains = new Set<AuraContextDomain>();
  addPageContextDomains(pageContext, domains);

  if (isGeneralPlatformQuestion(message) && domains.size === 0) {
    domains.add('agents');
    return { domains, agentsMinimal: true };
  }

  addKeywordDomains(message, domains);

  if (domains.size === 0) {
    domains.add('agents');
    return { domains, agentsMinimal: true };
  }

  return { domains, agentsMinimal: false };
}

export function listSkippedAuraContextDomains(
  selected: Set<AuraContextDomain>,
): AuraContextDomain[] {
  return ALL_DOMAINS.filter((domain) => !selected.has(domain));
}
