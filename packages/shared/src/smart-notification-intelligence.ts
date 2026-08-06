/**
 * Smart Notification Intelligence (Department 16)
 *
 * A prioritisation and noise-reduction layer over the notification surfaces
 * that already exist. It does not deliver, template or route anything:
 * - Per-user notification rows stay owned by the Notifications surface
 * - Rules, templates, channels, delivery and escalation policy stay owned by
 *   the Enterprise Notification Centre
 *
 * This layer reads those real rows, groups duplicates, scores urgency and
 * severity, applies Owner controls, and records acknowledge / snooze /
 * dismiss / escalate decisions with a full audit trail.
 *
 * Invariants:
 * - Every read and write is scoped by companyId
 * - Sensitive finance, payroll, security and strategy categories are Owner only
 * - Technicians see their own work only; clients see their own records only
 * - No signal is invented — every group cites the real rows it came from
 * - A category without real evidence reports unavailable or needs review
 * - AURA recommends only; actions are drafts requiring Owner approval
 */

export const SMART_NOTIFICATION_INTELLIGENCE_KEY = 'smart-notifications' as const;

// ─── Vocabulary ───────────────────────────────────────────────────────────────

export type SnCategory =
  | 'priority'
  | 'risk'
  | 'approval'
  | 'opportunity'
  | 'finance'
  | 'cash_flow'
  | 'overdue_invoice'
  | 'job_delay'
  | 'technician_performance'
  | 'fleet_vehicle'
  | 'stock_procurement'
  | 'customer_followup'
  | 'marketing_opportunity'
  | 'compliance_document'
  | 'security'
  | 'operations';

export type SnSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type SnUrgency = 'immediate' | 'today' | 'this_week' | 'when_convenient';

export type SnSignalStatus = 'open' | 'acknowledged' | 'snoozed' | 'dismissed' | 'escalated';

export type SnActionStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'acknowledged';

/** Availability of real evidence. Never a guess. */
export type SnAvailability = 'available' | 'partial' | 'unavailable' | 'needs_review';

/** Where a signal came from. Both are existing surfaces, not new pipelines. */
export type SnSourceKind = 'notification' | 'notification_centre_alert';

/** How much of the company the viewer is allowed to see. */
export type SnAudienceScope = 'company_wide' | 'own_work_only' | 'own_records_only';

export const SN_CATEGORIES: readonly SnCategory[] = [
  'priority',
  'risk',
  'approval',
  'opportunity',
  'finance',
  'cash_flow',
  'overdue_invoice',
  'job_delay',
  'technician_performance',
  'fleet_vehicle',
  'stock_procurement',
  'customer_followup',
  'marketing_opportunity',
  'compliance_document',
  'security',
  'operations',
] as const;

export const SN_CATEGORY_LABELS: Record<SnCategory, string> = {
  priority: 'Priority alerts',
  risk: 'Risk alerts',
  approval: 'Approvals awaiting a decision',
  opportunity: 'Business opportunities',
  finance: 'Finance',
  cash_flow: 'Cash flow',
  overdue_invoice: 'Overdue invoices',
  job_delay: 'Job delays and schedule changes',
  technician_performance: 'Technician performance',
  fleet_vehicle: 'Fleet and vehicles',
  stock_procurement: 'Stock and procurement',
  customer_followup: 'Customer follow-up',
  marketing_opportunity: 'Marketing opportunities',
  compliance_document: 'Compliance and document expiry',
  security: 'Security',
  operations: 'General operations',
};

export const SN_SEVERITIES: readonly SnSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
] as const;

/** Higher rank means more severe. Used for thresholds and ordering. */
export const SN_SEVERITY_RANK: Record<SnSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export function isSnCategory(value: string | null | undefined): value is SnCategory {
  return Boolean(value && (SN_CATEGORIES as readonly string[]).includes(value));
}

export function isSnSeverity(value: string | null | undefined): value is SnSeverity {
  return Boolean(value && (SN_SEVERITIES as readonly string[]).includes(value));
}

// ─── Access ───────────────────────────────────────────────────────────────────

const OWNER_ROLES = ['Company Owner', 'Owner', 'Platform Owner'] as const;

/**
 * Categories that expose finance, payroll, security or strategy detail.
 * These are Owner only regardless of permission breadth, so a wildcard
 * permission on an Admin or Office account does not reveal them.
 */
export const SN_OWNER_ONLY_CATEGORIES: readonly SnCategory[] = [
  'finance',
  'cash_flow',
  'overdue_invoice',
  'technician_performance',
  'security',
] as const;

