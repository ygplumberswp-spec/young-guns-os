import type { TenantBackgroundWorkStatusResponse } from '@titan/shared';
import { request } from './api-client';

export async function fetchBackgroundWorkStatus(
  accessToken: string,
  options?: { signal?: AbortSignal },
): Promise<TenantBackgroundWorkStatusResponse> {
  const data = await request<{ status: TenantBackgroundWorkStatusResponse }>(
    '/background-work/status',
    {
      accessToken,
      signal: options?.signal,
      timeoutMs: 15_000,
    },
  );
  return data.status;
}
