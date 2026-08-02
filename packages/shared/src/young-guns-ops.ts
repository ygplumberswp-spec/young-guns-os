/**
 * UX-I / UX-035 — Young Guns Cape Town service geography + COC applicability.
 * Stored in company preferences JSON (no separate migration).
 */

export const CAPE_TOWN_DEFAULT_TIMEZONE = 'Africa/Johannesburg';
export const CAPE_TOWN_DEFAULT_LOCALE = 'en-ZA';
export const CAPE_TOWN_DEFAULT_CITY = 'Cape Town';
export const CAPE_TOWN_DEFAULT_PROVINCE = 'Western Cape';

/** Core Young Guns service suburbs — editable per company preferences. */
export const CAPE_TOWN_SERVICE_SUBURBS = [
  'Sea Point',
  'Green Point',
  'CBD',
  'Gardens',
  'Tamboerskloof',
  'Oranjezicht',
  'Vredehoek',
  'Woodstock',
  'Observatory',
  'Mowbray',
  'Rondebosch',
  'Newlands',
  'Claremont',
  'Kenilworth',
  'Wynberg',
  'Constantia',
  'Plumstead',
  'Diep River',
  'Bergvliet',
  'Tokai',
  'Muizenberg',
  'Kalk Bay',
  'Fish Hoek',
  'Hout Bay',
  'Camps Bay',
  'Bantry Bay',
  'Milnerton',
  'Table View',
  'Blouberg',
  'Century City',
  'Pinelands',
  'Bellville',
  'Durbanville',
  'Brackenfell',
  'Kuils River',
  'Somerset West',
  'Strand',
  'Gordon\'s Bay',
] as const;

export type CocApplicability =
  | 'not_applicable'
  | 'may_apply'
  | 'required_for_gas_work'
  | 'required_for_electrical_work'
  | 'pending_classification';

export type YoungGunsServiceGeography = {
  primaryCity: string;
  primaryProvince: string;
  serviceSuburbs: string[];
  outsideAreaPolicy: 'quote_travel' | 'decline' | 'manual_review';
  notes?: string | null;
};

export type YoungGunsCocSettings = {
  /** Default COC stance for plumbing jobs. */
  defaultApplicability: CocApplicability;
  gasWorkRequiresCoc: boolean;
  electricalWorkRequiresCoc: boolean;
  sansReferenceNote: string;
  documentLabel: string;
};

export const DEFAULT_YG_SERVICE_GEOGRAPHY: YoungGunsServiceGeography = {
  primaryCity: CAPE_TOWN_DEFAULT_CITY,
  primaryProvince: CAPE_TOWN_DEFAULT_PROVINCE,
  serviceSuburbs: [...CAPE_TOWN_SERVICE_SUBURBS],
  outsideAreaPolicy: 'manual_review',
  notes: 'Young Guns Plumbing — Cape Town / Southern Suburbs primary service area.',
};

export const DEFAULT_YG_COC_SETTINGS: YoungGunsCocSettings = {
  defaultApplicability: 'may_apply',
  gasWorkRequiresCoc: true,
  electricalWorkRequiresCoc: true,
  sansReferenceNote:
    'SANS / COC requirements apply where gas or electrical work is performed. Classify per job before completion.',
  documentLabel: 'Certificate of Compliance (COC)',
};

/** Honest Maps capability — live Google Maps when connected; never invent routes. */
export type MapsEtaCapabilityState =
  | 'not_implemented'
  | 'not_configured'
  | 'schedule_only'
  | 'provider_unavailable'
  | 'connected';

export function formatMapsEtaCapabilityLabel(state: MapsEtaCapabilityState): string {
  switch (state) {
    case 'connected':
      return 'GOOGLE MAPS CONNECTED';
    case 'schedule_only':
      return 'SCHEDULE ONLY — live Maps/routing not connected';
    case 'not_configured':
      return 'MAPS NOT CONFIGURED';
    case 'provider_unavailable':
      return 'MAPS PROVIDER UNAVAILABLE';
    case 'not_implemented':
    default:
      return 'LIVE MAPS/ROUTING NOT IMPLEMENTED';
  }
}

/** Deep-link only — does not call Google from TITAN servers. */
export function buildAddressMapsDeepLink(address: string | null | undefined): string | null {
  const trimmed = address?.trim();
  if (!trimmed) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}

export function resolveCocApplicabilityForJobType(
  jobType: string | null | undefined,
  settings: YoungGunsCocSettings = DEFAULT_YG_COC_SETTINGS,
): CocApplicability {
  const normalized = (jobType ?? '').toLowerCase();
  if (
    settings.gasWorkRequiresCoc &&
    (normalized.includes('gas') || normalized.includes('geyser') || normalized.includes('lpg'))
  ) {
    return 'required_for_gas_work';
  }
  if (
    settings.electricalWorkRequiresCoc &&
    (normalized.includes('electrical') || normalized.includes('db board'))
  ) {
    return 'required_for_electrical_work';
  }
  return settings.defaultApplicability;
}

export function isSuburbInServiceArea(
  suburb: string | null | undefined,
  geography: YoungGunsServiceGeography = DEFAULT_YG_SERVICE_GEOGRAPHY,
): boolean {
  if (!suburb?.trim()) return false;
  const needle = suburb.trim().toLowerCase();
  return geography.serviceSuburbs.some((item) => item.toLowerCase() === needle);
}