/** Entity types a client may ever see a signal about — their own records only. */
export const SN_CLIENT_ENTITY_TYPES: readonly string[] = [
  'booking',
  'appointment',
  'quote',
  'invoice',
  'document',
  'job',
] as const;

export function isSnOwnerRole(identity: { roleName?: string | null }): boolean {
  return (OWNER_ROLES as readonly string[]).includes(identity.roleName ?? '');
}

/**
 * Everyone with a signed-in role may read a notification feed, but what the
 * feed contains is decided by scope and category, not by entry alone.
 */
export function canAccessSmartNotifications(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return Boolean(identity.roleName && identity.roleName.trim().length > 0);
}

/**
 * Company-wide visibility needs an owner role, or an explicit notification /
 * admin permission. Technicians are limited to their own assigned work and
 * clients to their own records, whatever permissions they carry.
 */
export function resolveSnAudienceScope(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): SnAudienceScope {
  const role = identity.roleName ?? '';
  if (role === 'Client') return 'own_records_only';
  if (role === 'Technician') return 'own_work_only';
  if (isSnOwnerRole(identity)) return 'company_wide';
  const permissions = identity.permissions ?? [];
  if (
    permissions.includes('*') ||
    permissions.includes('notifications:read') ||
    permissions.includes('notifications:write') ||
    permissions.includes('notifications:manage')
  ) {
    return 'company_wide';
  }
  return 'own_work_only';
}

/**
 * Category-level visibility. Sensitive finance, payroll, security and strategy
 * categories stay Owner only; everything else follows the audience scope.
 */
export function canViewSnCategory(
  identity: { roleName?: string | null; permissions?: string[] | null },
  category: SnCategory,
): boolean {
  if (!canAccessSmartNotifications(identity)) return false;
  if ((SN_OWNER_ONLY_CATEGORIES as readonly string[]).includes(category)) {
    return isSnOwnerRole(identity);
  }
  const scope = resolveSnAudienceScope(identity);
  if (scope === 'own_records_only') {
    // Clients only ever see signals about their own bookings, quotes,
    // invoices, documents and appointments.
    return (
      category === 'customer_followup' ||
      category === 'approval' ||
      category === 'compliance_document' ||
      category === 'operations'
    );
  }
  return true;
}

export function listVisibleSnCategories(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): SnCategory[] {
  return SN_CATEGORIES.filter((category) => canViewSnCategory(identity, category));
}

/** Acknowledge, snooze and dismiss are personal decisions any viewer may take. */
export function canActOnSnSignal(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessSmartNotifications(identity);
}

/** Escalation raises a signal to another person, so restricted roles cannot. */
export function canEscalateSnSignal(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  if (!canAccessSmartNotifications(identity)) return false;
  return resolveSnAudienceScope(identity) === 'company_wide';
}

/** Owner controls over categories and thresholds are Owner only. */
export function canManageSnSettings(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return isSnOwnerRole(identity);
}

/** A recommendation only becomes a decision when the Owner approves it. */
export function canApproveSnActionDrafts(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return isSnOwnerRole(identity);
}

// ─── Product boundaries ───────────────────────────────────────────────────────

export const SN_PRODUCT_COPY = {
  notificationsInbox:
    'The Notifications inbox (/notifications) still owns per-user notification rows and read state — this layer reads them rather than replacing them.',
  notificationCentre:
    'The Enterprise Notification Centre still owns rules, templates, channels, delivery and escalation policy — this layer reads its alerts rather than rebuilding delivery.',
  thisLayer:
    'Smart Notification Intelligence groups duplicate and related events into one signal, scores severity and urgency, applies Owner category controls and thresholds, and records acknowledge, snooze, dismiss and escalate decisions with a full audit trail. Real rows only. A category without evidence reports unavailable rather than inventing an alert.',
} as const;

export type SnConnection = {
  label: string;
  href: string;
  note: string;
};

export function listSnConnections(): SnConnection[] {
  return [
    {
      label: 'Notifications inbox',
      href: '/notifications',
      note: 'Real per-user notification rows behind this feed.',
    },
    {
      label: 'Notification settings',
      href: '/settings/notifications',
      note: 'Per-user channel and type preferences — not rebuilt here.',
    },
    {
      label: 'Security',
      href: '/security',
      note: 'Security alert detail and the full audit log.',
    },
    {
      label: 'Cashflow & Profit',
      href: '/finance-cashflow-profit',
      note: 'Source of record for the finance figures a finance signal refers to.',
    },
  ];
}

