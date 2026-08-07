import type { DispatchCommunicationHookType, DispatchCommunicationReadiness } from '@titan/shared';
import { request } from './api-client';

export async function fetchDispatchCommunicationReadiness(
  accessToken: string,
  jobId: string,
): Promise<DispatchCommunicationReadiness | null> {
  const data = await request<{ readiness: DispatchCommunicationReadiness | null }>(
    `/enterprise-communications/dispatch-notifications/jobs/${jobId}/readiness`,
    { accessToken },
  );
  return data.readiness;
}

export async function prepareDispatchCommunicationDraft(
  accessToken: string,
  jobId: string,
  hookType: DispatchCommunicationHookType,
): Promise<DispatchCommunicationReadiness | null> {
  const data = await request<{ draft: DispatchCommunicationReadiness | null }>(
    `/enterprise-communications/dispatch-notifications/jobs/${jobId}/prepare`,
    {
      method: 'POST',
      accessToken,
      body: { hookType },
    },
  );
  return data.draft;
}

export async function queueApprovedDispatchCommunication(
  accessToken: string,
  jobId: string,
  input: {
    hookType: DispatchCommunicationHookType;
    channel?: string;
    recipientAddress?: string;
    messageBody?: string;
    etaMinutes?: number;
  },
): Promise<unknown> {
  const data = await request<{ notification: unknown }>(
    `/enterprise-communications/dispatch-notifications/jobs/${jobId}/queue`,
    {
      method: 'POST',
      accessToken,
      body: input,
    },
  );
  return data.notification;
}
