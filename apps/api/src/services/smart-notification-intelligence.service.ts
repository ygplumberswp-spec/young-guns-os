import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  applySnControls,
  buildSnActionDraft,
  buildSnCategoryCoverage,
  buildSnDailyBrief,
  buildSnSummary,
  canAccessSmartNotifications,
  canApproveSnActionDrafts,
  canEscalateSnSignal,
  canManageSnSettings,
  canViewSnCategory,
  classifySnModuleSource,
  classifySnNotificationType,
  defaultSnCategoryControl,
  groupSnSignals,
  isValidSnSnoozeMinutes,
  listSnConnections,
  listVisibleSnCategories,
  resolveSnAudienceScope,
  SN_CATEGORIES,
  SN_CATEGORY_LABELS,
  SN_CLIENT_ENTITY_TYPES,
  SN_PRODUCT_COPY,
  SN_SCOPE_RATIONALE,
  snEventKindForAction,
  snSeverityForAlertLevel,
  snSeverityForNotificationType,
  snStatusForAction,
  type CreateSnActionDraftRequest,
  type DecideSnActionRequest,
  type SnActionDraftSummary,
  type SnAuditEntry,
  type SnAudienceScope,
  type SnCategory,
  type SnCategoryControl,
  type SnDashboard,
  type SnRawSignal,
  type SnSettings,
  type SnSignalActionRequest,
  type SnSignalGroup,
  type UpdateSnCategoryControlRequest,
  type UpdateSnSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  ncAlerts,
  notifications,
  securityAuditLogs,
  snActionDrafts,
  snCategoryControls,
  snSettings,
  snSignalEvents,
  snSignalStates,
} from '@titan/db';

export class SmartNotificationIntelligenceError extends Error {
  constructor(
    public readonly code: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'SmartNotificationIntelligenceError';
  }
}

export type SnActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

const DENIED = 'Smart Notifications requires a signed-in role on this company.';
const OWNER_ONLY =
  'Notification controls are Owner only because they govern finance, payroll, security and strategy alerts.';

/** Rows read per source. Bounded so one noisy source cannot starve the others. */
const SOURCE_ROW_LIMIT = 500;

/**
 * Smart Notification Intelligence — prioritisation and noise reduction over
 * the notification surfaces that already exist.
 *
 * Sources, both read live and never copied:
 * - `notifications`  -> real per-user rows from the Notifications inbox
 * - `nc_alerts`      -> real alerts from the Enterprise Notification Centre
 *
 * Every query and mutation is scoped by companyId. Signals are grouped from
 * those rows on each read, so a signal cannot drift from its source, and a
 * category with no rows reports unavailable instead of inventing an alert.
 */
