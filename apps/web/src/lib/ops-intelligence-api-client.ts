import type {
  OpsAckReminderRequest,
  OpsIntelligenceEvent,
  OpsIntelligenceSnapshot,
  OpsLiveStrip,
  OpsMorningBrief,
  OpsReminderStateSummary,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchOpsIntelligenceSnapshot(
  accessToken: string,
): Promise<OpsIntelligenceSnapshot> {
  const data = await request<{ snapshot: OpsIntelligenceSnapshot }>('/ops-intelligence/snapshot', {
    accessToken,
  });
  return data.snapshot;
}

/**
 * Forces a live re-evaluation. The read path deliberately serves the stored snapshot,
 * so an Owner asking for current figures has to say so explicitly.
 */
export async function refreshOpsIntelligenceSnapshot(
  accessToken: string,
): Promise<OpsIntelligenceSnapshot> {
  const data = await request<{ snapshot: OpsIntelligenceSnapshot }>(
    '/ops-intelligence/snapshot/refresh',
    { accessToken, method: 'POST' },
  );
  return data.snapshot;
}

export async function fetchOpsLiveStrip(accessToken: string): Promise<OpsLiveStrip> {
  const data = await request<{ liveStrip: OpsLiveStrip }>('/ops-intelligence/live-strip', {
    accessToken,
  });
  return data.liveStrip;
}

export async function fetchOpsMorningBrief(accessToken: string): Promise<OpsMorningBrief> {
  const data = await request<{ morningBrief: OpsMorningBrief }>('/ops-intelligence/morning-brief', {
    accessToken,
  });
  return data.morningBrief;
}

export async function fetchOpsEvents(accessToken: string): Promise<OpsIntelligenceEvent[]> {
  const data = await request<{ events: OpsIntelligenceEvent[] }>('/ops-intelligence/events', {
    accessToken,
  });
  return data.events;
}

export async function ackOpsReminder(
  accessToken: string,
  input: OpsAckReminderRequest & { dedupeKey: string },
): Promise<OpsReminderStateSummary> {
  const data = await request<{ reminder: OpsReminderStateSummary }>('/ops-intelligence/reminders/ack', {
    accessToken,
    method: 'POST',
    body: input,
  });
  return data.reminder;
}
