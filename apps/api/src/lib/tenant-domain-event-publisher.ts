import type { TenantDomainEvent } from '@titan/shared';
import { emitBusinessEvent, type BusinessEvent } from './automation-events.js';
import type { TenantDomainEventBus } from '../services/tenant-domain-event-bus.service.js';

let bus: TenantDomainEventBus | null = null;

export function bindTenantDomainEventBus(instance: TenantDomainEventBus): void {
  bus = instance;
}

export function publishTenantDomainEvent(event: TenantDomainEvent): void {
  if (bus) {
    bus.publish(event);
    return;
  }

  emitBusinessEvent(event as BusinessEvent);
}
