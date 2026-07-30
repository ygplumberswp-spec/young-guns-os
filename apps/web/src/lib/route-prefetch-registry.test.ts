import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DISPATCHER_ROLE_NAME, OWNER_ROLE_NAME, type StaffExperience } from '@titan/auth';
import { canPrefetchStaffRoute, canPrefetchPortalRoute, type StaffPreloadContext, type PortalPreloadContext } from './route-prefetch-registry.js';

const ownerContext: StaffPreloadContext = {
  kind: 'staff',
  accessToken: 'token',
  scope: {
    tenantId: 'company-1',
    actorId: 'user-1',
    actorKind: 'staff',
    roleName: OWNER_ROLE_NAME,
  },
  user: {
    id: 'user-1',
    companyId: 'company-1',
    roleName: OWNER_ROLE_NAME,
    permissions: ['*'],
  },
};

describe('route prefetch registry', () => {
  it('allows owner priority routes', () => {
    const entry = {
      path: '/crm',
      load: async () => ({}),
      permissions: ['customers:read'],
      priority: 1 as const,
      safeToPreload: true,
    };

    assert.equal(canPrefetchStaffRoute(entry, ownerContext, 'platform_owner'), true);
  });

  it('blocks dispatcher from aura routes', () => {
    const entry = {
      path: '/aura/agents',
      load: async () => ({}),
      permissions: ['agents:read'],
      experiences: ['platform_owner', 'staff'] as StaffExperience[],
      priority: 3 as const,
      safeToPreload: true,
    };

    const dispatcherContext: StaffPreloadContext = {
      ...ownerContext,
      user: {
        ...ownerContext.user,
        roleName: DISPATCHER_ROLE_NAME,
        permissions: ['customers:read', 'jobs:read', 'dispatch:read'],
      },
    };

    assert.equal(canPrefetchStaffRoute(entry, dispatcherContext, 'dispatcher'), false);
  });

  it('blocks portal routes without permission', () => {
    const entry = {
      path: '/portal/jobs',
      load: async () => ({}),
      portalPermission: 'portal.jobs:read' as const,
      priority: 1 as const,
      safeToPreload: true,
    };

    const portalContext: PortalPreloadContext = {
      kind: 'portal',
      accessToken: 'token',
      scope: {
        tenantId: 'company-1',
        actorId: 'portal-1',
        actorKind: 'portal',
        customerId: 'customer-9',
      },
      user: {
        id: 'portal-1',
        email: 'portal@example.com',
        firstName: 'Portal',
        lastName: 'User',
        companyId: 'company-1',
        companyName: 'Example Co',
        customerId: 'customer-9',
        customerName: 'Customer Nine',
        permissions: ['portal.dashboard:read'],
      },
    };

    assert.equal(canPrefetchPortalRoute(entry, portalContext), false);
  });
});
