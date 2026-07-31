import { formatAddressLine } from './contact-validation.js';

export type JobPriority = 'low' | 'normal' | 'high' | 'urgent';

export const JOB_PRIORITY_OPTIONS: Array<{ value: JobPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

/** Young Guns plumbing service categories — used as job type / auto-title source. */
export const JOB_TYPE_OPTIONS = [
  'Blocked drain',
  'Leak detection',
  'Geyser installation',
  'Geyser repair',
  'Toilet / cistern',
  'Tap / mixer',
  'Burst pipe',
  'Water pressure',
  'Sewer / mainline',
  'Bathroom renovation plumbing',
  'COC / compliance',
  'Maintenance',
  'Emergency call-out',
  'Other',
] as const;

export type JobAddressInput = {
  street: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  unit?: string | null;
};

export type JobSiteContactInput = {
  name: string;
  mobile: string;
  email?: string | null;
};

export function formatJobNumber(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('Job number sequence must be a positive integer');
  }
  return `JOB-${String(sequence).padStart(6, '0')}`;
}

/**
 * Visible operational title:
 * `{job type} — {address/suburb} — {customer/site contact}`
 */
export function generateJobTitle(input: {
  jobType: string;
  suburb?: string | null;
  street?: string | null;
  customerOrSiteContactName: string;
}): string {
  const jobType = input.jobType.trim() || 'Job';
  const place =
    (input.suburb && input.suburb.trim()) || (input.street && input.street.trim()) || 'Site';
  const who = input.customerOrSiteContactName.trim() || 'Customer';
  return `${jobType} — ${place} — ${who}`.slice(0, 200);
}

export function buildJobAddressDisplay(snapshot: {
  street?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  unit?: string | null;
}): string | null {
  const formatted = formatAddressLine({
    street: snapshot.street,
    unit: snapshot.unit,
    suburb: snapshot.suburb,
    city: snapshot.city,
    province: snapshot.province,
    postalCode: snapshot.postalCode,
  });
  return formatted || null;
}

export function requireJobAddress(
  address:
    | Partial<{
        street?: string | null;
        suburb?: string | null;
        city?: string | null;
        province?: string | null;
        postalCode?: string | null;
        unit?: string | null;
      }>
    | null
    | undefined,
): JobAddressInput {
  if (!address) {
    throw new Error('Property or site address is required');
  }
  const street = address.street?.trim() ?? '';
  const suburb = address.suburb?.trim() ?? '';
  const city = address.city?.trim() ?? '';
  const province = address.province?.trim() ?? '';
  const postalCode = address.postalCode?.trim() ?? '';
  const unit = address.unit?.trim() || null;

  if (!street || !suburb || !city || !province || !postalCode) {
    throw new Error('Street, suburb, city, province and postal code are required');
  }

  return { street, suburb, city, province, postalCode, unit };
}
