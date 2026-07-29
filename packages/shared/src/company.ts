export type CompanyPreferences = {
  timezone?: string;
  currency?: string;
  locale?: string;
  aiTone?: 'professional' | 'friendly' | 'concise';
  notes?: string;
};

export type CompanyProfile = {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  businessType: string | null;
  preferences: CompanyPreferences;
  createdAt: string;
  updatedAt: string;
};

export type UpdateCompanyProfileRequest = {
  name?: string;
  industry?: string | null;
  businessType?: string | null;
  preferences?: CompanyPreferences;
};

export const AI_TONE_OPTIONS = ['professional', 'friendly', 'concise'] as const;

export type AiTone = (typeof AI_TONE_OPTIONS)[number];