// ─── Classification (deterministic, from real row fields) ─────────────────────

/**
 * Maps a real notification type to a category. The mapping is a fixed table so
 * the same row always lands in the same category — nothing is inferred from
 * free text, which would risk inventing a category the row does not support.
 */
export function classifySnNotificationType(notificationType: string): SnCategory {
  switch (notificationType) {
    case 'security_alert':
      return 'security';
    case 'approval_request':
      return 'approval';
    case 'invoice_reminder':
      return 'overdue_invoice';
    case 'schedule_changed':
    case 'urgent_dispatch':
    case 'dispatch_alert':
      return 'job_delay';
    case 'inventory_request':
      return 'stock_procurement';
    case 'asset_alert':
    case 'maintenance_update':
    case 'fleet_alert':
      return 'fleet_vehicle';
    case 'quality_alert':
    case 'comeback_update':
    case 'warranty_update':
      return 'risk';
    case 'quote_update':
    case 'appointment_update':
    case 'support_update':
    case 'comm_intel_alert':
    case 'missed_call_alert':
    case 'personal_comm_alert':
      return 'customer_followup';
    case 'system_alert':
      return 'priority';
    default:
      return 'operations';
  }
}

/** Maps a Notification Centre module source to a category. */
export function classifySnModuleSource(moduleSource: string | null | undefined): SnCategory {
  switch (moduleSource) {
    case 'finance':
      return 'finance';
    case 'inventory':
    case 'procurement':
      return 'stock_procurement';
    case 'fleet':
      return 'fleet_vehicle';
    case 'documents':
    case 'document_ai':
      return 'compliance_document';
    case 'security':
      return 'security';
    case 'crm':
    case 'leads':
    case 'customers':
    case 'communications':
    case 'voice_reception':
      return 'customer_followup';
    case 'jobs':
    case 'scheduling':
    case 'dispatch':
    case 'quotes':
      return 'job_delay';
    default:
      return 'operations';
  }
}

export function snSeverityForNotificationType(notificationType: string): SnSeverity {
  switch (notificationType) {
    case 'security_alert':
    case 'urgent_dispatch':
      return 'critical';
    case 'approval_request':
    case 'invoice_reminder':
    case 'quality_alert':
    case 'dispatch_alert':
      return 'high';
    case 'schedule_changed':
    case 'system_alert':
    case 'comeback_update':
    case 'warranty_update':
    case 'asset_alert':
    case 'missed_call_alert':
    case 'inventory_request':
      return 'medium';
    case 'company_announcement':
      return 'info';
    default:
      return 'low';
  }
}

/** Maps the Notification Centre alert level onto this layer's severity scale. */
export function snSeverityForAlertLevel(alertLevel: string | null | undefined): SnSeverity {
  switch (alertLevel) {
    case 'emergency':
    case 'critical':
      return 'critical';
    case 'warning':
      return 'medium';
    case 'success':
      return 'low';
    default:
      return 'info';
  }
}

/**
 * Urgency from severity and how long the signal has been waiting. Age only
 * raises urgency for signals that are already severe — an old low-severity
 * note does not become urgent just by ageing.
 */
export function snUrgencyFor(severity: SnSeverity, ageHours: number): SnUrgency {
  const age = Number.isFinite(ageHours) && ageHours > 0 ? ageHours : 0;
  if (severity === 'critical') return 'immediate';
  if (severity === 'high') return age >= 24 ? 'immediate' : 'today';
  if (severity === 'medium') return age >= 72 ? 'today' : 'this_week';
  return 'when_convenient';
}

// ─── Grouping and noise reduction ─────────────────────────────────────────────

/**
 * Strips the parts of a title that differ between otherwise identical events —
 * ids, numbers, dates and punctuation — so five copies of the same event
 * collapse into one signal instead of flooding the Owner.
 */
