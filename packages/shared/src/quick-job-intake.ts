/**
 * Last-minute / emergency job intake + Owner NEW CALL / AURA scheduling proposals.
 * Extends Jobs + Scheduling + VAIR + Dispatch — does not invent a parallel system.
 */

import type { JobPriority } from './job-contract.js';
import type { JobDetail, JobSummary } from './jobs.js';

export const QUICK_JOB_INTAKE_SOURCES = [
  'technician',
  'owner',
  'office',
  'aura',
  'business_call',
  'personal_call_manual',
] as const;

export type QuickJobIntakeSource = (typeof QUICK_JOB_INTAKE_SOURCES)[number];

export const QUICK_JOB_INTAKE_STATUSES = [
  'needs_office_confirmation',
  'confirmed',
] as const;

export type QuickJobIntakeStatus = (typeof QUICK_JOB_INTAKE_STATUSES)[number];

export const QUICK_JOB_URGENCY_OPTIONS = [
  'emergency',
  'same_day',
  'next_available',
  'scheduled',
] as const;

export type QuickJobUrgency = (typeof QUICK_JOB_URGENCY_OPTIONS)[number];

export const PERSONAL_CALL_INTAKE_PRIVACY =
  'TITAN does not access ordinary personal phone call history. Paste the number and a short description from a business call you took personally — only what you enter is stored.';

/** Limited match — never a CRM browse payload. */
export type QuickIntakeCustomerMatch = {
  customerId: string;
  customerName: string;
  phone: string | null;
  propertyCount: number;
  matchConfidence: 'exact' | 'partial';
};

export type QuickIntakePropertyMatch = {
  propertyId: string;
  customerId: string;
  propertyName: string;
  addressDisplay: string | null;
  suburb: string | null;
  city: string | null;
};

export type QuickIntakeOpenJobWarning = {
  jobId: string;
  jobNumber: string | null;
  title: string;
  status: string;
  executionPhase: string | null;
  scheduledAt: string | null;
  reason: string;
};

export type TechnicianQuickAddJobRequest = {
  customerName: string;
  phone: string;
  /** Freeform site address or suburb/area when full address unknown. */
  siteAddress: string;
  workDescription: string;
  urgency: QuickJobUrgency;
  preferredTiming?: string | null;
  notes?: string | null;
  /** Existing customer when match confirmed — never from CRM browse. */
  matchedCustomerId?: string | null;
  matchedPropertyId?: string | null;
  /** Only honoured when technician has explicit self-assign permission. */
  assignToSelf?: boolean;
  overrideDuplicateWarning?: boolean;
  photoDocIds?: string[];
  clientActionId?: string | null;
};

export type OwnerQuickCallIntakeRequest = {
  phone: string;
  issue: string;
  location?: string | null;
  need?: string | null;
  customerName?: string | null;
  urgencyHint?: QuickJobUrgency | null;
  preferredTiming?: string | null;
  notes?: string | null;
  /** personal_call_manual | owner | office | business_call */
  source?: Extract<
    QuickJobIntakeSource,
    'owner' | 'office' | 'business_call' | 'personal_call_manual'
  >;
  matchedCustomerId?: string | null;
  matchedPropertyId?: string | null;
  createJobNow?: boolean;
  overrideDuplicateWarning?: boolean;
  clientActionId?: string | null;
};

export type QuickIntakeScheduleProposal = {
  bestTechnicianId: string | null;
  bestTechnicianName: string | null;
  bestSlotStart: string | null;
  bestSlotEnd: string | null;
  expectedArrivalWindow: string | null;
  urgency: QuickJobUrgency;
  priority: JobPriority;
  rationale: string;
  overlapBlocked: boolean;
  stillBusyConflicts: Array<{ jobId: string; title: string; technicianName: string | null }>;
  cartrackUsed: boolean;
  mapsUsed: boolean;
  emergency: boolean;
  candidates: Array<{
    technicianId: string;
    technicianName: string;
    availabilityScore: number;
    workloadCount: number;
    distanceKm: number | null;
    hasStillBusyWork: boolean;
    recommendation: string;
  }>;
};

