import type { AuraPageContextModule } from './contextual-aura-context';

export type AuraSuggestionChip = {
  id: string;
  label: string;
  prompt: string;
};

export type PortalAuraModule =
  | 'portal_dashboard'
  | 'portal_jobs'
  | 'portal_quotes'
  | 'portal_finance'
  | 'portal_documents'
  | 'portal_communications'
  | 'portal_appointments'
  | 'portal_other';

const PORTAL_SUGGESTIONS: Record<PortalAuraModule, AuraSuggestionChip[]> = {
  portal_dashboard: [
    { id: 'overview', label: 'My overview', prompt: 'Summarise my active jobs, quotes and invoices.' },
    { id: 'next', label: 'What is next?', prompt: 'What should I do next in my portal?' },
  ],
  portal_jobs: [
    { id: 'status', label: 'Job status', prompt: 'Explain the status of my job and what happens next.' },
    { id: 'eta', label: 'Technician ETA', prompt: 'When is my technician expected and what should I prepare?' },
  ],
  portal_quotes: [
    { id: 'explain', label: 'Explain quote', prompt: 'Explain this quote in plain language — scope, price and validity.' },
    { id: 'decision', label: 'Help me decide', prompt: 'What do I need to know before accepting or declining this quote?' },
  ],
  portal_finance: [
    { id: 'balance', label: 'My balance', prompt: 'Explain my outstanding invoices and payment options.' },
    { id: 'invoice', label: 'Invoice help', prompt: 'Explain this invoice and how to pay it.' },
  ],
  portal_documents: [
    { id: 'find', label: 'Find document', prompt: 'Help me find a document related to my property or job.' },
    { id: 'missing', label: 'What is missing?', prompt: 'Are there any documents I still need to provide?' },
  ],
  portal_communications: [
    { id: 'thread', label: 'Summarise messages', prompt: 'Summarise my recent messages and any actions needed.' },
    { id: 'reply', label: 'Draft reply', prompt: 'Draft a polite reply I can send to the service team.' },
  ],
  portal_appointments: [
    { id: 'upcoming', label: 'Upcoming visits', prompt: 'What appointments do I have coming up?' },
    { id: 'reschedule', label: 'Reschedule help', prompt: 'How do I request to reschedule an appointment?' },
  ],
  portal_other: [
    { id: 'help', label: 'How can AURA help?', prompt: 'What can you help me with in my customer portal?' },
  ],
};

/** Map nested `/my` relative paths to portal AURA modules. */
export function inferPortalAuraModuleFromPath(path: string): PortalAuraModule {
  const normalized = path.replace(/^\/my/, '') || '/';
  if (normalized === '/' || normalized === '') return 'portal_dashboard';
  if (normalized.startsWith('/jobs')) return 'portal_jobs';
  if (normalized.startsWith('/quotes')) return 'portal_quotes';
  if (normalized.startsWith('/finance')) return 'portal_finance';
  if (normalized.startsWith('/documents')) return 'portal_documents';
  if (normalized.startsWith('/communications') || normalized.startsWith('/messages')) {
    return 'portal_communications';
  }
  if (normalized.startsWith('/appointments')) return 'portal_appointments';
  return 'portal_other';
}

export function resolvePortalAuraSuggestions(module: PortalAuraModule): AuraSuggestionChip[] {
  return PORTAL_SUGGESTIONS[module] ?? PORTAL_SUGGESTIONS.portal_other;
}

/** Canonical portal route for context display (always `/my/...`). */
export function toPortalAuraRoute(path: string): string {
  if (path.startsWith('/my')) return path;
  if (path === '/' || path === '') return '/my';
  return `/my${path.startsWith('/') ? path : `/${path}`}`;
}

export function portalModuleToAuraModule(module: PortalAuraModule): AuraPageContextModule {
  switch (module) {
    case 'portal_jobs':
      return 'jobs';
    case 'portal_quotes':
    case 'portal_finance':
      return 'finance';
    case 'portal_documents':
      return 'documents';
    case 'portal_communications':
      return 'communications';
    default:
      return 'other';
  }
}