export class SmartNotificationIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  // ─── Access ────────────────────────────────────────────────────────────────

  private assertRead(actor: SnActor): void {
    if (!canAccessSmartNotifications(actor)) {
      throw new SmartNotificationIntelligenceError('FORBIDDEN', DENIED);
    }
  }

  private assertSettings(actor: SnActor): void {
    this.assertRead(actor);
    if (!canManageSnSettings(actor)) {
      throw new SmartNotificationIntelligenceError('FORBIDDEN', OWNER_ONLY);
    }
  }

  private assertApprove(actor: SnActor): void {
    this.assertRead(actor);
    if (!canApproveSnActionDrafts(actor)) {
      throw new SmartNotificationIntelligenceError(
        'FORBIDDEN',
        'Only the Company Owner or Platform Owner may decide a notification recommendation.',
      );
    }
  }

  private async recordAudit(
    actor: SnActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'smart_notification_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoExecuted: false,
        autoActioned: false,
        sensitiveCategoriesOwnerOnly: true,
        signalsInvented: false,
        fakeDataInvented: false,
      },
    });
  }

  // ─── Settings and Owner controls ───────────────────────────────────────────

  private toSettings(row: {
    id: string;
    groupDuplicatesEnabled: boolean;
    dailyBriefEnabled: boolean;
    maxFeedItems: number;
    maxBriefItems: number;
    globalMinSeverity: SnSettings['globalMinSeverity'];
    notes: string | null;
    updatedAt: Date;
  }): SnSettings {
    return {
      id: row.id,
      autoActionsEnabled: false,
      inventSignalsEnabled: false,
      groupDuplicatesEnabled: row.groupDuplicatesEnabled,
      dailyBriefEnabled: row.dailyBriefEnabled,
      maxFeedItems: row.maxFeedItems,
      maxBriefItems: row.maxBriefItems,
      globalMinSeverity: row.globalMinSeverity,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async ensureSettingsRow(companyId: string) {
    const existing = await this.db.query.snSettings.findFirst({
      where: eq(snSettings.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.db
      .insert(snSettings)
      .values({ companyId })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const row = await this.db.query.snSettings.findFirst({
      where: eq(snSettings.companyId, companyId),
    });
    if (!row) {
      throw new SmartNotificationIntelligenceError(
        'INVALID',
        'Notification settings could not be created.',
      );
    }
    return row;
  }

  async getSettings(actor: SnActor): Promise<SnSettings> {
    this.assertRead(actor);
    return this.toSettings(await this.ensureSettingsRow(actor.companyId));
  }

  async updateSettings(actor: SnActor, input: UpdateSnSettingsRequest): Promise<SnSettings> {
    this.assertSettings(actor);
    const current = await this.ensureSettingsRow(actor.companyId);
    if (input.maxFeedItems !== undefined && (input.maxFeedItems < 1 || input.maxFeedItems > 200)) {
      throw new SmartNotificationIntelligenceError(
        'INVALID',
        'Live feed limit must be between 1 and 200 so the feed is neither empty nor flooding.',
      );
    }
    if (input.maxBriefItems !== undefined && (input.maxBriefItems < 1 || input.maxBriefItems > 50)) {
      throw new SmartNotificationIntelligenceError(
        'INVALID',
        'Daily brief limit must be between 1 and 50.',
      );
    }
    const [updated] = await this.db
      .update(snSettings)
      .set({
        groupDuplicatesEnabled: input.groupDuplicatesEnabled ?? current.groupDuplicatesEnabled,
        dailyBriefEnabled: input.dailyBriefEnabled ?? current.dailyBriefEnabled,
        maxFeedItems: input.maxFeedItems ?? current.maxFeedItems,
        maxBriefItems: input.maxBriefItems ?? current.maxBriefItems,
        globalMinSeverity: input.globalMinSeverity ?? current.globalMinSeverity,
        notes: input.notes === undefined ? current.notes : input.notes,
        // Invariants can never be switched on.
        autoActionsEnabled: false,
        inventSignalsEnabled: false,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(snSettings.id, current.id), eq(snSettings.companyId, actor.companyId)))
      .returning();
    if (!updated) {
      throw new SmartNotificationIntelligenceError('NOT_FOUND', 'Notification settings not found.');
    }
    await this.db.insert(snSignalEvents).values({
      companyId: actor.companyId,
      groupKey: null,
      kind: 'settings_updated',
      actorUserId: actor.userId,
      notes: input.notes ?? null,
      metadata: {
        maxFeedItems: updated.maxFeedItems,
        maxBriefItems: updated.maxBriefItems,
        globalMinSeverity: updated.globalMinSeverity,
        dailyBriefEnabled: updated.dailyBriefEnabled,
      },
    });
    await this.recordAudit(actor, 'smart_notifications.settings.update', updated.id, {
      maxFeedItems: updated.maxFeedItems,
      globalMinSeverity: updated.globalMinSeverity,
      ownerOnlyControl: true,
    });
    return this.toSettings(updated);
  }

  /**
   * Category controls, defaulted for anything the Owner has not customised.
   * Defaults are computed rather than seeded so a new category never silently
   * arrives switched off.
   */
  async listCategoryControls(actor: SnActor): Promise<SnCategoryControl[]> {
    this.assertRead(actor);
    const rows = await this.db.query.snCategoryControls.findMany({
      where: eq(snCategoryControls.companyId, actor.companyId),
    });
    const byCategory = new Map(rows.map((row) => [row.category as SnCategory, row]));
    return SN_CATEGORIES.map((category) => {
      const base = defaultSnCategoryControl(category);
      const row = byCategory.get(category);
      if (!row) return base;
      return {
        ...base,
        enabled: row.enabled,
        minSeverity: row.minSeverity,
        digestOnly: row.digestOnly,
      };
    });
  }

  async updateCategoryControl(
    actor: SnActor,
    category: SnCategory,
    input: UpdateSnCategoryControlRequest,
  ): Promise<SnCategoryControl> {
    this.assertSettings(actor);
    const base = defaultSnCategoryControl(category);
    const existing = await this.db.query.snCategoryControls.findFirst({
      where: and(
        eq(snCategoryControls.companyId, actor.companyId),
        eq(snCategoryControls.category, category),
      ),
    });
    const next = {
      enabled: input.enabled ?? existing?.enabled ?? base.enabled,
      minSeverity: input.minSeverity ?? existing?.minSeverity ?? base.minSeverity,
      digestOnly: input.digestOnly ?? existing?.digestOnly ?? base.digestOnly,
    };

    if (existing) {
      await this.db
        .update(snCategoryControls)
        .set({ ...next, updatedByUserId: actor.userId, updatedAt: new Date() })
        .where(
          and(
            eq(snCategoryControls.id, existing.id),
            eq(snCategoryControls.companyId, actor.companyId),
          ),
        );
    } else {
      await this.db
        .insert(snCategoryControls)
        .values({ companyId: actor.companyId, category, ...next, updatedByUserId: actor.userId });
    }

    await this.db.insert(snSignalEvents).values({
      companyId: actor.companyId,
      groupKey: null,
      kind: 'category_updated',
      actorUserId: actor.userId,
      metadata: { category, ...next },
    });
    await this.recordAudit(actor, 'smart_notifications.category.update', actor.companyId, {
      category,
      ...next,
      ownerOnlyControl: true,
    });
    return { ...base, ...next };
  }

  // ─── Reading the real notification surfaces ────────────────────────────────

  /**
   * Loads the real rows this viewer is allowed to see.
   *
   * - company_wide     -> every staff notification and alert for this company
   * - own_work_only    -> only rows addressed or assigned to this user
   * - own_records_only -> only rows addressed to this user about their own
   *                       bookings, quotes, invoices, documents or appointments
   *
   * Neither source table is written to. Both are filtered by companyId first,
   * so a row from another tenant can never enter the feed.
   */
  private async loadRawSignals(
    actor: SnActor,
    scope: SnAudienceScope,
    visibleCategories: Set<SnCategory>,
  ): Promise<SnRawSignal[]> {
    const ownRowsOnly = scope !== 'company_wide';

    const notificationRows = await this.db
      .select({
        id: notifications.id,
        notificationType: notifications.notificationType,
        title: notifications.title,
        body: notifications.body,
        entityType: notifications.entityType,
        entityId: notifications.entityId,
        isRead: notifications.isRead,
        createdAt: notifications.createdAt,
        recipientUserId: notifications.recipientUserId,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.companyId, actor.companyId),
          eq(notifications.recipientType, 'staff'),
          ownRowsOnly ? eq(notifications.recipientUserId, actor.userId) : sql`true`,
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(SOURCE_ROW_LIMIT);

    // Notification Centre alerts are company-level, so a restricted viewer only
    // sees the ones explicitly assigned to them.
    const alertRows = await this.db
      .select({
        id: ncAlerts.id,
        title: ncAlerts.title,
        description: ncAlerts.description,
        alertLevel: ncAlerts.alertLevel,
        status: ncAlerts.status,
        moduleSource: ncAlerts.moduleSource,
        sourceEntityType: ncAlerts.sourceEntityType,
        sourceEntityId: ncAlerts.sourceEntityId,
        assignedUserId: ncAlerts.assignedUserId,
        acknowledgedAt: ncAlerts.acknowledgedAt,
        createdAt: ncAlerts.createdAt,
      })
      .from(ncAlerts)
      .where(
        and(
          eq(ncAlerts.companyId, actor.companyId),
          inArray(ncAlerts.status, ['open', 'acknowledged', 'escalated']),
          ownRowsOnly ? eq(ncAlerts.assignedUserId, actor.userId) : sql`true`,
        ),
      )
      .orderBy(desc(ncAlerts.createdAt))
      .limit(SOURCE_ROW_LIMIT);

    const raw: SnRawSignal[] = [];

    for (const row of notificationRows) {
      const category = classifySnNotificationType(row.notificationType);
      if (!visibleCategories.has(category)) continue;
      if (scope === 'own_records_only' && !this.isClientVisibleEntity(row.entityType)) continue;
      raw.push({
        kind: 'notification',
        sourceId: row.id,
        category,
        severity: snSeverityForNotificationType(row.notificationType),
        title: row.title,
        body: row.body,
        entityType: row.entityType,
        entityId: row.entityId,
        occurredAt: row.createdAt.toISOString(),
        unread: !row.isRead,
        recipientUserId: row.recipientUserId,
      });
    }

    for (const row of alertRows) {
      const category = classifySnModuleSource(row.moduleSource);
      if (!visibleCategories.has(category)) continue;
      if (scope === 'own_records_only' && !this.isClientVisibleEntity(row.sourceEntityType)) {
        continue;
      }
      raw.push({
        kind: 'notification_centre_alert',
        sourceId: row.id,
        category,
        severity: snSeverityForAlertLevel(row.alertLevel),
        title: row.title,
        body: row.description ?? '',
        entityType: row.sourceEntityType,
        entityId: row.sourceEntityId,
        occurredAt: row.createdAt.toISOString(),
        unread: row.acknowledgedAt === null,
        recipientUserId: row.assignedUserId,
      });
    }

    return raw;
  }

  /** Clients only ever see signals about their own records. */
  private isClientVisibleEntity(entityType: string | null): boolean {
    if (!entityType) return false;
    return (SN_CLIENT_ENTITY_TYPES as readonly string[]).includes(entityType.toLowerCase());
  }

  private async loadSignalStates(actor: SnActor) {
    const rows = await this.db.query.snSignalStates.findMany({
      where: and(
        eq(snSignalStates.companyId, actor.companyId),
        eq(snSignalStates.userId, actor.userId),
      ),
    });
    return new Map(rows.map((row) => [row.groupKey, row]));
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  async getDashboard(actor: SnActor): Promise<SnDashboard> {
    this.assertRead(actor);
    const now = new Date();
    const scope = resolveSnAudienceScope(actor);
    const visible = listVisibleSnCategories(actor);
    const visibleSet = new Set(visible);
    const hidden = SN_CATEGORIES.filter((category) => !visibleSet.has(category));

    const [settings, controls, raw, states] = await Promise.all([
      this.getSettings(actor),
      this.listCategoryControls(actor),
      (async () => this.loadRawSignals(actor, scope, visibleSet))(),
      this.loadSignalStates(actor),
    ]);

    // Grouping can be switched off, in which case each real row stays its own
    // signal — the feed gets noisier, never less truthful.
    const grouped = settings.groupDuplicatesEnabled
      ? groupSnSignals(raw, { now })
      : groupSnSignals(
          raw.map((signal) => ({ ...signal, entityType: null, entityId: signal.sourceId })),
          { now },
        );

    const withState: SnSignalGroup[] = grouped.map((group) => {
      const state = states.get(group.groupKey);
      if (!state) return group;
      return {
        ...group,
        status: state.status,
        snoozedUntil: state.snoozedUntil ? state.snoozedUntil.toISOString() : null,
      };
    });

    const { feed, digest, suppressed } = applySnControls(withState, { settings, controls, now });

    const counts = new Map<SnCategory, number>();
    for (const signal of raw) {
      counts.set(signal.category, (counts.get(signal.category) ?? 0) + 1);
    }
    const coverage = buildSnCategoryCoverage({ categories: visible, counts, controls });

    const brief = buildSnDailyBrief({
      settings,
      feed,
      digest,
      suppressedCount: suppressed.length,
      totalSourceRows: raw.length,
    });

    const actionDrafts = await this.listActionDrafts(actor);

    return {
      summary: buildSnSummary({
        feedCount: feed.length,
        suppressedCount: suppressed.length,
        criticalCount: feed.filter((group) => group.severity === 'critical').length,
        groupedRowCount: withState.length,
        totalSourceRows: raw.length,
      }),
      productClarification: {
        notificationsInbox: SN_PRODUCT_COPY.notificationsInbox,
        notificationCentre: SN_PRODUCT_COPY.notificationCentre,
        thisLayer: SN_PRODUCT_COPY.thisLayer,
      },
      policy: {
        autoActionsEnabled: false,
        inventSignalsEnabled: false,
        approvalRequired: true,
        fakeBusinessData: false,
        sensitiveCategoriesOwnerOnly: true,
      },
      scope,
      scopeRationale: SN_SCOPE_RATIONALE[scope],
      visibleCategories: visible,
      hiddenCategories: hidden,
      feed,
      digest,
      suppressed,
      brief,
      coverage,
      settings,
      controls,
      actionDrafts,
      pendingApprovals: actionDrafts.filter(
        (draft) => draft.status === 'draft' || draft.status === 'pending_approval',
      ).length,
      connections: listSnConnections(),
      totalSourceRows: raw.length,
      groupedRowCount: withState.length,
    };
  }

  // ─── Per-signal decisions ──────────────────────────────────────────────────

  /**
   * Records an acknowledge, snooze, dismiss, escalate or reopen decision for
   * one person on one signal. Nothing is deleted: the state row is upserted and
   * an append-only event is written, so the full history survives a dismissal.
   */
  async actOnSignal(
    actor: SnActor,
    input: SnSignalActionRequest,
  ): Promise<{ status: SnSignalGroup['status']; snoozedUntil: string | null }> {
    this.assertRead(actor);
    const groupKey = input.groupKey.trim();
    if (!groupKey) {
      throw new SmartNotificationIntelligenceError('INVALID', 'A signal key is required.');
    }
    const category = groupKey.split(':')[0] ?? '';
    if (!(SN_CATEGORIES as readonly string[]).includes(category)) {
      throw new SmartNotificationIntelligenceError('INVALID', 'Unknown signal category.');
    }
    const typedCategory = category as SnCategory;
    // A person may only act on a signal they are allowed to see.
    if (!canViewSnCategory(actor, typedCategory)) {
      throw new SmartNotificationIntelligenceError(
        'FORBIDDEN',
        `${SN_CATEGORY_LABELS[typedCategory]} signals are not visible to this role.`,
      );
    }
    if (input.action === 'escalate' && !canEscalateSnSignal(actor)) {
      throw new SmartNotificationIntelligenceError(
        'FORBIDDEN',
        'Escalation raises a signal to someone else, so it is not available to technicians or clients.',
      );
    }

    let snoozedUntil: Date | null = null;
    if (input.action === 'snooze') {
      const minutes = input.snoozeMinutes ?? 0;
      if (!isValidSnSnoozeMinutes(minutes)) {
        throw new SmartNotificationIntelligenceError(
          'INVALID',
          'Snooze must be between 15 minutes and 7 days so a signal is deferred, never buried.',
        );
      }
      snoozedUntil = new Date(Date.now() + minutes * 60_000);
    }

    const status = snStatusForAction(input.action);
    const existing = await this.db.query.snSignalStates.findFirst({
      where: and(
        eq(snSignalStates.companyId, actor.companyId),
        eq(snSignalStates.userId, actor.userId),
        eq(snSignalStates.groupKey, groupKey),
      ),
    });

    if (existing) {
      await this.db
        .update(snSignalStates)
        .set({
          status,
          snoozedUntil,
          notes: input.notes ?? existing.notes,
          updatedAt: new Date(),
        })
        .where(
          and(eq(snSignalStates.id, existing.id), eq(snSignalStates.companyId, actor.companyId)),
        );
    } else {
      await this.db.insert(snSignalStates).values({
        companyId: actor.companyId,
        userId: actor.userId,
        groupKey,
        category: typedCategory,
        status,
        snoozedUntil,
        notes: input.notes ?? null,
      });
    }

    await this.db.insert(snSignalEvents).values({
      companyId: actor.companyId,
      groupKey,
      kind: snEventKindForAction(input.action),
      actorUserId: actor.userId,
      notes: input.notes ?? null,
      snoozedUntil,
      metadata: { category: typedCategory, action: input.action, deleted: false },
    });

    await this.recordAudit(actor, `smart_notifications.signal.${input.action}`, groupKey, {
      category: typedCategory,
      status,
      historyPreserved: true,
    });

    return { status, snoozedUntil: snoozedUntil ? snoozedUntil.toISOString() : null };
  }

  /** Full audit history for one signal, newest first. */
  async listSignalAudit(actor: SnActor, groupKey: string): Promise<SnAuditEntry[]> {
    this.assertRead(actor);
    const category = groupKey.split(':')[0] ?? '';
    if (
      (SN_CATEGORIES as readonly string[]).includes(category) &&
      !canViewSnCategory(actor, category as SnCategory)
    ) {
      throw new SmartNotificationIntelligenceError(
        'FORBIDDEN',
        'This signal category is not visible to this role.',
      );
    }
    const rows = await this.db.query.snSignalEvents.findMany({
      where: and(
        eq(snSignalEvents.companyId, actor.companyId),
        eq(snSignalEvents.groupKey, groupKey),
      ),
      orderBy: [desc(snSignalEvents.occurredAt)],
      limit: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      groupKey: row.groupKey,
      kind: row.kind,
      actorUserId: row.actorUserId,
      notes: row.notes,
      snoozedUntil: row.snoozedUntil ? row.snoozedUntil.toISOString() : null,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  /** Company-level audit history, Owner only because it spans every person. */
  async listCompanyAudit(actor: SnActor): Promise<SnAuditEntry[]> {
    this.assertSettings(actor);
    const rows = await this.db.query.snSignalEvents.findMany({
      where: eq(snSignalEvents.companyId, actor.companyId),
      orderBy: [desc(snSignalEvents.occurredAt)],
      limit: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      groupKey: row.groupKey,
      kind: row.kind,
      actorUserId: row.actorUserId,
      notes: row.notes,
      snoozedUntil: row.snoozedUntil ? row.snoozedUntil.toISOString() : null,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  // ─── Approval-gated recommendations ────────────────────────────────────────

  private toActionSummary(row: {
    id: string;
    groupKey: string | null;
    category: SnCategory | null;
    title: string;
    body: string;
    status: SnActionDraftSummary['status'];
    createdAt: Date;
    decidedAt: Date | null;
  }): SnActionDraftSummary {
    return {
      id: row.id,
      groupKey: row.groupKey,
      category: row.category,
      title: row.title,
      body: row.body,
      status: row.status,
      autoExecuted: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    };
  }

  async listActionDrafts(actor: SnActor): Promise<SnActionDraftSummary[]> {
    this.assertRead(actor);
    const rows = await this.db.query.snActionDrafts.findMany({
      where: eq(snActionDrafts.companyId, actor.companyId),
      orderBy: [desc(snActionDrafts.createdAt)],
      limit: 50,
    });
    // A recommendation about a category this role cannot see stays hidden.
    return rows
      .filter((row) => !row.category || canViewSnCategory(actor, row.category as SnCategory))
      .map((row) => this.toActionSummary(row));
  }

  async createActionDraft(
    actor: SnActor,
    input: CreateSnActionDraftRequest,
  ): Promise<SnActionDraftSummary> {
    this.assertRead(actor);
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || !body) {
      throw new SmartNotificationIntelligenceError('INVALID', 'Title and body are required.');
    }
    if (input.category && !canViewSnCategory(actor, input.category)) {
      throw new SmartNotificationIntelligenceError(
        'FORBIDDEN',
        'This signal category is not visible to this role.',
      );
    }
    const [created] = await this.db
      .insert(snActionDrafts)
      .values({
        companyId: actor.companyId,
        groupKey: input.groupKey ?? null,
        category: input.category ?? null,
        title,
        body,
        // Nothing executes on creation — a recommendation waits for the Owner.
        status: input.submitForApproval ? 'pending_approval' : 'draft',
        autoExecuted: false,
        createdByUserId: actor.userId,
      })
      .returning();
    if (!created) {
      throw new SmartNotificationIntelligenceError('INVALID', 'Recommendation could not be created.');
    }
    await this.recordAudit(actor, 'smart_notifications.action.create', created.id, {
      category: created.category,
      status: created.status,
      approvalRequired: true,
    });
    return this.toActionSummary(created);
  }

  async decideActionDraft(
    actor: SnActor,
    actionId: string,
    input: DecideSnActionRequest,
  ): Promise<SnActionDraftSummary> {
    this.assertApprove(actor);
    const existing = await this.db.query.snActionDrafts.findFirst({
      where: and(
        eq(snActionDrafts.id, actionId),
        eq(snActionDrafts.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new SmartNotificationIntelligenceError('NOT_FOUND', 'Recommendation not found.');
    }
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new SmartNotificationIntelligenceError(
        'INVALID',
        `Recommendation is already ${existing.status}.`,
      );
    }
    const nextStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'reject'
          ? 'rejected'
          : 'acknowledged';
    const [updated] = await this.db
      .update(snActionDrafts)
      .set({
        status: nextStatus,
        decisionNotes: input.notes ?? null,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        // Approval records an Owner decision; it never executes a change.
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(
        and(eq(snActionDrafts.id, actionId), eq(snActionDrafts.companyId, actor.companyId)),
      )
      .returning();
    if (!updated) {
      throw new SmartNotificationIntelligenceError('NOT_FOUND', 'Recommendation not found.');
    }
    await this.recordAudit(actor, 'smart_notifications.action.decide', updated.id, {
      decision: input.decision,
      status: updated.status,
      executedDownstreamChange: false,
    });
    return this.toActionSummary(updated);
  }

  /**
   * Turns the signals currently in the feed into Owner recommendations.
   * Nothing executes, and a signal that already has an open recommendation is
   * not duplicated — the noise reduction applies to recommendations too.
   */
  async refreshActionDrafts(
    actor: SnActor,
    input: { submitForApproval?: boolean } = {},
  ): Promise<SnActionDraftSummary[]> {
    this.assertRead(actor);
    const dashboard = await this.getDashboard(actor);
    const candidates = dashboard.feed.filter(
      (group) => group.severity === 'critical' || group.severity === 'high',
    );
    if (candidates.length === 0) return dashboard.actionDrafts;

    const openRows = await this.db.query.snActionDrafts.findMany({
      where: and(
        eq(snActionDrafts.companyId, actor.companyId),
        inArray(snActionDrafts.status, ['draft', 'pending_approval']),
      ),
    });
    const existingKeys = new Set(
      openRows.map((row) => `${row.groupKey ?? ''}|${row.title}`),
    );

    const toInsert = candidates
      .map((group) => {
        const draft = buildSnActionDraft({
          categoryLabel: SN_CATEGORY_LABELS[group.category],
          title: group.title,
          detail: group.detail,
          eventCount: group.eventCount,
        });
        return { groupKey: group.groupKey, category: group.category, ...draft };
      })
      .filter((draft) => !existingKeys.has(`${draft.groupKey}|${draft.title}`));

    if (toInsert.length > 0) {
      await this.db.insert(snActionDrafts).values(
        toInsert.map((draft) => ({
          companyId: actor.companyId,
          groupKey: draft.groupKey,
          category: draft.category,
          title: draft.title,
          body: draft.body,
          status: input.submitForApproval ? ('pending_approval' as const) : ('draft' as const),
          autoExecuted: false,
          createdByUserId: actor.userId,
        })),
      );
      await this.recordAudit(actor, 'smart_notifications.action.refresh', actor.companyId, {
        generated: toInsert.length,
        approvalRequired: true,
        executedDownstreamChange: false,
      });
    }

    return this.listActionDrafts(actor);
  }
}
