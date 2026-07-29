import type { BusinessEventType, WorkflowTriggerType } from '@titan/shared';
import { BUSINESS_EVENT_TO_TRIGGER } from '@titan/shared';

export type BusinessEvent = {
  companyId: string;
  eventType: BusinessEventType;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  actorUserId?: string;
};

export function resolveTriggerType(event: BusinessEvent): WorkflowTriggerType {
  return BUSINESS_EVENT_TO_TRIGGER[event.eventType];
}

type EventEmitter = (event: BusinessEvent) => Promise<void>;

let emitter: EventEmitter | null = null;

export function bindAutomationEventEmitter(handler: EventEmitter): void {
  emitter = handler;
}

export function emitBusinessEvent(event: BusinessEvent): void {
  if (!emitter) {
    return;
  }

  void emitter(event).catch((error: unknown) => {
    console.error('[automation] Failed to emit business event', error);
  });
}
