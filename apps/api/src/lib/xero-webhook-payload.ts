export type XeroWebhookInboundEvent = {
  resourceUrl: string;
  resourceId: string;
  eventDateUtc?: string;
  eventType: string;
  eventCategory: string;
  tenantId: string;
  tenantType: string;
};

export type XeroWebhookPayload = {
  events: XeroWebhookInboundEvent[];
  firstEventSequence?: number;
  lastEventSequence?: number;
  entropy?: string;
};

export type ParseXeroWebhookPayloadResult =
  | { ok: true; payload: XeroWebhookPayload }
  | { ok: false; code: 'INVALID_JSON' | 'INVALID_STRUCTURE' };

const REQUIRED_EVENT_FIELDS = [
  'resourceUrl',
  'resourceId',
  'eventType',
  'eventCategory',
  'tenantId',
  'tenantType',
] as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidEventShape(event: unknown): event is XeroWebhookInboundEvent {
  if (typeof event !== 'object' || event === null || Array.isArray(event)) {
    return false;
  }

  const record = event as Record<string, unknown>;
  if (!REQUIRED_EVENT_FIELDS.every((field) => isNonEmptyString(record[field]))) {
    return false;
  }

  if (
    record.eventDateUtc !== undefined &&
    record.eventDateUtc !== null &&
    typeof record.eventDateUtc !== 'string'
  ) {
    return false;
  }

  return true;
}

/** Parse and structurally validate an Xero webhook body after signature verification. */
export function parseXeroWebhookPayload(rawBody: string): ParseXeroWebhookPayloadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, code: 'INVALID_JSON' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, code: 'INVALID_STRUCTURE' };
  }

  const record = parsed as Record<string, unknown>;
  if ('events' in record && record.events !== undefined && !Array.isArray(record.events)) {
    return { ok: false, code: 'INVALID_STRUCTURE' };
  }

  const eventsRaw = Array.isArray(record.events) ? record.events : [];
  for (const event of eventsRaw) {
    if (!isValidEventShape(event)) {
      return { ok: false, code: 'INVALID_STRUCTURE' };
    }
  }

  return {
    ok: true,
    payload: {
      events: eventsRaw,
      firstEventSequence:
        typeof record.firstEventSequence === 'number' ? record.firstEventSequence : undefined,
      lastEventSequence:
        typeof record.lastEventSequence === 'number' ? record.lastEventSequence : undefined,
      entropy: typeof record.entropy === 'string' ? record.entropy : undefined,
    },
  };
}
