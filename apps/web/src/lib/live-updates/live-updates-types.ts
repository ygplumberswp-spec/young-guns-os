export type LiveUpdateEvent = {
  companyId: string;
  eventType: string;
  entityType: string;
  entityId?: string;
  timestamp: number;
  payload?: Record<string, unknown>;
};

export type LiveConnectionState = 'live' | 'syncing' | 'stale' | 'degraded' | 'disconnected';
