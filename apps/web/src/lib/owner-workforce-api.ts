import type { OwnerWorkforceView } from '@titan/shared';
import { request } from './api-client';

export async function fetchOwnerWorkforceView(
  accessToken: string,
  date?: string,
): Promise<OwnerWorkforceView> {
  const params = date ? `?date=${encodeURIComponent(date)}` : '';
  const data = await request<{ view: OwnerWorkforceView }>(
    `/enterprise-workforce/owner-workforce${params}`,
    { accessToken },
  );
  return data.view;
}
