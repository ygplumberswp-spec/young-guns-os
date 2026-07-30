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

export async function fetchCompanyMediaStatus(accessToken: string) {
  const data = await request<{ configured: boolean; requiredEnv: string }>(
    '/company/media/status',
    {
      accessToken,
    },
  );
  return data;
}

export function companyMediaUrl(fileId: string): string {
  return `/api/v1/company/media/${fileId}`;
}

export async function uploadCompanyMedia(
  accessToken: string,
  input: { kind: 'logo' | 'profile_image'; mimeType: string; dataBase64: string },
): Promise<CompanyProfile> {
  const data = await request<{ file: { id: string }; profile: CompanyProfile }>('/company/media', {
    accessToken,
    method: 'POST',
    body: input,
  });
  return data.profile;
}

export async function removeCompanyMedia(
  accessToken: string,
  fileId: string,
): Promise<CompanyProfile | null> {
  const data = await request<{ success: boolean; profile: CompanyProfile | null }>(
    `/company/media/${fileId}`,
    { accessToken, method: 'DELETE' },
  );
  return data.profile;
}
