/**
 * Security Monitoring (Department 18).
 *
 * A read-only watch layer over security evidence that already exists in the
 * platform: login events, audit logs, permission grants, sessions, integration
 * state, AI guardrail events, communication access logs and API rate counters.
 *
 * Invariants that the rest of the department depends on:
 *  - Every signal is built from rows that already exist. A threat, a breach or
 *    an attack source is never invented, inferred into certainty, or attributed
 *    to a named actor.
 *  - When the evidence is too thin to stand behind, the signal reports
 *    `needs_review` or `unavailable` instead of guessing.
 *  - Credentials, tokens and secrets are monitored but never returned. Values
 *    are redacted on the way out of the service and on the way into any log.
 *  - This department never deletes an account, removes a permission, rotates a
 *    credential or shuts down an integration. It can only record a decision.
 *    Emergency safety controls that already exist elsewhere remain unchanged.
 */

export const SECURITY_MONITORING_KEY = 'security-monitoring' as const;
export const SECURITY_MONITORING_ROUTE = '/security-monitoring' as const;

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                  */
/* -------------------------------------------------------------------------- */

/** What a signal is about. Each maps to evidence the platform already stores. */
export type SecmonCategory =
  | 'failed_authentication'
  | 'login_activity'
  | 'suspicious_session'
  | 'permission_change'
  | 'privileged_action'
  | 'data_access'
  | 'integration_security'
  | 'unusual_api_activity'
  | 'cross_tenant_attempt'
  | 'ai_guardrail'
  | 'policy_posture';

export const SECMON_CATEGORIES: readonly SecmonCategory[] = [
  'failed_authentication',
  'login_activity',
  'suspicious_session',
  'permission_change',
  'privileged_action',
  'data_access',
  'integration_security',
  'unusual_api_activity',
  'cross_tenant_attempt',
  'ai_guardrail',
  'policy_posture',
] as const;

export const SECMON_CATEGORY_LABELS: Record<SecmonCategory, string> = {
  failed_authentication: 'Failed sign-in attempts',
  login_activity: 'Sign-in activity',
  suspicious_session: 'Suspicious sessions',
  permission_change: 'Permission changes',
  privileged_action: 'Privileged actions',
  data_access: 'Data access',
  integration_security: 'Integration security',
  unusual_api_activity: 'Unusual API activity',
  cross_tenant_attempt: 'Cross-company access attempts',
  ai_guardrail: 'AI guardrail events',
  policy_posture: 'Security policy posture',
};

/**
 * Categories that expose privileged history. Only the Owner may read these,
 * regardless of what the permission list says.
 */
export const SECMON_OWNER_ONLY_CATEGORIES: readonly SecmonCategory[] = [
  'permission_change',
  'privileged_action',
  'cross_tenant_attempt',
  'integration_security',
] as const;

/**
 * The only categories a non-security staff member may ever see, and then only
 * for their own account.
 */
export const SECMON_OWN_ACCOUNT_CATEGORIES: readonly SecmonCategory[] = [
  'failed_authentication',
  'login_activity',
  'suspicious_session',
] as const;

export type SecmonSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const SECMON_SEVERITIES: readonly SecmonSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
] as const;

const SECMON_SEVERITY_RANK: Record<SecmonSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

/** Severity at or above which a signal must never be hidden by noise controls. */
export const SECMON_NEVER_SUPPRESS_AT_OR_ABOVE: SecmonSeverity = 'high';

export type SecmonConfidence = 'high' | 'medium' | 'low';

/** Whether a signal can be stated at all. */
export type SecmonAvailability = 'available' | 'needs_review' | 'unavailable';

/** Facts come from rows. Recommendations come from AURA and are never facts. */
export type SecmonStatementKind = 'fact' | 'aura_recommendation';

/** Triage state a reviewer records against a signal. */
export type SecmonTriageState =
  | 'new'
  | 'acknowledged'
  | 'investigating'
  | 'resolved'
  | 'false_positive';

export const SECMON_TRIAGE_STATES: readonly SecmonTriageState[] = [
  'new',
  'acknowledged',
  'investigating',
  'resolved',
  'false_positive',
] as const;

/** Lifecycle of a named incident record. */
export type SecmonIncidentStatus = 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';

