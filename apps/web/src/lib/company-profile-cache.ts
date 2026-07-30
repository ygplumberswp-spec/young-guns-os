import type { CompanyProfile } from '@titan/shared';

const profileCache = new Map<string, CompanyProfile>();
const inflightRequests = new Map<string, Promise<CompanyProfile>>();

export function getCachedCompanyProfile(accessToken: string): CompanyProfile | null {
  return profileCache.get(accessToken) ?? null;
}

export function setCachedCompanyProfile(accessToken: string, profile: CompanyProfile): void {
  profileCache.set(accessToken, profile);
}

export function getInflightCompanyProfileRequest(
  accessToken: string,
): Promise<CompanyProfile> | null {
  return inflightRequests.get(accessToken) ?? null;
}

export function setInflightCompanyProfileRequest(
  accessToken: string,
  promise: Promise<CompanyProfile>,
): void {
  inflightRequests.set(accessToken, promise);
}

export function clearInflightCompanyProfileRequest(accessToken: string): void {
  inflightRequests.delete(accessToken);
}

export function invalidateCompanyProfileCache(accessToken?: string): void {
  if (accessToken) {
    profileCache.delete(accessToken);
    inflightRequests.delete(accessToken);
    return;
  }

  profileCache.clear();
  inflightRequests.clear();
}