export function normaliseSnTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '')
    .replace(/\d+/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A stable key for one real-world event. Rows about the same entity group
 * together; rows without an entity fall back to the normalised title so
 * repeated copies of the same message still collapse.
 */
export function snGroupKey(input: {
  category: SnCategory;
  entityType?: string | null;
  entityId?: string | null;
  title: string;
}): string {
  const entityType = (input.entityType ?? '').trim().toLowerCase();
  const entityId = (input.entityId ?? '').trim().toLowerCase();
  if (entityType && entityId) return `${input.category}:${entityType}:${entityId}`;
  const normalised = normaliseSnTitle(input.title);
  return `${input.category}:title:${normalised || 'untitled'}`;
}

export type SnSignalSource = {
  kind: SnSourceKind;
  sourceId: string;
  title: string;
  body: string;
  occurredAt: string;
  unread: boolean;
};

export type SnRawSignal = {
  kind: SnSourceKind;
  sourceId: string;
  category: SnCategory;
  severity: SnSeverity;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  occurredAt: string;
  unread: boolean;
  /** The user this row was addressed to, when the source row carries one. */
  recipientUserId: string | null;
};

export type SnSignalGroup = {
  groupKey: string;
  category: SnCategory;
  severity: SnSeverity;
  urgency: SnUrgency;
  priorityScore: number;
  title: string;
  detail: string;
  entityType: string | null;
  entityId: string | null;
  /** Total real rows behind this signal, including the one shown. */
  eventCount: number;
  /** Rows collapsed into the shown one. eventCount - 1. */
  duplicateCount: number;
  unreadCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  status: SnSignalStatus;
  snoozedUntil: string | null;
  /** Every real row behind the group, so nothing is asserted without evidence. */
  sources: SnSignalSource[];
  /** Invariant: this layer never resolves a signal on the user's behalf. */
  autoResolved: false;
};

/**
 * Score used to order the feed. Severity dominates, urgency refines it, and
 * repetition and unread state break ties — so a repeated critical event sits
 * above a single low note without any category ever being silently starved.
 */
export function snPriorityScore(input: {
  severity: SnSeverity;
  urgency: SnUrgency;
  duplicateCount: number;
  unreadCount: number;
}): number {
  const severityWeight = SN_SEVERITY_RANK[input.severity] * 100;
  const urgencyWeight =
    input.urgency === 'immediate'
      ? 40
      : input.urgency === 'today'
        ? 25
        : input.urgency === 'this_week'
          ? 10
          : 0;
  const repetition = Math.min(Math.max(input.duplicateCount, 0), 10) * 3;
  const unread = input.unreadCount > 0 ? 10 : 0;
  return severityWeight + urgencyWeight + repetition + unread;
}

function earlierIso(a: string, b: string): string {
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

/**
 * Collapses raw rows into one group per real-world event. Nothing is dropped
 * silently: every collapsed row stays attached to the group as evidence and is
 * counted in `duplicateCount`.
 */
export function groupSnSignals(
  raw: SnRawSignal[],
  options: { now: Date; maxSourcesPerGroup?: number },
): SnSignalGroup[] {
  const maxSources = options.maxSourcesPerGroup ?? 10;
  const byKey = new Map<string, SnSignalGroup>();

  for (const signal of raw) {
    const groupKey = snGroupKey({
      category: signal.category,
      entityType: signal.entityType,
      entityId: signal.entityId,
      title: signal.title,
    });
    const source: SnSignalSource = {
      kind: signal.kind,
      sourceId: signal.sourceId,
      title: signal.title,
      body: signal.body,
      occurredAt: signal.occurredAt,
      unread: signal.unread,
    };
    const existing = byKey.get(groupKey);
    if (!existing) {
      byKey.set(groupKey, {
        groupKey,
        category: signal.category,
        severity: signal.severity,
        urgency: 'when_convenient',
        priorityScore: 0,
        title: signal.title,
        detail: signal.body,
        entityType: signal.entityType,
        entityId: signal.entityId,
        eventCount: 1,
        duplicateCount: 0,
        unreadCount: signal.unread ? 1 : 0,
        firstSeenAt: signal.occurredAt,
        lastSeenAt: signal.occurredAt,
        status: 'open',
        snoozedUntil: null,
        sources: [source],
        autoResolved: false,
      });
      continue;
    }
    existing.eventCount += 1;
    existing.duplicateCount = existing.eventCount - 1;
    if (signal.unread) existing.unreadCount += 1;
    existing.firstSeenAt = earlierIso(existing.firstSeenAt, signal.occurredAt);
    if (Date.parse(signal.occurredAt) > Date.parse(existing.lastSeenAt)) {
      existing.lastSeenAt = signal.occurredAt;
      // The newest row wins the headline so the Owner reads the latest state.
      existing.title = signal.title;
      existing.detail = signal.body;
    }
    // The group carries the worst severity any of its rows reported.
    if (SN_SEVERITY_RANK[signal.severity] > SN_SEVERITY_RANK[existing.severity]) {
      existing.severity = signal.severity;
    }
    if (existing.sources.length < maxSources) existing.sources.push(source);
  }

  const nowMs = options.now.getTime();
  return [...byKey.values()].map((group) => {
    const ageHours = Math.max(0, (nowMs - Date.parse(group.lastSeenAt)) / 3_600_000);
    const urgency = snUrgencyFor(group.severity, ageHours);
    return {
      ...group,
      urgency,
      priorityScore: snPriorityScore({
        severity: group.severity,
        urgency,
        duplicateCount: group.duplicateCount,
        unreadCount: group.unreadCount,
      }),
    };
  });
}

export function sortSnGroups(groups: SnSignalGroup[]): SnSignalGroup[] {
  return [...groups].sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);
  });
}

