export type CompanyPreferences = {
  timezone?: string;
  currency?: string;
  locale?: string;
  aiTone?: 'professional' | 'friendly' | 'concise';
  notes?: string;
  tradingName?: string;
  ownerName?: string;
  ownerJobTitle?: string;
  companyTelephone?: string;
  companyEmail?: string;
  website?: string;
  physicalAddress?: string;
  postalAddress?: string;
  companyRegistrationNumber?: string;
  vatNumber?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  businessDescription?: string;
  servicesOffered?: string;
  operatingHours?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  brandPrimaryColor?: string;
  brandAccentColor?: string;
  logoFileId?: string | null;
  profileImageFileId?: string | null;
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