export const SECMON_INCIDENT_STATUSES: readonly SecmonIncidentStatus[] = [
  'open',
  'investigating',
  'contained',
  'resolved',
  'closed',
] as const;

/**
 * The high-risk operations this department may only ever recommend.
 * Approving one records a decision. It does not perform the operation.
 */
export type SecmonRecommendedAction =
  | 'review_account'
  | 'review_permission_grant'
  | 'review_session'
  | 'review_integration'
  | 'review_api_client'
  | 'tighten_policy'
  | 'contact_user';

export const SECMON_RECOMMENDED_ACTIONS: readonly SecmonRecommendedAction[] = [
  'review_account',
  'review_permission_grant',
  'review_session',
  'review_integration',
  'review_api_client',
  'tighten_policy',
  'contact_user',
] as const;

export type SecmonActionDecision = 'pending' | 'approved' | 'rejected';

/**
 * Operations this department must never carry out on its own. Kept as data so
 * the guard can be asserted in tests rather than only described in prose.
 */
export const SECMON_FORBIDDEN_AUTOMATIC_OPERATIONS: readonly string[] = [
  'delete_account',
  'remove_permission',
  'rotate_credential',
  'shut_down_integration',
  'revoke_session',
  'block_ip',
] as const;

export const SECMON_RECOMMENDATION_BOUNDARY =
  'Recommendation only. Owner approval records a decision and never deletes an account, removes a permission, rotates a credential, revokes a session or shuts down an integration.';

export const SECMON_ATTRIBUTION_BOUNDARY =
  'Observed activity only. The person or system behind this activity has not been identified and is not asserted.';

export function isSecmonForbiddenAutomaticOperation(operation: string): boolean {
  return SECMON_FORBIDDEN_AUTOMATIC_OPERATIONS.includes(operation);
}

/* -------------------------------------------------------------------------- */
/* Redaction                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Metadata keys whose values must never leave the service. Matched on a
 * lowercased, punctuation-stripped form of the key so `apiKey`, `api_key` and
 * `API-KEY` are all caught.
 */
const SECMON_SECRET_KEY_PATTERNS: readonly string[] = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'accesskey',
  'privatekey',
  'publickey',
  'clientsecret',
  'refreshtoken',
  'accesstoken',
  'idtoken',
  'bearer',
  'authorization',
  'auth',
  'cookie',
  'session',
  'credential',
  'hash',
  'signature',
  'salt',
  'otp',
  'pin',
  'mfacode',
  'recoverycode',
  'webhooksecret',
  'connectionstring',
  'dsn',
] as const;

export const SECMON_REDACTED = '[redacted]' as const;

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** True when a metadata key is known to carry a credential or secret. */
export function isSecmonSecretKey(key: string): boolean {
  const normalised = normaliseKey(key);
  if (!normalised) return false;
  return SECMON_SECRET_KEY_PATTERNS.some((pattern) => normalised.includes(pattern));
}

/**
 * Reduce an IP address to a coarse network hint. Full addresses are session
 * metadata and are only ever shown to the Owner.
 */
export function redactSecmonIp(ip: string | null | undefined): string | null {
  if (typeof ip !== 'string') return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;
  if (trimmed.includes(':')) {
    const groups = trimmed.split(':').filter((group) => group.length > 0);
    if (groups.length === 0) return null;
    return `${groups[0]}:${groups[1] ?? ''}:x:x`.replace('::', ':');
  }
  const octets = trimmed.split('.');
  if (octets.length !== 4) return SECMON_REDACTED;
  return `${octets[0]}.${octets[1]}.x.x`;
}

/**
 * Reduce a user agent to a device family. Full agent strings fingerprint a
 * device and are treated as session metadata.
 */
export function redactSecmonUserAgent(userAgent: string | null | undefined): string | null {
  if (typeof userAgent !== 'string') return null;
  const value = userAgent.trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  const platform = lower.includes('iphone')
    ? 'iPhone'
    : lower.includes('ipad')
      ? 'iPad'
      : lower.includes('android')
        ? 'Android'
        : lower.includes('windows')
          ? 'Windows'
          : lower.includes('mac os') || lower.includes('macintosh')
            ? 'macOS'
            : lower.includes('linux')
              ? 'Linux'
              : 'Unknown device';
  const browser = lower.includes('edg/')
    ? 'Edge'
    : lower.includes('chrome/')
      ? 'Chrome'
      : lower.includes('firefox/')
        ? 'Firefox'
        : lower.includes('safari/')
          ? 'Safari'
          : 'Unknown browser';
  return `${platform} / ${browser}`;
}

