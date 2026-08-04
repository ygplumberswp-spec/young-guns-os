import type { Response } from 'express';
import { bindAutomationEventEmitter, type BusinessEvent } from './automation-events.js';

export type LiveUpdateEvent = {
  companyId: string;
  eventType: string;
  entityType: string;
  entityId?: string;
  timestamp: number;
  payload?: Record<string, unknown>;
};

type LiveUpdateListener = {
  companyId: string;
  response: Response;
  pingInterval: ReturnType<typeof setInterval>;
  cleanup: () => void;
};

class LiveUpdatesManager {
  private listeners = new Map<string, LiveUpdateListener[]>();
  private eventCounter = 0;

  subscribe(companyId: string, response: Response): () => void {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();
    response.write(':ping\n\n');

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(pingInterval);
      const current = this.listeners.get(companyId);
      if (current) {
        const next = current.filter((item) => item !== listener);
        if (next.length === 0) this.listeners.delete(companyId);
        else this.listeners.set(companyId, next);
      }
      try {
        response.end();
      } catch {
        /* closed */
      }
    };

    const pingInterval = setInterval(() => {
      try {
        response.write(':ping\n\n');
      } catch {
        cleanup();
      }
    }, 30000);

    const listener: LiveUpdateListener = { companyId, response, pingInterval, cleanup };
    const bucket = this.listeners.get(companyId) ?? [];
    bucket.push(listener);
    this.listeners.set(companyId, bucket);

    response.on('close', cleanup);
    response.on('error', cleanup);
    return cleanup;
  }

  broadcast(event: LiveUpdateEvent): void {
    this.eventCounter += 1;
    const listeners = this.listeners.get(event.companyId);
    if (!listeners?.length) return;

    const body = JSON.stringify(event);
    const message = `id: ${this.eventCounter}\nevent: update\ndata: ${body}\n\n`;
    for (const listener of listeners) {
      try {
        listener.response.write(message);
      } catch {
        /* client gone */
      }
    }
  }

  getConnectionCount(companyId?: string): number {
    if (companyId) return this.listeners.get(companyId)?.length ?? 0;
    let total = 0;
    for (const bucket of this.listeners.values()) total += bucket.length;
    return total;
  }

  resetForTests(): void {
    for (const bucket of this.listeners.values()) {
      for (const listener of bucket) {
        listener.cleanup();
      }
    }
    this.listeners.clear();
    this.eventCounter = 0;
  }
}

export const liveUpdatesManager = new LiveUpdatesManager();

export function emitLiveUpdate(event: Omit<LiveUpdateEvent, 'timestamp'>): void {
  liveUpdatesManager.broadcast({ ...event, timestamp: Date.now() });
}

bindAutomationEventEmitter(async (event: BusinessEvent) => {
  emitLiveUpdate({
    companyId: event.companyId,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    payload: event.payload,
  });
});
