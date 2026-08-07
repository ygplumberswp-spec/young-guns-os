import type { IntegrationSyncHealth } from '@titan/shared';

export function deriveCartrackSyncHealthForTest(connection: {
  status: 'disconnected' | 'pending' | 'connected' | 'error';
  lastError: string | null;
}): IntegrationSyncHealth {
  if (connection.status === 'connected' && !connection.lastError) {
    return 'healthy';
  }

  if (connection.status === 'connected' && connection.lastError) {
    return 'degraded';
  }

  if (connection.status === 'error') {
    return 'failed';
  }

  return 'unknown';
}