/** Show only the tail of an identifier so records can be matched but not reused. */
export function maskSecmonIdentifier(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 4) return SECMON_REDACTED;
  return `…${trimmed.slice(-4)}`;
}

/** Partially mask an email so an Owner can recognise an account without leaking it. */
export function maskSecmonEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.includes('@')) return null;
  const [local, domain] = trimmed.split('@');
  if (!local || !domain) return null;
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

const SECMON_MAX_SCRUB_DEPTH = 6;

/**
 * Walk arbitrary metadata and replace anything that looks like a credential.
 * Unknown shapes are kept, because dropping evidence silently would hide a real
 * event, but any value under a secret-bearing key is replaced.
 */
export function scrubSecmonMetadata(value: unknown, depth = 0): unknown {
  if (depth > SECMON_MAX_SCRUB_DEPTH) return SECMON_REDACTED;
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => scrubSecmonMetadata(entry, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (isSecmonSecretKey(key)) {
        out[key] = SECMON_REDACTED;
        continue;
      }
      const normalised = normaliseKey(key);
      if (normalised === 'ip' || normalised === 'ipaddress' || normalised === 'clientip') {
        out[key] = redactSecmonIp(typeof entry === 'string' ? entry : null);
        continue;
      }
      if (normalised === 'useragent') {
        out[key] = redactSecmonUserAgent(typeof entry === 'string' ? entry : null);
        continue;
      }
      if (normalised === 'email' || normalised === 'emailaddress') {
        out[key] = maskSecmonEmail(typeof entry === 'string' ? entry : null);
        continue;
      }
      out[key] = scrubSecmonMetadata(entry, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') {
    return redactSecmonSecretsInText(value);
  }
  return value;
}

const SECMON_INLINE_SECRET_PATTERNS: readonly RegExp[] = [
  /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\beyJ[A-Za-z0-9._-]{10,}/g,
  /\b(?:sk|pk|rk|whsec|ghp|xox[abps])[-_][A-Za-z0-9]{8,}/gi,
  /\b[A-Fa-f0-9]{40,}\b/g,
];

/**
 * Strip credential-shaped substrings out of free text. Descriptions and error
 * strings routinely quote a header or a key, so text is filtered as well as
 * structured values.
 */
export function redactSecmonSecretsInText(text: string): string {
  let out = text;
  for (const pattern of SECMON_INLINE_SECRET_PATTERNS) {
    out = out.replace(pattern, SECMON_REDACTED);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Access                                                                      */
/* -------------------------------------------------------------------------- */

export type SecmonAudienceScope = 'owner_full' | 'security_admin' | 'own_account_only' | 'denied';

export interface SecmonIdentity {
  roleName?: string | null;
  permissions?: string[] | null;
  userId?: string | null;
}

const OWNER_ROLE_NAMES = new Set(['owner', 'platform_owner', 'super_admin']);
const SECURITY_ROLE_NAMES = new Set(['security', 'security_admin', 'compliance', 'admin']);

/**
 * Roles that are refused before permissions are consulted. A wildcard grant
 * must not turn a technician or a client into a security reader.
 */
const HARD_DENIED_ROLE_FRAGMENTS = ['technician', 'tech', 'client', 'customer', 'portal', 'driver'];

function normaliseRole(roleName: string | null | undefined): string {
  return (roleName ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** True for roles that must never reach security monitoring under any grant. */
export function isSecmonHardDeniedRole(roleName: string | null | undefined): boolean {
  const role = normaliseRole(roleName);
  if (!role) return true;
  if (OWNER_ROLE_NAMES.has(role) || SECURITY_ROLE_NAMES.has(role)) return false;
  return HARD_DENIED_ROLE_FRAGMENTS.some((fragment) => role.includes(fragment));
}

export function resolveSecmonAudienceScope(identity: SecmonIdentity): SecmonAudienceScope {
  const role = normaliseRole(identity.roleName);
  const permissions = identity.permissions ?? [];

  // Role denial is evaluated first so a wildcard cannot bypass it.
  if (isSecmonHardDeniedRole(role)) return 'denied';
  if (OWNER_ROLE_NAMES.has(role)) return 'owner_full';

  const hasSecurityRead =
    permissions.includes('security:read') ||
    permissions.includes('security:*') ||
    permissions.includes('*');

  if (SECURITY_ROLE_NAMES.has(role) && hasSecurityRead) return 'security_admin';

  // Everyone else who is a real staff member may only learn about themselves.
  return identity.userId ? 'own_account_only' : 'denied';
}

export function canReadSecmonMonitoring(identity: SecmonIdentity): boolean {
  return resolveSecmonAudienceScope(identity) !== 'denied';
}

/** Only the Owner may change settings, approve actions or close incidents. */
export function canManageSecmonMonitoring(identity: SecmonIdentity): boolean {
  return resolveSecmonAudienceScope(identity) === 'owner_full';
}

/** Owner and security admins may triage. Own-account users may not. */
export function canTriageSecmonSignals(identity: SecmonIdentity): boolean {
  const scope = resolveSecmonAudienceScope(identity);
  return scope === 'owner_full' || scope === 'security_admin';
}

export function canViewSecmonCategory(scope: SecmonAudienceScope, category: SecmonCategory): boolean {
  if (scope === 'denied') return false;
  if (scope === 'owner_full') return true;
  if (scope === 'security_admin') return !SECMON_OWNER_ONLY_CATEGORIES.includes(category);
  return SECMON_OWN_ACCOUNT_CATEGORIES.includes(category);
}

/** Full IP addresses and raw session metadata are Owner-only. */
export function canViewSecmonSensitiveDetail(scope: SecmonAudienceScope): boolean {
  return scope === 'owner_full';
}

export interface SecmonWithheldNotice {
  category: SecmonCategory;
  label: string;
  reason: string;
}

export function buildSecmonWithheldNotice(
  category: SecmonCategory,
  scope: SecmonAudienceScope,
): SecmonWithheldNotice {
  const reason =
    scope === 'security_admin'
      ? 'Owner access is required for privileged history.'
      : scope === 'own_account_only'
        ? 'You can only see security activity that concerns your own account.'
        : 'You do not have access to security monitoring.';
  return { category, label: SECMON_CATEGORY_LABELS[category], reason };
}

/* -------------------------------------------------------------------------- */
/* Evidence, severity and confidence                                           */
/* -------------------------------------------------------------------------- */

/** Where a signal's evidence came from. Always a table already in the platform. */
export type SecmonEvidenceSource =
  | 'security_login_events'
  | 'security_audit_logs'
  | 'security_permission_grants'
  | 'security_risk_alerts'
  | 'security_ai_events'
  | 'security_comm_access_logs'
  | 'security_api_rate_counters'
  | 'security_tenant_policies'
  | 'sessions'
  | 'integration_connections';

export interface SecmonEvidence {
  source: SecmonEvidenceSource;
  /** How many rows support the statement. Never a projection. */
  observationCount: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  /** Short, already-redacted description of what was observed. */
  summary: string;
}

export interface SecmonSignal {
  key: string;
  category: SecmonCategory;
  statementKind: SecmonStatementKind;
  availability: SecmonAvailability;
  severity: SecmonSeverity;
  confidence: SecmonConfidence;
  title: string;
  detail: string;
  /** Number of underlying rows after grouping. */
  occurrenceCount: number;
  /** How many distinct raw signals were folded into this one. */
  groupedCount: number;
  subjectUserId: string | null;
  subjectLabel: string | null;
  evidence: SecmonEvidence[];
  triage: SecmonTriageState;
  /** Attribution is never asserted. Present on every signal as a reminder. */
  attributionNote: string;
  sensitiveDetailWithheld: boolean;
  observedAt: string | null;
}

export interface SecmonRecommendation {
  key: string;
  statementKind: 'aura_recommendation';
  category: SecmonCategory;
  action: SecmonRecommendedAction;
  severity: SecmonSeverity;
  confidence: SecmonConfidence;
  title: string;
  rationale: string;
  /** A recommendation without evidence is not shown. */
  evidence: SecmonEvidence[];
  boundary: string;
  requiresOwnerApproval: true;
  decision: SecmonActionDecision;
}

export function secmonSeverityRank(severity: SecmonSeverity): number {
  return SECMON_SEVERITY_RANK[severity] ?? 0;
}

export function isSecmonSeverityAtLeast(severity: SecmonSeverity, floor: SecmonSeverity): boolean {
  return secmonSeverityRank(severity) >= secmonSeverityRank(floor);
}

/** Serious signals are never hidden by a severity floor or by dedup settings. */
export function mustAlwaysSurfaceSecmonSignal(signal: Pick<SecmonSignal, 'severity'>): boolean {
  return isSecmonSeverityAtLeast(signal.severity, SECMON_NEVER_SUPPRESS_AT_OR_ABOVE);
}

/** Minimum rows before a repeated-event pattern may be called a pattern. */
export const SECMON_MIN_OBSERVATIONS_FOR_PATTERN = 3;

/** Minimum rows before a signal may claim high confidence. */
export const SECMON_MIN_OBSERVATIONS_FOR_HIGH_CONFIDENCE = 8;

/**
 * Confidence follows the weight of the evidence and how many independent
 * sources agree. It never rises on the strength of a single stale row.
 */
export function secmonConfidenceFor(input: {
  observationCount: number;
  distinctSources: number;
  ageHours: number | null;
}): SecmonConfidence {
  const { observationCount, distinctSources, ageHours } = input;
  if (observationCount <= 0) return 'low';
  const stale = ageHours !== null && ageHours > 24 * 30;
  if (stale) return 'low';
  if (
    observationCount >= SECMON_MIN_OBSERVATIONS_FOR_HIGH_CONFIDENCE &&
    distinctSources >= 2 &&
    ageHours !== null &&
    ageHours <= 24 * 7
  ) {
    return 'high';
  }
  if (observationCount >= SECMON_MIN_OBSERVATIONS_FOR_PATTERN) return 'medium';
  return 'low';
}

/**
 * Availability is deliberately conservative: with no rows there is nothing to
 * report, and below the pattern threshold the signal is offered for review
 * rather than stated as a finding.
 */
export function secmonAvailabilityFor(input: {
  observationCount: number;
  category: SecmonCategory;
}): SecmonAvailability {
  if (input.observationCount <= 0) return 'unavailable';
  // A single privileged or cross-tenant event is worth reviewing on its own.
  if (SECMON_OWNER_ONLY_CATEGORIES.includes(input.category)) return 'available';
  if (input.observationCount < SECMON_MIN_OBSERVATIONS_FOR_PATTERN) return 'needs_review';
  return 'available';
}

/** Severity floors per category, raised by volume. Never lowered by settings. */
export function secmonSeverityFor(input: {
  category: SecmonCategory;
  observationCount: number;
  distinctSubjects?: number;
}): SecmonSeverity {
  const { category, observationCount } = input;
  const distinctSubjects = input.distinctSubjects ?? 1;
  if (observationCount <= 0) return 'info';

  switch (category) {
    case 'cross_tenant_attempt':
      return 'critical';
    case 'privileged_action':
      return observationCount >= SECMON_MIN_OBSERVATIONS_FOR_PATTERN ? 'high' : 'medium';
    case 'permission_change':
      return observationCount >= SECMON_MIN_OBSERVATIONS_FOR_PATTERN ? 'high' : 'medium';
    case 'failed_authentication':
      if (observationCount >= 20 || distinctSubjects >= 3) return 'high';
      return observationCount >= SECMON_MIN_OBSERVATIONS_FOR_PATTERN ? 'medium' : 'low';
    case 'suspicious_session':
      return observationCount >= SECMON_MIN_OBSERVATIONS_FOR_PATTERN ? 'high' : 'medium';
    case 'integration_security':
      return observationCount >= SECMON_MIN_OBSERVATIONS_FOR_PATTERN ? 'high' : 'medium';
    case 'ai_guardrail':
      return observationCount >= SECMON_MIN_OBSERVATIONS_FOR_PATTERN ? 'medium' : 'low';
    case 'unusual_api_activity':
      return observationCount >= SECMON_MIN_OBSERVATIONS_FOR_PATTERN ? 'medium' : 'low';
    case 'data_access':
      return observationCount >= SECMON_MIN_OBSERVATIONS_FOR_PATTERN ? 'medium' : 'low';
    case 'login_activity':
      return 'info';
    case 'policy_posture':
      return 'medium';
    default:
      return 'info';
  }
}

/**
 * A signal that cannot be stated. Used instead of guessing, so the absence of
 * evidence is visible rather than looking like an all-clear.
 */
export function buildSecmonUnavailableSignal(input: {
  category: SecmonCategory;
  reason?: string;
  availability?: Extract<SecmonAvailability, 'unavailable' | 'needs_review'>;
}): SecmonSignal {
  const availability = input.availability ?? 'unavailable';
  return {
    key: `${input.category}:${availability}`,
    category: input.category,
    statementKind: 'fact',
    availability,
    severity: 'info',
    confidence: 'low',
    title: SECMON_CATEGORY_LABELS[input.category],
    detail:
      input.reason ??
      (availability === 'unavailable'
        ? 'No security evidence has been recorded for this area in the selected window.'
        : 'There is not enough evidence yet to state a finding. Review the underlying records.'),
    occurrenceCount: 0,
    groupedCount: 0,
    subjectUserId: null,
    subjectLabel: null,
    evidence: [],
    triage: 'new',
    attributionNote: SECMON_ATTRIBUTION_BOUNDARY,
    sensitiveDetailWithheld: false,
    observedAt: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Grouping                                                                    */
/* -------------------------------------------------------------------------- */

export interface SecmonRawSignal {
  category: SecmonCategory;
  /** Stable identity for the thing being reported on. */
  groupKey: string;
  subjectUserId: string | null;
  subjectLabel: string | null;
  occurredAt: string | null;
  source: SecmonEvidenceSource;
  summary: string;
}

export interface SecmonGroupedSignal {
  category: SecmonCategory;
  groupKey: string;
  subjectUserId: string | null;
  subjectLabel: string | null;
  occurrenceCount: number;
  distinctSubjects: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  sources: SecmonEvidenceSource[];
  summaries: string[];
}

function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function latest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Fold repeated raw events into one signal per group so an Owner sees "14
 * failed sign-ins for one account" rather than fourteen separate rows. Nothing
 * is discarded: the count and the window are preserved.
 */
export function groupSecmonSignals(raw: readonly SecmonRawSignal[]): SecmonGroupedSignal[] {
  const byKey = new Map<string, SecmonGroupedSignal>();
  const subjectsByKey = new Map<string, Set<string>>();

  for (const item of raw) {
    const key = `${item.category}::${item.groupKey}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        category: item.category,
        groupKey: item.groupKey,
        subjectUserId: item.subjectUserId,
        subjectLabel: item.subjectLabel,
        occurrenceCount: 1,
        distinctSubjects: 0,
        firstObservedAt: item.occurredAt,
        lastObservedAt: item.occurredAt,
        sources: [item.source],
        summaries: [item.summary],
      });
    } else {
      existing.occurrenceCount += 1;
      existing.firstObservedAt = earliest(existing.firstObservedAt, item.occurredAt);
      existing.lastObservedAt = latest(existing.lastObservedAt, item.occurredAt);
      if (!existing.sources.includes(item.source)) existing.sources.push(item.source);
      if (existing.summaries.length < 5 && !existing.summaries.includes(item.summary)) {
        existing.summaries.push(item.summary);
      }
      // A group covering more than one account should not claim a single one.
      if (existing.subjectUserId && existing.subjectUserId !== item.subjectUserId) {
        existing.subjectUserId = null;
        existing.subjectLabel = null;
      }
    }
    const subjects = subjectsByKey.get(key) ?? new Set<string>();
    if (item.subjectUserId) subjects.add(item.subjectUserId);
    subjectsByKey.set(key, subjects);
  }

  for (const [key, group] of byKey) {
    group.distinctSubjects = subjectsByKey.get(key)?.size ?? 0;
  }

  return [...byKey.values()].sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}

/** Sort for display: severity first, then confidence, then weight of evidence. */
export function sortSecmonSignals(signals: readonly SecmonSignal[]): SecmonSignal[] {
  const confidenceRank: Record<SecmonConfidence, number> = { high: 3, medium: 2, low: 1 };
  return [...signals].sort((a, b) => {
    const severity = secmonSeverityRank(b.severity) - secmonSeverityRank(a.severity);
    if (severity !== 0) return severity;
    const confidence = confidenceRank[b.confidence] - confidenceRank[a.confidence];
    if (confidence !== 0) return confidence;
    return b.occurrenceCount - a.occurrenceCount;
  });
}

/**
 * Apply the Owner's noise controls. A severity floor may hide routine chatter
 * but never a high or critical signal, and an unavailable signal is kept so the
 * gap in coverage stays visible.
 */
export function applySecmonSeverityFloor(
  signals: readonly SecmonSignal[],
  floor: SecmonSeverity,
): { visible: SecmonSignal[]; suppressed: SecmonSignal[] } {
  const visible: SecmonSignal[] = [];
  const suppressed: SecmonSignal[] = [];
  for (const signal of signals) {
    if (
      mustAlwaysSurfaceSecmonSignal(signal) ||
      signal.availability !== 'available' ||
      isSecmonSeverityAtLeast(signal.severity, floor)
    ) {
      visible.push(signal);
    } else {
      suppressed.push(signal);
    }
  }
  return { visible, suppressed };
}

/**
 * Restrict a signal set to what the caller may see. Own-account users get only
 * the narrow alerts that concern them.
 */
export function filterSecmonSignalsForScope(
  signals: readonly SecmonSignal[],
  scope: SecmonAudienceScope,
  viewerUserId: string | null,
): { visible: SecmonSignal[]; withheld: SecmonWithheldNotice[] } {
  if (scope === 'denied') {
    return { visible: [], withheld: [] };
  }
  const visible: SecmonSignal[] = [];
  const withheldCategories = new Set<SecmonCategory>();

  for (const signal of signals) {
    if (!canViewSecmonCategory(scope, signal.category)) {
      withheldCategories.add(signal.category);
      continue;
    }
    if (scope === 'own_account_only') {
      if (!viewerUserId || signal.subjectUserId !== viewerUserId) {
        withheldCategories.add(signal.category);
        continue;
      }
    }
    visible.push(signal);
  }

  return {
    visible,
    withheld: [...withheldCategories].map((category) => buildSecmonWithheldNotice(category, scope)),
  };
}

/** Strip Owner-only detail from a signal before it reaches a lesser scope. */
export function redactSecmonSignalForScope(signal: SecmonSignal, scope: SecmonAudienceScope): SecmonSignal {
  if (canViewSecmonSensitiveDetail(scope)) return signal;
  return {
    ...signal,
    detail: redactSecmonSecretsInText(signal.detail),
    subjectLabel: scope === 'own_account_only' ? signal.subjectLabel : null,
    evidence: signal.evidence.map((item) => ({
      ...item,
      summary: redactSecmonSecretsInText(item.summary),
    })),
    sensitiveDetailWithheld: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

export interface SecmonSettings {
  lookbackDays: number;
  failedLoginThreshold: number;
  severityFloor: SecmonSeverity;
  groupDuplicates: boolean;
  /** Fixed false. This department never remediates on its own. */
  autoRemediationEnabled: false;
  /** Fixed false. Credentials are never returned, whatever the setting. */
  exposeSecretsEnabled: false;
}

export const SECMON_DEFAULT_SETTINGS: SecmonSettings = {
  lookbackDays: 30,
  failedLoginThreshold: 5,
  severityFloor: 'low',
  groupDuplicates: true,
  autoRemediationEnabled: false,
  exposeSecretsEnabled: false,
};

export const SECMON_MIN_LOOKBACK_DAYS = 1;
export const SECMON_MAX_LOOKBACK_DAYS = 180;
export const SECMON_MIN_FAILED_LOGIN_THRESHOLD = 3;
export const SECMON_MAX_FAILED_LOGIN_THRESHOLD = 100;

export function normaliseSecmonSettings(input: Partial<SecmonSettings> | null | undefined): SecmonSettings {
  const source = input ?? {};
  const lookbackDays = clamp(
    Math.round(Number(source.lookbackDays ?? SECMON_DEFAULT_SETTINGS.lookbackDays)),
    SECMON_MIN_LOOKBACK_DAYS,
    SECMON_MAX_LOOKBACK_DAYS,
  );
  const failedLoginThreshold = clamp(
    Math.round(Number(source.failedLoginThreshold ?? SECMON_DEFAULT_SETTINGS.failedLoginThreshold)),
    SECMON_MIN_FAILED_LOGIN_THRESHOLD,
    SECMON_MAX_FAILED_LOGIN_THRESHOLD,
  );
  const severityFloor = SECMON_SEVERITIES.includes(source.severityFloor as SecmonSeverity)
    ? (source.severityFloor as SecmonSeverity)
    : SECMON_DEFAULT_SETTINGS.severityFloor;

  return {
    lookbackDays: Number.isFinite(lookbackDays) ? lookbackDays : SECMON_DEFAULT_SETTINGS.lookbackDays,
    failedLoginThreshold: Number.isFinite(failedLoginThreshold)
      ? failedLoginThreshold
      : SECMON_DEFAULT_SETTINGS.failedLoginThreshold,
    severityFloor,
    groupDuplicates: source.groupDuplicates ?? SECMON_DEFAULT_SETTINGS.groupDuplicates,
    // Both invariants are re-asserted rather than read, so a stored row that
    // was tampered with cannot switch them on.
    autoRemediationEnabled: false,
    exposeSecretsEnabled: false,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/* -------------------------------------------------------------------------- */
/* Incidents                                                                   */
/* -------------------------------------------------------------------------- */

export interface SecmonIncident {
  id: string;
  reference: string;
  title: string;
  status: SecmonIncidentStatus;
  severity: SecmonSeverity;
  category: SecmonCategory;
  summary: string;
  linkedSignalKeys: string[];
  openedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

/** Incident history is append-only; a status may advance but never be erased. */
export const SECMON_INCIDENT_TERMINAL_STATUSES: readonly SecmonIncidentStatus[] = [
  'resolved',
  'closed',
] as const;

export function isSecmonIncidentOpen(status: SecmonIncidentStatus): boolean {
  return !SECMON_INCIDENT_TERMINAL_STATUSES.includes(status);
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                   */
/* -------------------------------------------------------------------------- */

export interface SecmonCoverage {
  category: SecmonCategory;
  label: string;
  availability: SecmonAvailability;
  observationCount: number;
}

export interface SecmonPosture {
  criticalCount: number;
  highCount: number;
  openIncidentCount: number;
  unavailableCategories: number;
  /** Never a score out of nothing: null when there is no evidence at all. */
  monitoredCategories: number;
}

export function summariseSecmonPosture(input: {
  signals: readonly SecmonSignal[];
  openIncidents: number;
  coverage: readonly SecmonCoverage[];
}): SecmonPosture {
  const available = input.signals.filter((signal) => signal.availability === 'available');
  return {
    criticalCount: available.filter((signal) => signal.severity === 'critical').length,
    highCount: available.filter((signal) => signal.severity === 'high').length,
    openIncidentCount: input.openIncidents,
    unavailableCategories: input.coverage.filter((item) => item.availability === 'unavailable')
      .length,
    monitoredCategories: input.coverage.filter((item) => item.availability !== 'unavailable')
      .length,
  };
}

export interface UpdateSecmonSettingsRequest {
  lookbackDays?: number;
  failedLoginThreshold?: number;
  severityFloor?: SecmonSeverity;
  groupDuplicates?: boolean;
}

export interface TriageSecmonSignalRequest {
  triage: SecmonTriageState;
  note?: string | null;
}

export interface OpenSecmonIncidentRequest {
  title: string;
  category: SecmonCategory;
  severity: SecmonSeverity;
  summary: string;
  linkedSignalKeys?: string[];
}

export interface UpdateSecmonIncidentRequest {
  status: SecmonIncidentStatus;
  summary?: string;
}

export interface DecideSecmonRecommendationRequest {
  decision: 'approved' | 'rejected';
  note?: string | null;
}

export interface SecmonAuditEntry {
  id: string;
  eventKind: string;
  category: SecmonCategory | null;
  subjectKey: string | null;
  detail: Record<string, unknown>;
  occurredAt: string;
}

export interface SecmonDashboard {
  scope: SecmonAudienceScope;
  settings: SecmonSettings;
  posture: SecmonPosture;
  signals: SecmonSignal[];
  suppressed: SecmonSignal[];
  withheld: SecmonWithheldNotice[];
  coverage: SecmonCoverage[];
  recommendations: SecmonRecommendation[];
  incidents: SecmonIncident[];
  generatedAt: string;
}
