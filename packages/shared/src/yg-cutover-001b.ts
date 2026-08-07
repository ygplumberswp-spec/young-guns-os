/**
 * YG-CUTOVER-001B — Manager mobile acceptance + RBAC audit contracts.
 *
 * Permissions are NOT inventing new grants — this documents canonical TITAN RBAC
 * (`packages/auth` MANAGER_PERMISSIONS) for cutover acceptance.
 */

export const YG_CUTOVER_001B_LABEL = 'YG-CUTOVER-001B';

export const YG_CUTOVER_001B_MOBILE_BREAKPOINTS = [
  360, 390, 430, 768, 1024, 1366, 1920,
] as const;

/** Rendering-only Maps observation from Manager iPhone staging session. */
export const YG_CUTOVER_001B_GOOGLE_MAPS_EVIDENCE = {
  status: 'rendering_evidence_only' as const,
  observed: [
    'Google map UI renders on Manager mobile dashboard',
    'Current fleet/location marker renders (Cartrack position on Google map canvas)',
  ],
  notDeclaredComplete: [
    'job/property address geocoding',
    'address validation',
    'technician Navigate/Directions',
    'mobile handoff',
    'API key restrictions',
    'tenant/RBAC handling for Maps',
  ],
  authority: {
    fleetGps: 'Cartrack',
    mapGeocodingNavigation: 'Google Maps',
  },
} as const;

/**
 * Manager/Admin/Office acceptance matrix — derived from canonical RBAC.
 * Do not silently elevate Manager to Company Owner.
 */
export const YG_CUTOVER_001B_MANAGER_RBAC_MATRIX = {
  canonicalRoleName: 'Manager',
  legacyAlias: 'Admin',
  inviteable: true,
  elevatedToOwner: false,
  sourceOfTruth: 'packages/auth/src/rbac-matrix.ts → MANAGER_PERMISSIONS',
  canAccess: [
    'Dashboard /',
    'Customers /crm',
    'Leads',
    'Jobs',
    'Scheduling / Live Dispatch',
    'Quotes / Invoices / Payments (finance:read + finance:write)',
    'Inventory / procurement',
    'Fleet (Cartrack fleet authority surfaces)',
    'Documents',
    'Communications / Email',
    'Team & Access (/settings/team) — invite/suspend via users:manage; role assign Owner-only',
    'Marketing operational surfaces',
    'Reports / Analytics',
    'AURA chat + agents (agents:read/write/manage) — privileged decide Owner-only',
    'Integrations page (integrations:read/manage) — OAuth connect often Owner-gated in product helpers',
    'Settings / Company',
    'Security page (security:read/write)',
    'Automation / Workflow / Recurring Maintenance / HomeShield',
    'Owner finance command family when finance:read|write present (cash/profit/budget/growth helpers)',
  ],
  reservedForOwner: [
    'Unrestricted permissions (*)',
    'Manual role assignment / Company Owner promotion',
    'Company memory write (canonical Manager = false)',
    'Executive Command Centre',
    'Social / Facebook connection manage',
    'Business Gmail connect (Owner role gate)',
    'AURA command privileged decide',
    'Smart-notification owner categories / draft approve / settings',
    'Security monitoring owner_full / manage incidents',
    'HR / Payroll timesheet intelligence (Manager nav-hidden or explicitly denied)',
    'Platform / SaaS / release administration',
  ],
  financeVisibility: {
    granted: true,
    why: 'MANAGER_PERMISSIONS includes finance:read and finance:write; Owner-finance helpers deny Technician/Client only',
    surfaces: [
      'Quotes / Invoices / Payments',
      'Owner Financial Command (view)',
      'Cash Control (view)',
      'Profit Analytics / Operating Profit / Budget / Growth Planner (view; write where finance:write)',
    ],
  },
  integrationsSettingsSecurity: {
    integrations: ['integrations:read', 'integrations:manage'],
    settings: ['settings:manage', 'company:manage'],
    security: ['security:read', 'security:write'],
    note: 'Product helpers may still Owner-gate OAuth connect/disconnect even when integrations:manage is present',
  },
  teamAndAccess: {
    usersRead: true,
    usersManage: true,
    canInviteOperationalRoles: true,
    canAssignRoles: false,
    reasonCannotAssignRoles: 'canAssignRoleName requires Company Owner or Platform Owner',
  },
  aura: {
    chatAndAgents: true,
    commandCentreAccess: true,
    privilegedDecide: false,
    dashboardPrimarySurface: true,
    mobileOrder:
      'AURA → Business Heartbeat → Attention → Jobs → Finance → Fleet → Tools',
    inheritsTenantScope: true,
    ownerOnlyFinanceViaAura: false,
    rbacReason:
      'MANAGER_PERMISSIONS includes agents:read + intelligence:read; getAuraRoleAccessRule(Manager) → Admin (company finance yes, Owner dashboards no)',
  },
  destructiveApprovals: {
    hardDeleteUsers: 'users:manage + safe-delete eligibility (not Owner elevation)',
    roleAssign: false,
    socialConnect: false,
    auraPrivilegedDecide: false,
    executiveApprovals: false,
  },
} as const;

export type YgCutover001bGoogleMapsEvidence = typeof YG_CUTOVER_001B_GOOGLE_MAPS_EVIDENCE;
export type YgCutover001bManagerRbacMatrix = typeof YG_CUTOVER_001B_MANAGER_RBAC_MATRIX;