// ─── Owner controls ───────────────────────────────────────────────────────────

export type SnCategoryControl = {
  category: SnCategory;
  label: string;
  enabled: boolean;
  /** Signals below this severity are held back from the feed. */
  minSeverity: SnSeverity;
  /** Hold non-urgent signals for the daily brief instead of the live feed. */
  digestOnly: boolean;
  /** Owner only, and therefore hidden from every other role. */
  ownerOnly: boolean;
};

export function defaultSnCategoryControl(category: SnCategory): SnCategoryControl {
  return {
    category,
    label: SN_CATEGORY_LABELS[category],
    enabled: true,
    // Everyday operational chatter starts at a higher bar so the feed opens
    // quiet rather than flooding the Owner on day one.
    minSeverity: category === 'operations' ? 'medium' : 'low',
    digestOnly: category === 'operations',
    ownerOnly: (SN_OWNER_ONLY_CATEGORIES as readonly string[]).includes(category),
  };
}

export function defaultSnCategoryControls(): SnCategoryControl[] {
  return SN_CATEGORIES.map(defaultSnCategoryControl);
}

export type SnSettings = {
  id: string;
  /** Invariant: always false — this layer never acts for the Owner. */
  autoActionsEnabled: false;
  /** Invariant: always false — a signal without evidence is never generated. */
  inventSignalsEnabled: false;
  groupDuplicatesEnabled: boolean;
  dailyBriefEnabled: boolean;
  /** Hard ceiling on live feed items so the Owner is never flooded. */
  maxFeedItems: number;
  /** Hard ceiling on daily brief lines. */
  maxBriefItems: number;
  /** Signals below this severity never reach the live feed for anyone. */
  globalMinSeverity: SnSeverity;
  notes: string | null;
  updatedAt: string;
};

