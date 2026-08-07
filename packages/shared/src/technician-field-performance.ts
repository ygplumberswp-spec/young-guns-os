/**
 * Technician Performance — nav / exposure decision for Field Mobile.
 *
 * MobilePerformancePage includes overtime hours + productivity score exports.
 * That is not a pure assigned-job execution surface and fails the Owner gate
 * (no payroll/wages-adjacent metrics; no productivity analytics in Technician nav).
 */

export const TECHNICIAN_PERFORMANCE_PATH = '/mobile/performance' as const;

/** Keep Performance out of Technician navigation and deny technician direct URL. */
export const TECHNICIAN_PERFORMANCE_NAV_DECISION = 'remove' as const;

export const TECHNICIAN_PERFORMANCE_FORBIDDEN_METRICS = [
  'revenue',
  'profit',
  'company_analytics',
  'other_technicians',
  'payroll_wages',
  'overtime_hours_as_wage_proxy',
  'productivity_analytics_exports',
] as const;

/** Paths technicians must not open on Field Mobile (deny even under /mobile*). */
export const TECHNICIAN_FORBIDDEN_MOBILE_PATHS = [TECHNICIAN_PERFORMANCE_PATH] as const;
