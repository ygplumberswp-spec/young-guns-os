import type { AuraPageContextModule } from './contextual-aura-context';

export type AuraSuggestionChip = {
  id: string;
  label: string;
  prompt: string;
};

const MODULE_SUGGESTIONS: Record<AuraPageContextModule, AuraSuggestionChip[]> = {
  dashboard: [
    { id: 'priorities', label: 'Explain priorities', prompt: 'What should I focus on today and why?' },
    { id: 'actions', label: 'Top actions', prompt: 'What are the top 3 actions I should take right now?' },
  ],
  leads: [
    { id: 'summarise', label: 'Summarise leads', prompt: 'Summarise my open leads and what needs attention.' },
    { id: 'follow-up', label: 'Follow-up plan', prompt: 'Which leads need follow-up today?' },
  ],
  crm: [
    { id: 'history', label: 'Customer history', prompt: 'Summarise this customer history, jobs and balance.' },
    { id: 'retention', label: 'Retention', prompt: 'What retention or maintenance action do you recommend?' },
  ],
  jobs: [
    { id: 'readiness', label: 'Job readiness', prompt: 'Is this job ready to schedule or close out?' },
    { id: 'missing', label: 'Missing items', prompt: 'What materials, photos or documents are still missing?' },
  ],
  scheduling: [
    { id: 'technician', label: 'Recommend technician', prompt: 'Who is the best technician for the next open job?' },
    { id: 'clashes', label: 'Detect clashes', prompt: 'Are there scheduling clashes I should resolve?' },
  ],
  finance: [
    { id: 'invoice-state', label: 'Invoice state', prompt: 'Explain this invoice state and the correct next action.' },
    { id: 'follow-up', label: 'Payment follow-up', prompt: 'Draft a payment follow-up message for outstanding invoices.' },
  ],
  inventory: [
    { id: 'shortage', label: 'Explain shortage', prompt: 'What stock shortages are blocking jobs?' },
    { id: 'reorder', label: 'Suggest reorder', prompt: 'What should we reorder based on current stock levels?' },
  ],
  procurement: [
    { id: 'pipeline', label: 'Pipeline status', prompt: 'Summarise the procure-to-pay pipeline and blockers.' },
    { id: 'approval', label: 'Pending approval', prompt: 'Which purchase orders need approval?' },
  ],
  fleet: [
    { id: 'status', label: 'Fleet status', prompt: 'Explain current fleet status and any stale GPS.' },
    { id: 'maintenance', label: 'Maintenance', prompt: 'Which vehicles need maintenance attention?' },
  ],
  communications: [
    { id: 'thread', label: 'Summarise thread', prompt: 'Summarise this communication thread and commitments.' },
    { id: 'draft', label: 'Draft reply', prompt: 'Draft a professional reply for this thread.' },
  ],
  documents: [
    { id: 'completeness', label: 'Check completeness', prompt: 'Are required documents and COC fields complete?' },
    { id: 'gaps', label: 'Compliance gaps', prompt: 'What compliance gaps remain on this record?' },
  ],
  analytics: [
    { id: 'metrics', label: 'Explain metrics', prompt: 'Explain the key metrics on this page with evidence.' },
    { id: 'trends', label: 'Identify trends', prompt: 'What trends should I act on from this data?' },
  ],
  settings: [
    { id: 'config', label: 'Explain config', prompt: 'Explain this configuration and whether it looks correct.' },
    { id: 'diagnose', label: 'Diagnose connection', prompt: 'Diagnose integration connection state and next steps.' },
  ],
  aura: [
    { id: 'plan', label: "Today's plan", prompt: "What is today's operating plan?" },
    { id: 'health', label: 'Company health', prompt: 'Summarise company health and risks.' },
  ],
  other: [
    { id: 'help', label: 'How can AURA help?', prompt: 'What can you help me with on this page?' },
  ],
};

export function resolveAuraSuggestions(module: AuraPageContextModule): AuraSuggestionChip[] {
  return MODULE_SUGGESTIONS[module] ?? MODULE_SUGGESTIONS.other;
}

export function inferAuraModuleFromPath(path: string): AuraPageContextModule {
  if (path === '/' || path.startsWith('/dashboard')) return 'dashboard';
  if (path.startsWith('/leads')) return 'leads';
  if (path.startsWith('/crm')) return 'crm';
  if (path.startsWith('/jobs')) return 'jobs';
  if (path.startsWith('/scheduling') || path.startsWith('/dispatch')) return 'scheduling';
  if (path.startsWith('/finance')) return 'finance';
  if (path.startsWith('/inventory')) return 'inventory';
  if (path.startsWith('/procurement')) return 'procurement';
  if (path.startsWith('/fleet')) return 'fleet';
  if (path.startsWith('/communications')) return 'communications';
  if (path.startsWith('/documents')) return 'documents';
  if (path.startsWith('/analytics')) return 'analytics';
  if (path.startsWith('/settings') || path.startsWith('/integrations')) return 'settings';
  if (path.startsWith('/aura')) return 'aura';
  return 'other';
}
