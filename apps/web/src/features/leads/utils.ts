import { hasAnyPermission } from '@titan/auth/browser';

export function canAccessLeads(permissions: string[]) {
  return hasAnyPermission(permissions, ['leads:read', 'leads:write', '*']);
}

export function canManageLeads(permissions: string[]) {
  return hasAnyPermission(permissions, ['leads:write', '*']);
}

export function canConvertLeads(permissions: string[]) {
  return (
    hasAnyPermission(permissions, ['leads:write', '*']) &&
    hasAnyPermission(permissions, ['customers:write', '*'])
  );
}

/** Job creation during conversion requires jobs:write in addition to convert perms. */
export function canCreateJobFromLead(permissions: string[]) {
  return hasAnyPermission(permissions, ['jobs:write', '*']);
}

export function newClientActionId(prefix = 'lead-convert'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type LeadAddressFields = {
  street?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  unit?: string | null;
};

/** Real site address for conversion — never invent placeholder streets/suburbs. */
export function leadHasConvertibleSiteAddress(lead: LeadAddressFields): boolean {
  return Boolean(lead.street?.trim() && lead.suburb?.trim());
}

export function buildLeadConversionProperty(lead: LeadAddressFields) {
  if (!leadHasConvertibleSiteAddress(lead)) {
    return null;
  }
  return {
    street: lead.street!.trim(),
    suburb: lead.suburb!.trim(),
    city: lead.city?.trim() || 'Cape Town',
    province: lead.province?.trim() || 'Western Cape',
    postalCode: lead.postalCode?.trim() || '0000',
    unit: lead.unit?.trim() || null,
  };
}
