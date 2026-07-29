import type { AuraGenerateContext } from './types.js';
import type { CompanyPreferences } from '@titan/shared';

export type CompanyContextSource = {
  id: string;
  name: string;
  industry?: string | null;
  businessType?: string | null;
  preferences?: CompanyPreferences;
};

export function buildAuraCompanyContext(
  company: CompanyContextSource,
  userName: string,
): AuraGenerateContext {
  return {
    companyId: company.id,
    companyName: company.name,
    userName,
    industry: company.industry ?? null,
    businessType: company.businessType ?? null,
    preferences: company.preferences ?? {},
  };
}
