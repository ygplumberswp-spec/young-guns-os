import type { TenantDomainEvent, TenantDomainEventType } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { securityAuditLogs } from '@titan/db';
import { emitBusinessEvent, type BusinessEvent } from '../lib/automation-events.js';

export type DomainEventSubscriber = (event: TenantDomainEvent) => Promise<void>;

export class TenantDomainEventBus {
  private readonly subscribers = new Map<TenantDomainEventType, DomainEventSubscriber[]>();
  private readonly recentKeys = new Map<string, number>();
  private readonly dedupeWindowMs = 5_000;

  constructor(private readonly db: DatabaseClient) {}

  subscribe(eventType: TenantDomainEventType, handler: DomainEventSubscriber): () => void {
    const handlers = this.subscribers.get(eventType) ?? [];
    handlers.push(handler);
    this.subscribers.set(eventType, handlers);

    return () => {
      const current = this.subscribers.get(eventType) ?? [];
      this.subscribers.set(
        eventType,
        current.filter((entry) => entry !== handler),
      );
    };
  }

  publish(event: TenantDomainEvent): void {
    const dedupeKey =
      event.idempotencyKey ??
      `${event.companyId}:${event.eventType}:${event.entityType}:${event.entityId}`;

    const now = Date.now();
    const lastSeen = this.recentKeys.get(dedupeKey);
    if (lastSeen && now - lastSeen < this.dedupeWindowMs) {
      return;
    }
    this.recentKeys.set(dedupeKey, now);

    if (this.recentKeys.size > 500) {
      for (const [key, ts] of this.recentKeys) {
        if (now - ts > this.dedupeWindowMs) {
          this.recentKeys.delete(key);
        }
      }
    }

    void this.dispatch(event).catch((error: unknown) => {
      console.error('[tenant-domain-event-bus] dispatch failed', {
        eventType: event.eventType,
        entityId: event.entityId,
        error,
      });
    });
  }

  private async dispatch(event: TenantDomainEvent): Promise<void> {
    await this.recordAudit(event);

    const automationEvent: BusinessEvent = {
      companyId: event.companyId,
      eventType: event.eventType as BusinessEvent['eventType'],
      entityType: event.entityType,
      entityId: event.entityId,
      payload: event.payload,
      actorUserId: event.actorUserId,
    };

    emitBusinessEvent(automationEvent);

    const handlers = this.subscribers.get(event.eventType) ?? [];
    await Promise.all(
      handlers.map((handler) =>
        handler(event).catch((error: unknown) => {
          console.error('[tenant-domain-event-bus] subscriber failed', {
            eventType: event.eventType,
            error,
          });
        }),
      ),
    );
  }

  private async recordAudit(event: TenantDomainEvent): Promise<void> {
    if (!event.actorUserId) {
      return;
    }

    await this.db.insert(securityAuditLogs).values({
      companyId: event.companyId,
      userId: event.actorUserId,
      category: 'workflow',
      action: `domain_event.${event.eventType}`,
      entityType: event.entityType,
      entityId: event.entityId,
      metadata: {
        payloadKeys: Object.keys(event.payload),
        idempotencyKey: event.idempotencyKey ?? null,
      },
    });
  }
}
