import type { LiveUpdateEvent } from './live-updates-types';

/** Maps backend entity types to query-cache prefixes invalidated on live updates. */
export function liveUpdateInvalidationPrefixes(event: LiveUpdateEvent): string[] {
  switch (event.entityType) {
    case 'customer':
      return ['crm/customers', 'crm/stats'];
    case 'quote':
      return ['finance/quotes', 'finance/stats', 'finance/jobs'];
    case 'invoice':
      return ['finance/invoices', 'finance/stats', 'finance/jobs', 'finance/payments'];
    case 'payment':
      return ['finance/payments', 'finance/stats', 'finance/invoices', 'finance/jobs'];
    case 'job':
      return ['jobs/list', 'jobs/stats', 'finance/jobs', 'scheduling/calendar'];
    case 'document':
      return ['documents/list', 'finance/invoices', 'finance/quotes'];
    case 'communication':
      return ['communications/hub', 'crm/customers'];
    case 'vehicle':
    case 'fleet':
      return ['fleet/vehicles', 'fleet/telemetry'];
    case 'integration':
    case 'xero':
      return ['integrations/xero', 'background-work', 'finance/invoices', 'finance/quotes'];
    case 'dashboard':
      return ['dashboard/owner', 'ops/intelligence'];
    default:
      return [];
  }
}

export function parseLiveUpdateSseChunk(buffer: string): { events: LiveUpdateEvent[]; remainder: string } {
  const events: LiveUpdateEvent[] = [];
  const parts = buffer.split('\n\n');
  const remainder = parts.pop() ?? '';

  for (const part of parts) {
    const dataLine = part.split('\n').find((line) => line.startsWith('data: '));
    if (!dataLine) continue;
    try {
      events.push(JSON.parse(dataLine.slice(6)) as LiveUpdateEvent);
    } catch {
      /* ignore malformed chunk */
    }
  }

  return { events, remainder };
}

export function computeReconnectDelayMs(attempt: number, random = Math.random): number {
  const base = Math.min(30000, 1000 * 2 ** attempt);
  const jitter = Math.floor(random() * 500);
  return base + jitter;
}