export type QuickIntakePrepareResult = {
  matches: QuickIntakeCustomerMatch[];
  properties: QuickIntakePropertyMatch[];
  openJobWarnings: QuickIntakeOpenJobWarning[];
  suggestedUrgency: QuickJobUrgency;
  proposal: QuickIntakeScheduleProposal;
  privacyNote: string | null;
};

export type QuickIntakeCreateResult = {
  job: JobDetail;
  customerCreated: boolean;
  propertyCreated: boolean;
  intakeStatus: QuickJobIntakeStatus;
  assignedToSelf: boolean;
  requiresOfficeConfirmation: boolean;
  openJobWarnings: QuickIntakeOpenJobWarning[];
  proposal: QuickIntakeScheduleProposal;
  notifiedRoles: string[];
  source: QuickJobIntakeSource;
};

export type ConfirmTechnicianIntakeRequest = {
  assignedUserId?: string | null;
  scheduledAt?: string | null;
  scheduledEndAt?: string | null;
  notes?: string | null;
  clientActionId?: string | null;
};

export function urgencyToPriority(urgency: QuickJobUrgency): JobPriority {
  if (urgency === 'emergency') return 'urgent';
  if (urgency === 'same_day') return 'high';
  if (urgency === 'next_available') return 'normal';
  return 'normal';
}

export function suggestUrgencyFromText(text: string): QuickJobUrgency {
  const lower = text.toLowerCase();
  if (
    /\b(emergency|asap|burst|flood|no water|gas leak|sewage|overflow|urgent)\b/.test(lower)
  ) {
    return 'emergency';
  }
  if (/\b(today|same day|this afternoon|tonight)\b/.test(lower)) {
    return 'same_day';
  }
  if (/\b(tomorrow|next available|soon)\b/.test(lower)) {
    return 'next_available';
  }
  return 'scheduled';
}

/** Expand freeform location into a create-job address (office can refine). */
export function expandIntakeAddress(siteAddress: string): {
  street: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  unit: string | null;
} {
  const raw = siteAddress.trim();
  if (!raw) {
    throw new Error('Property/site address is required');
  }
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 4) {
    return {
      street: parts[0]!,
      suburb: parts[1]!,
      city: parts[2]!,
      province: parts[3]!,
      postalCode: parts[4] || '0000',
      unit: null,
    };
  }
  if (parts.length === 2) {
    const firstLooksLikeStreet =
      /\d/.test(parts[0]!) ||
      /\b(st|street|rd|road|ave|drive|dr|close|way)\b/i.test(parts[0]!);
    if (firstLooksLikeStreet) {
      return {
        street: parts[0]!.slice(0, 300),
        suburb: parts[1]!.slice(0, 120),
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '0000',
        unit: null,
      };
    }
    return {
      street: 'Site address TBC — confirm on dispatch',
      suburb: parts[0]!,
      city: parts[1]!,
      province: 'Western Cape',
      postalCode: '0000',
      unit: null,
    };
  }
  // Single suburb/area token (e.g. "Durbanville") or one-line address.
  const looksLikeStreet = /\d/.test(raw) || /\b(st|street|rd|road|ave|drive|dr|close|way)\b/i.test(raw);
  return {
    street: looksLikeStreet ? raw.slice(0, 300) : 'Site address TBC — confirm on dispatch',
    suburb: looksLikeStreet ? 'To confirm' : raw.slice(0, 120),
    city: 'Cape Town',
    province: 'Western Cape',
    postalCode: '0000',
    unit: null,
  };
}

export function technicianMaySelfAssign(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  if (permissions.includes('jobs:field_self_assign')) return true;
  if (permissions.includes('scheduling:self_assign')) return true;
  return false;
}

export function canUseOwnerQuickCall(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (identity.roleName ?? '').toLowerCase();
  if (role.includes('technician') || role.includes('client')) return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  if (permissions.includes('jobs:write') || permissions.includes('scheduling:write')) return true;
  return (
    role.includes('owner') ||
    role.includes('admin') ||
    role.includes('manager') ||
    role.includes('office') ||
    role.includes('dispatcher')
  );
}

export type { JobDetail, JobSummary };
