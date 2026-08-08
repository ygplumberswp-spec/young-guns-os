import type { PropertySiteWorkspace } from '@titan/shared';
import { request } from './api-client';

export async function fetchPropertySite360Workspace(
  accessToken: string,
  propertyId: string,
  opts: { limit?: number; offset?: number; order?: 'newest' | 'oldest' } = {},
): Promise<PropertySiteWorkspace> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  if (opts.order) params.set('order', opts.order);
  const qs = params.toString();
  const data = await request<{ workspace: PropertySiteWorkspace }>(
    `/property-360/properties/${propertyId}/workspace${qs ? `?${qs}` : ''}`,
    { accessToken },
  );
  return data.workspace;
}

export async function updatePropertySite360(
  accessToken: string,
  propertyId: string,
  body: {
    propertyName?: string;
    addressLine1?: string | null;
    addressLine2?: string | null;
    suburb?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
    country?: string | null;
    status?: 'active' | 'inactive' | 'archived';
    accessInstructions?: string | null;
    siteNotes?: string | null;
  },
) {
  return request<{ property: Record<string, unknown>; jobSnapshotsImmutable: true }>(
    `/property-360/properties/${propertyId}`,
    { accessToken, method: 'PATCH', body },
  );
}

export async function archivePropertySite360(accessToken: string, propertyId: string) {
  return request<{ archived: true; hasJobHistory: boolean; hardDeleteBlocked: true }>(
    `/property-360/properties/${propertyId}/archive`,
    { accessToken, method: 'POST', body: {} },
  );
}

export async function searchPropertySites(
  accessToken: string,
  opts: { q?: string; customerId?: string; status?: string; limit?: number; offset?: number } = {},
) {
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.customerId) params.set('customerId', opts.customerId);
  if (opts.status) params.set('status', opts.status);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  const qs = params.toString();
  return request<{
    total: number;
    limit: number;
    offset: number;
    items: Array<{
      id: string;
      customerId: string;
      customerName: string;
      propertyName: string;
      addressLine1: string | null;
      suburb: string | null;
      city: string | null;
      status: string;
      href: string;
    }>;
  }>(`/property-360/properties/search${qs ? `?${qs}` : ''}`, { accessToken });
}