export function defaultSnSettings(partial?: Partial<SnSettings>): SnSettings {
  return {
    id: partial?.id ?? 'pending',
    autoActionsEnabled: false,
    inventSignalsEnabled: false,
    groupDuplicatesEnabled: partial?.groupDuplicatesEnabled ?? true,
    dailyBriefEnabled: partial?.dailyBriefEnabled ?? true,
    maxFeedItems: partial?.maxFeedItems ?? 25,
    maxBriefItems: partial?.maxBriefItems ?? 10,
    globalMinSeverity: partial?.globalMinSeverity ?? 'low',
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}

export type SnSuppressionReason =
  | 'category_disabled'
  | 'below_category_threshold'
  | 'below_global_threshold'
  | 'digest_only'
  | 'snoozed'
  | 'dismissed'
  | 'feed_limit';

export type SnSuppressedGroup = {
  groupKey: string;
  category: SnCategory;
  severity: SnSeverity;
  title: string;
  reason: SnSuppressionReason;
  /** Plain-language reason, so nothing disappears without an explanation. */
  explanation: string;
};

export const SN_SUPPRESSION_EXPLANATIONS: Record<SnSuppressionReason, string> = {
  category_disabled: 'The Owner switched this category off in notification controls.',
  below_category_threshold: 'Severity is below the minimum the Owner set for this category.',
  below_global_threshold: 'Severity is below the global minimum the Owner set.',
  digest_only: 'The Owner set this category to daily brief only, so it is held out of the live feed.',
  snoozed: 'Snoozed until the time chosen by the person who snoozed it.',
  dismissed: 'Dismissed by a person. It stays in the audit history.',
  feed_limit: 'Held back to keep the live feed within the Owner-set item limit.',
};

export type SnFilterResult = {
  feed: SnSignalGroup[];
  digest: SnSignalGroup[];
  suppressed: SnSuppressedGroup[];
};

/**
 * Applies the Owner controls to a scored feed.
 *
 * Suppression is never silent: a held-back signal is returned in `suppressed`
 * with the reason, and a snoozed signal returns to the feed by itself once the
 * snooze expires. Dismissal hides a signal from the feed but never deletes it.
 */
export function applySnControls(
  groups: SnSignalGroup[],
  input: {
    settings: SnSettings;
    controls: SnCategoryControl[];
    now: Date;
  },
): SnFilterResult {
  const controlByCategory = new Map(input.controls.map((c) => [c.category, c]));
  const globalRank = SN_SEVERITY_RANK[input.settings.globalMinSeverity];
  const feed: SnSignalGroup[] = [];
  const digest: SnSignalGroup[] = [];
  const suppressed: SnSuppressedGroup[] = [];
  const nowMs = input.now.getTime();

  const hold = (group: SnSignalGroup, reason: SnSuppressionReason) => {
    suppressed.push({
      groupKey: group.groupKey,
      category: group.category,
      severity: group.severity,
      title: group.title,
      reason,
      explanation: SN_SUPPRESSION_EXPLANATIONS[reason],
    });
  };

  for (const group of sortSnGroups(groups)) {
    if (group.status === 'dismissed') {
      hold(group, 'dismissed');
      continue;
    }
    if (
      group.status === 'snoozed' &&
      group.snoozedUntil &&
      Date.parse(group.snoozedUntil) > nowMs
    ) {
      hold(group, 'snoozed');
      continue;
    }
    const control = controlByCategory.get(group.category) ?? defaultSnCategoryControl(group.category);
    if (!control.enabled) {
      hold(group, 'category_disabled');
      continue;
    }
    const severityRank = SN_SEVERITY_RANK[group.severity];
    if (severityRank < globalRank) {
      hold(group, 'below_global_threshold');
      continue;
    }
    if (severityRank < SN_SEVERITY_RANK[control.minSeverity]) {
      hold(group, 'below_category_threshold');
      continue;
    }
    // Escalated and critical signals always reach the live feed — a digest
    // preference must not be able to hide an emergency.
    const mustSurface = group.severity === 'critical' || group.status === 'escalated';
    if (control.digestOnly && !mustSurface) {
      digest.push(group);
      hold(group, 'digest_only');
      continue;
    }
    if (feed.length >= input.settings.maxFeedItems) {
      digest.push(group);
      hold(group, 'feed_limit');
      continue;
    }
    feed.push(group);
  }

  return { feed, digest, suppressed };
}

// ─── Evidence honesty ─────────────────────────────────────────────────────────

export type SnCategoryCoverage = {
  category: SnCategory;
  label: string;
  availability: SnAvailability;
  evidenceCount: number;
  rationale: string;
};

/**
 * Reports what each category is actually backed by. A category with no real
 * rows says so rather than showing a reassuring zero, and a category the Owner
 * switched off is reported as needing review rather than as clean.
 */
export function buildSnCategoryCoverage(input: {
  categories: SnCategory[];
  counts: Map<SnCategory, number>;
  controls: SnCategoryControl[];
}): SnCategoryCoverage[] {
  const controlByCategory = new Map(input.controls.map((c) => [c.category, c]));
  return input.categories.map((category) => {
    const evidenceCount = input.counts.get(category) ?? 0;
    const control = controlByCategory.get(category);
    if (control && !control.enabled) {
      return {
        category,
        label: SN_CATEGORY_LABELS[category],
        availability: 'needs_review',
        evidenceCount,
        rationale:
          'Switched off in Owner notification controls, so this category is not being watched. Nothing is inferred about it.',
      };
    }
    if (evidenceCount === 0) {
      return {
        category,
        label: SN_CATEGORY_LABELS[category],
        availability: 'unavailable',
        evidenceCount: 0,
        rationale:
          'No real notification or alert rows have been recorded for this category yet. No signal is invented to fill the gap.',
      };
    }
    return {
      category,
      label: SN_CATEGORY_LABELS[category],
      availability: 'available',
      evidenceCount,
      rationale: '',
    };
  });
}

// ─── Daily brief ──────────────────────────────────────────────────────────────

export type SnBriefLine = {
  category: SnCategory;
  label: string;
  severity: SnSeverity;
  urgency: SnUrgency;
  title: string;
  eventCount: number;
  groupKey: string;
};

export type SnDailyBrief = {
  enabled: boolean;
  availability: SnAvailability;
  summary: string;
  lines: SnBriefLine[];
  criticalCount: number;
  approvalCount: number;
  suppressedCount: number;
  /** Invariant: the brief summarises real rows and never recommends an action. */
  autoActioned: false;
  rationale: string;
};

/**
 * A short AURA summary of what actually happened. Counts come from real rows,
 * and when there is nothing to report the brief says so instead of filling
 * space with an invented headline.
 */
export function buildSnDailyBrief(input: {
  settings: SnSettings;
  feed: SnSignalGroup[];
  digest: SnSignalGroup[];
  suppressedCount: number;
  totalSourceRows: number;
}): SnDailyBrief {
  if (!input.settings.dailyBriefEnabled) {
    return {
      enabled: false,
      availability: 'needs_review',
      summary: 'The daily brief is switched off in Owner notification controls.',
      lines: [],
      criticalCount: 0,
      approvalCount: 0,
      suppressedCount: input.suppressedCount,
      autoActioned: false,
      rationale: 'Switched off by the Owner. No summary is generated.',
    };
  }

  if (input.totalSourceRows === 0) {
    return {
      enabled: true,
      availability: 'unavailable',
      summary:
        'No real notification or alert rows exist for this company yet, so there is nothing to brief on.',
      lines: [],
      criticalCount: 0,
      approvalCount: 0,
      suppressedCount: input.suppressedCount,
      autoActioned: false,
      rationale: 'No evidence. A brief is not invented when there is nothing to report.',
    };
  }

  const combined = sortSnGroups([...input.feed, ...input.digest]);
  const lines = combined.slice(0, Math.max(0, input.settings.maxBriefItems)).map((group) => ({
    category: group.category,
    label: SN_CATEGORY_LABELS[group.category],
    severity: group.severity,
    urgency: group.urgency,
    title: group.title,
    eventCount: group.eventCount,
    groupKey: group.groupKey,
  }));

  const criticalCount = combined.filter((group) => group.severity === 'critical').length;
  const approvalCount = combined.filter((group) => group.category === 'approval').length;
  const collapsed = combined.reduce((total, group) => total + group.duplicateCount, 0);

  const parts = [
    `${combined.length} signal(s) from ${input.totalSourceRows} real row(s)`,
    `${criticalCount} critical`,
    `${approvalCount} awaiting approval`,
  ];
  if (collapsed > 0) parts.push(`${collapsed} duplicate row(s) grouped`);
  if (input.suppressedCount > 0) {
    parts.push(`${input.suppressedCount} held back by Owner controls, each with a reason`);
  }

  return {
    enabled: true,
    availability: combined.length === 0 ? 'partial' : 'available',
    summary: `${parts.join(', ')}.`,
    lines,
    criticalCount,
    approvalCount,
    suppressedCount: input.suppressedCount,
    autoActioned: false,
    rationale:
      combined.length === 0
        ? 'Real rows exist but all of them sit below the thresholds the Owner set. Nothing is escalated on the Owner’s behalf.'
        : '',
  };
}

// ─── Approval-gated recommendations ───────────────────────────────────────────

export type SnActionDraftSummary = {
  id: string;
  groupKey: string | null;
  category: SnCategory | null;
  title: string;
  body: string;
  status: SnActionStatus;
  /** Invariant: always false — a recommendation never executes itself. */
  autoExecuted: false;
  createdAt: string;
  decidedAt: string | null;
};

/**
 * Turns a real signal into a recommendation the Owner can approve. The body
 * always states that approval records a decision and changes nothing
 * downstream — no payment, payroll run, publish or permission change.
 */
export function buildSnActionDraft(input: {
  categoryLabel: string;
  title: string;
  detail: string;
  eventCount: number;
}): { title: string; body: string } {
  return {
    title: `${input.categoryLabel} — ${input.title}`.slice(0, 200),
    body: [
      input.detail,
      '',
      `Based on ${input.eventCount} real notification row(s). No figure or event is invented.`,
      'Recommendation only. Owner approval records a decision and never releases a payment, runs payroll, publishes content or changes permissions.',
    ].join('\n'),
  };
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export type SnEventKind =
  | 'acknowledged'
  | 'snoozed'
  | 'dismissed'
  | 'escalated'
  | 'reopened'
  | 'settings_updated'
  | 'category_updated';

export type SnAuditEntry = {
  id: string;
  groupKey: string | null;
  kind: SnEventKind;
  actorUserId: string | null;
  notes: string | null;
  snoozedUntil: string | null;
  occurredAt: string;
};

export type SnSignalActionRequest = {
  groupKey: string;
  action: 'acknowledge' | 'snooze' | 'dismiss' | 'escalate' | 'reopen';
  /** Required for snooze. Bounded so a signal cannot be hidden indefinitely. */
  snoozeMinutes?: number;
  notes?: string;
};

/** Snooze is bounded — a signal can be deferred, never buried. */
export const SN_MIN_SNOOZE_MINUTES = 15;
export const SN_MAX_SNOOZE_MINUTES = 10_080; // 7 days

export function isValidSnSnoozeMinutes(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= SN_MIN_SNOOZE_MINUTES &&
    minutes <= SN_MAX_SNOOZE_MINUTES
  );
}

export function snStatusForAction(action: SnSignalActionRequest['action']): SnSignalStatus {
  switch (action) {
    case 'acknowledge':
      return 'acknowledged';
    case 'snooze':
      return 'snoozed';
    case 'dismiss':
      return 'dismissed';
    case 'escalate':
      return 'escalated';
    default:
      return 'open';
  }
}

export function snEventKindForAction(action: SnSignalActionRequest['action']): SnEventKind {
  switch (action) {
    case 'acknowledge':
      return 'acknowledged';
    case 'snooze':
      return 'snoozed';
    case 'dismiss':
      return 'dismissed';
    case 'escalate':
      return 'escalated';
    default:
      return 'reopened';
  }
}

// ─── Requests and dashboard ───────────────────────────────────────────────────

export type UpdateSnSettingsRequest = {
  groupDuplicatesEnabled?: boolean;
  dailyBriefEnabled?: boolean;
  maxFeedItems?: number;
  maxBriefItems?: number;
  globalMinSeverity?: SnSeverity;
  notes?: string | null;
};

export type UpdateSnCategoryControlRequest = {
  enabled?: boolean;
  minSeverity?: SnSeverity;
  digestOnly?: boolean;
};

export type CreateSnActionDraftRequest = {
  groupKey?: string | null;
  category?: SnCategory | null;
  title: string;
  body: string;
  submitForApproval?: boolean;
};

export type DecideSnActionRequest = {
  decision: 'approve' | 'reject' | 'acknowledge';
  notes?: string;
};

export type SnDashboard = {
  summary: string;
  productClarification: {
    notificationsInbox: string;
    notificationCentre: string;
    thisLayer: string;
  };
  policy: {
    autoActionsEnabled: false;
    inventSignalsEnabled: false;
    approvalRequired: true;
    fakeBusinessData: false;
    sensitiveCategoriesOwnerOnly: true;
  };
  scope: SnAudienceScope;
  scopeRationale: string;
  visibleCategories: SnCategory[];
  hiddenCategories: SnCategory[];
  feed: SnSignalGroup[];
  digest: SnSignalGroup[];
  suppressed: SnSuppressedGroup[];
  brief: SnDailyBrief;
  coverage: SnCategoryCoverage[];
  settings: SnSettings;
  controls: SnCategoryControl[];
  actionDrafts: SnActionDraftSummary[];
  pendingApprovals: number;
  connections: SnConnection[];
  totalSourceRows: number;
  groupedRowCount: number;
};

export const SN_SCOPE_RATIONALE: Record<SnAudienceScope, string> = {
  company_wide:
    'Company-wide notification signals, scoped to this company only. Sensitive finance, payroll, security and strategy categories remain Owner only.',
  own_work_only:
    'Your assigned work only. Notifications addressed to you and alerts assigned to you are shown; company finance, payroll, security and strategy signals are not.',
  own_records_only:
    'Your own bookings, quotes, invoices, documents and appointments only. No other customer or company signal is shown.',
};

export function buildSnSummary(input: {
  feedCount: number;
  suppressedCount: number;
  criticalCount: number;
  groupedRowCount: number;
  totalSourceRows: number;
}): string {
  if (input.totalSourceRows === 0) {
    return 'No real notification or alert rows exist for this company yet. Nothing is shown, and no signal is invented.';
  }
  const collapsed = input.totalSourceRows - input.groupedRowCount;
  const parts = [
    `${input.feedCount} signal(s) in the live feed`,
    `${input.criticalCount} critical`,
  ];
  if (collapsed > 0) parts.push(`${collapsed} duplicate row(s) grouped away`);
  if (input.suppressedCount > 0) {
    parts.push(`${input.suppressedCount} held back with a stated reason`);
  }
  return `${parts.join(', ')}. Grouped from ${input.totalSourceRows} real row(s).`;
}
