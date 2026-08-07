/**
 * YG-CUTOVER-001D — desktop/mobile feature parity + startup performance contracts.
 *
 * Delta only: reuses OWNER-001 / MOBILE-001 / YG-CUTOVER-001B (PR 47) work.
 * RBAC remains authority. Viewport must not silently remove authorised capabilities.
 */

export const YG_CUTOVER_001D_LABEL = 'YG-CUTOVER-001D' as const;

/** Breakpoints reused for regression (same set as 001B). */
export const YG_CUTOVER_001D_REGRESSION_BREAKPOINTS = [
  360, 390, 430, 768, 1024, 1366, 1920,
] as const;

/**
 * Canonical experience shells by role — not viewport forks.
 * Owner/Manager share AppLayout on phone and desktop; presentation is responsive CSS only.
 */
export const YG_CUTOVER_001D_EXPERIENCE_SHELLS = {
  ownerManagerStaff: {
    shell: 'AppLayout',
    home: '/',
    navSource: 'OWNER_STAFF_NAV_ITEMS + permission filter',
    viewportCapabilityGate: false,
    note: 'Same authorised nav/data on 360px and 1920px; chrome compaction only',
  },
  technician: {
    shell: 'MobileLayout',
    home: '/mobile',
    navSource: 'TECHNICIAN_NAV_ITEMS',
    viewportCapabilityGate: false,
    note: 'Role experience (field), not a desktop capability strip — staff shell redirects to /mobile',
  },
  client: {
    shell: 'PortalLayout',
    home: '/my',
    navSource: 'CLIENT_PORTAL_NAV_ITEMS',
    viewportCapabilityGate: false,
    note: 'Portal principal — own jobs/quotes/invoices/documents/messages only',
  },
} as const;

/** Owner core surfaces that must remain available on mobile AppLayout (presentation may stack). */
export const YG_CUTOVER_001D_OWNER_CORE_SURFACES = [
  'AURA',
  'Business Heartbeat',
  'Attention Required',
  'Jobs',
  'Finance',
  'Fleet / Live Map',
  'Quick tools',
  'approvals',
  'notifications',
  'relevant navigation',
] as const;

/** Manager/Admin surfaces audited against MANAGER_PERMISSIONS (not Owner elevation). */
export const YG_CUTOVER_001D_MANAGER_CORE_SURFACES = [
  'AURA',
  'CRM',
  'jobs',
  'scheduling',
  'authorised finance',
  'inventory',
  'fleet',
  'documents',
  'communications',
  'team management allowed by RBAC',
  'marketing/analytics',
  'integrations/settings allowed by RBAC',
] as const;

/**
 * Intentional role-shell differences — NOT viewport mismatches.
 * Documented so audits do not treat experience routing as a parity defect.
 */
export const YG_CUTOVER_001D_INTENTIONAL_SHELL_DIFFERENCES = [
  {
    roles: ['Technician'],
    difference: 'Dedicated /mobile field shell vs staff AppLayout',
    reason: 'resolveStaffExperience → technician home /mobile; OwnerStaffRoute blocks tech on staff modules',
    viewportMismatch: false,
  },
  {
    roles: ['Client'],
    difference: 'Portal /my vs staff AppLayout',
    reason: 'Portal principal + CLIENT_PERMISSIONS; staff routes use ProtectedRoute + OwnerStaffRoute',
    viewportMismatch: false,
  },
  {
    roles: ['Manager', 'Company Owner'],
    difference: 'Manager lacks Owner-only modules (e.g. privileged AURA decide, role assign)',
    reason: 'RBAC matrix — not viewport',
    viewportMismatch: false,
  },
] as const;

/** Capability mismatches found in 001D audit (empty = none by viewport). */
export const YG_CUTOVER_001D_VIEWPORT_CAPABILITY_MISMATCHES = [] as const;

/** Progressive dashboard paint contract (client-side). */
export const YG_CUTOVER_001D_DASHBOARD_DEFER_MS = {
  ops: 120,
  fleet: 180,
  financePulse: 250,
  support: 320,
  mapsWarmOn: 'deferFleet',
} as const;

/** Work reused from prior cutover — do not re-implement. */
export const YG_CUTOVER_001D_REUSED_WORK = [
  'OWNER-001 command centre composition',
  'MOBILE-001 responsive shell / safe-area',
  'YG-CUTOVER-001B Manager mobile clipping + RBAC docs',
  'AURA primary mobile DOM/CSS order',
  'Mobile TITAN header / logo polish (360/390/430)',
  'PERF-001 deferred ops/fleet/support + scoped query cache',
] as const;

/** 001D performance deltas applied on top of PERF-001. */
export const YG_CUTOVER_001D_PERF_DELTAS = [
  'Defer OwnerCommandFinancePulse (250ms) with section skeleton',
  'Warm Google Maps browser-config + script when deferFleet arms',
  'Lazy-load portal (/my) and technician (/mobile) page modules',
  'Remove TechnicianRoute duplicate full-page Loading… spinner',
] as const;

export const YG_CUTOVER_001D_HEADER_VERIFICATION = {
  status: 'PASS_REUSED',
  source: 'YG-CUTOVER-001B mobile header polish',
  proof: 'diagnostic-output/yg-mobile-header-polish-proof.json',
  note: 'Verified only — no rework in 001D',
} as const;
