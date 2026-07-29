import type { CompanyProfile, UpdateCompanyProfileRequest } from '@titan/shared';
import { request } from './api-client';

export async function fetchCompanyProfile(accessToken: string): Promise<CompanyProfile> {
  const data = await request<{ profile: CompanyProfile }>('/company/profile', {
    accessToken,
  });

  return data.profile;
}

export async function updateCompanyProfile(
  accessToken: string,
  body: UpdateCompanyProfileRequest,
): Promise<CompanyProfile> {
  const data = await request<{ profile: CompanyProfile }>('/company/profile', {
    method: 'PATCH',
    accessToken,
    body,
  });

  return data.profile;
}
