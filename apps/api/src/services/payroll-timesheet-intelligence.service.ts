import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  buildApprovalBacklogInsightDraft,
  buildAuraWorkforceInsightDraft,
  buildCapacityIssueDraft,
  buildLabourCostGapInsightDraft,
  buildOvertimeInsightDraft,
  buildProductivityInsightDraft,
  buildSchedulingOpportunityDraft,
  buildPtiCostForecastSnapshot,
  buildPtiHoursSnapshot,
  buildPtiLabourCostSnapshot,
  buildPtiPayrollSummarySnapshot,
  canAccessPayrollTimesheetIntelligence,
  canAccessPtiSelfTimesheetView,
  canApprovePtiInsightDrafts,
  canManagePtiSettings,
  canWritePayrollTimesheetIntelligence,
  defaultPtiSettings,
  listPtiConnections,
  parseHours,
  PTI_PRODUCT_COPY,
  type AcknowledgePtiInsightRequest,
  type CreatePtiAuraInsightRequest,
  type DecidePtiInsightRequest,
  type PtiAttendanceRow,
  type PtiAuraInsightSummary,
  type PtiEmployeeHoursRow,
  type PtiInsightDraftSummary,
  type PtiJobTimeRow,
  type PtiOwnerDashboard,
  type PtiSelfTimesheetView,
  type PtiSettings,
  type PtiTimesheetRow,
  type RefreshPtiInsightsRequest,
  type UpdatePtiSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  mobileTimeEntries,
  ptiAuraInsights,
  ptiInsightDrafts,
  ptiSettings,
  securityAuditLogs,
  users,
  wiPayrollPeriods,
  wiPayrollPreparationBatches,
  wiTimesheets,
} from '@titan/db';

export class PayrollTimesheetIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PayrollTimesheetIntelligenceError';
  }
}

export type PtiActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export class PayrollTimesheetIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertOwnerAdmin(actor: PtiActor): void {
    if (!canAccessPayrollTimesheetIntelligence(actor)) {
      throw new PayrollTimesheetIntelligenceError(
        'FORBIDDEN',
        'Payroll & Timesheet Intelligence requires Owner or Admin access. Technicians, clients, and managers cannot view sensitive payroll.',
      );
    }
  }

  private assertWrite(actor: PtiActor): void {
    this.assertOwnerAdmin(actor);
    if (!canWritePayrollTimesheetIntelligence(actor)) {
      throw new PayrollTimesheetIntelligenceError(
        'FORBIDDEN',
        'Write actions require Owner or Admin access.',
      );
    }
  }

  private assertApprove(actor: PtiActor): void {
    this.assertWrite(actor);
    if (!canApprovePtiInsightDrafts(actor)) {
      throw new PayrollTimesheetIntelligenceError(
        'FORBIDDEN',
        'Only Owner or Admin may approve payroll timesheet insight drafts.',
      );
    }
  }

  private assertManageSettings(actor: PtiActor): void {
    this.assertWrite(actor);
    if (!canManagePtiSettings(actor)) {
      throw new PayrollTimesheetIntelligenceError(
        'FORBIDDEN',
        'Only Owner or Admin may change Payroll & Timesheet Intelligence settings.',
      );
    }
  }

  private async recordAudit(
    actor: PtiActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'payroll_timesheet_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        inventWages: false,
        autoPayrollMutation: false,
      },
    });
  }

  private displayName(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`.trim();
  }

  private toDraft(row: typeof ptiInsightDrafts.$inferSelect): PtiInsightDraftSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      subjectUserId: row.subjectUserId,
      jobId: row.jobId,
      inventedWages: false,
      autoPayrollMutation: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toInsight(row: typeof ptiAuraInsights.$inferSelect): PtiAuraInsightSummary {
    return {
      id: row.id,
      target: row.target,
      status: row.status,
      title: row.title,
      insight: row.insight,
      href: row.href,
      sourceInsightDraftId: row.sourceInsightDraftId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toSettings(row: typeof ptiSettings.$inferSelect): PtiSettings {
    return defaultPtiSettings({
      id: row.id,
      insightsEnabled: row.insightsEnabled,
      selfTimesheetViewEnabled: row.selfTimesheetViewEnabled,
      standardWeeklyHours: parseHours(row.standardWeeklyHours),
      overtimeDailyThresholdHours: parseHours(row.overtimeDailyThresholdHours),
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private async ensureSettings(actor: PtiActor): Promise<PtiSettings> {
    const existing = await this.db.query.ptiSettings.findFirst({
      where: eq(ptiSettings.companyId, actor.companyId),
    });
    if (existing) return this.toSettings(existing);

    const [created] = await this.db
      .insert(ptiSettings)
      .values({
        companyId: actor.companyId,
        insightsEnabled: true,
        selfTimesheetViewEnabled: true,
        standardWeeklyHours: '40',
        overtimeDailyThresholdHours: '8',
        inventWagesEnabled: false,
        autoPayrollMutationEnabled: false,
        updatedByUserId: actor.userId,
      })
      .returning();

    return this.toSettings(created);
  }

  private labourMinutesFromTimesheets(
    rows: Array<{
      standardHours: string | number;
      overtimeHours: string | number;
      travelHours: string | number;
    }>,
  ): number {
    let totalHours = 0;
    for (const row of rows) {
      totalHours +=
        parseHours(row.standardHours) +
        parseHours(row.overtimeHours) +
        parseHours(row.travelHours);
    }
    return Math.round(totalHours * 60);
  }

  private buildEmployeeHours(
    timesheetRows: Array<typeof wiTimesheets.$inferSelect>,
    userNameById: Map<string, string>,
  ): PtiEmployeeHoursRow[] {
    const byUser = new Map<
      string,
      {
        standardHours: number;
        overtimeHours: number;
        travelHours: number;
        submittedCount: number;
        approvedCount: number;
      }
    >();

    for (const row of timesheetRows) {
      const entry = byUser.get(row.userId) ?? {
        standardHours: 0,
        overtimeHours: 0,
        travelHours: 0,
        submittedCount: 0,
        approvedCount: 0,
      };
      entry.standardHours += parseHours(row.standardHours);
      entry.overtimeHours += parseHours(row.overtimeHours);
      entry.travelHours += parseHours(row.travelHours);
      if (row.status === 'submitted') entry.submittedCount += 1;
      if (row.status === 'approved') entry.approvedCount += 1;
      byUser.set(row.userId, entry);
    }

    return [...byUser.entries()].map(([userId, agg]) => ({
      userId,
      userName: userNameById.get(userId) ?? null,
      standardHours: Math.round(agg.standardHours * 100) / 100,
      overtimeHours: Math.round(agg.overtimeHours * 100) / 100,
      travelHours: Math.round(agg.travelHours * 100) / 100,
      submittedCount: agg.submittedCount,
      approvedCount: agg.approvedCount,
    }));
  }

  private buildAttendance(
    timesheetRows: Array<typeof wiTimesheets.$inferSelect>,
    userNameById: Map<string, string>,
  ): PtiAttendanceRow[] {
    const byUser = new Map<
      string,
      { clockInCount: number; clockOutCount: number; incompleteClockPairs: number }
    >();

    for (const row of timesheetRows) {
      const entry = byUser.get(row.userId) ?? {
        clockInCount: 0,
        clockOutCount: 0,
        incompleteClockPairs: 0,
      };
      if (row.clockInAt) entry.clockInCount += 1;
      if (row.clockOutAt) entry.clockOutCount += 1;
      if (row.clockInAt && !row.clockOutAt) entry.incompleteClockPairs += 1;
      byUser.set(row.userId, entry);
    }

    return [...byUser.entries()].map(([userId, agg]) => ({
      userId,
      userName: userNameById.get(userId) ?? null,
      clockInCount: agg.clockInCount,
      clockOutCount: agg.clockOutCount,
      incompleteClockPairs: agg.incompleteClockPairs,
      rationale:
        agg.incompleteClockPairs > 0
          ? 'Incomplete clock pairs detected from real timesheet clock fields — review under Workforce Intelligence.'
          : 'Attendance derived from real timesheet clock-in/out timestamps only.',
    }));
  }

  private buildJobTime(
    timesheetRows: Array<typeof wiTimesheets.$inferSelect>,
    mobileRows: Array<typeof mobileTimeEntries.$inferSelect>,
  ): PtiJobTimeRow[] {
    const byJob = new Map<string, { timesheetMinutes: number; mobileEntryMinutes: number }>();

    for (const row of timesheetRows) {
      if (!row.jobId) continue;
      const entry = byJob.get(row.jobId) ?? { timesheetMinutes: 0, mobileEntryMinutes: 0 };
      const hours =
        parseHours(row.standardHours) +
        parseHours(row.overtimeHours) +
        parseHours(row.travelHours);
      entry.timesheetMinutes += Math.round(hours * 60);
      byJob.set(row.jobId, entry);
    }

    for (const row of mobileRows) {
      if (!row.jobId) continue;
      const entry = byJob.get(row.jobId) ?? { timesheetMinutes: 0, mobileEntryMinutes: 0 };
      entry.mobileEntryMinutes += row.durationMinutes ?? 0;
      byJob.set(row.jobId, entry);
    }

    return [...byJob.entries()]
      .map(([jobId, agg]) => ({
        jobId,
        timesheetMinutes: agg.timesheetMinutes,
        mobileEntryMinutes: agg.mobileEntryMinutes,
        totalMinutes: agg.timesheetMinutes + agg.mobileEntryMinutes,
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);
  }

  private hoursInWindow(
    timesheetRows: Array<typeof wiTimesheets.$inferSelect>,
    start: Date,
    end: Date,
  ): number {
    let total = 0;
    for (const row of timesheetRows) {
      const updated = row.updatedAt;
      if (updated >= start && updated < end) {
        total +=
          parseHours(row.standardHours) +
          parseHours(row.overtimeHours) +
          parseHours(row.travelHours);
      }
    }
    return Math.round(total * 100) / 100;
  }

  async getOwnerDashboard(actor: PtiActor): Promise<PtiOwnerDashboard> {
    this.assertOwnerAdmin(actor);
    const settings = await this.ensureSettings(actor);

    const now = new Date();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const recentStart = new Date(now.getTime() - weekMs);
    const priorStart = new Date(now.getTime() - 2 * weekMs);

    const [
      timesheetRows,
      mobileRows,
      payrollPeriods,
      payrollBatches,
      draftRows,
      insightRows,
      userRows,
    ] = await Promise.all([
      this.db.query.wiTimesheets.findMany({
        where: eq(wiTimesheets.companyId, actor.companyId),
        orderBy: [desc(wiTimesheets.updatedAt)],
        limit: 500,
      }),
      this.db.query.mobileTimeEntries.findMany({
        where: eq(mobileTimeEntries.companyId, actor.companyId),
        orderBy: [desc(mobileTimeEntries.createdAt)],
        limit: 500,
      }),
      this.db.query.wiPayrollPeriods.findMany({
        where: eq(wiPayrollPeriods.companyId, actor.companyId),
        orderBy: [desc(wiPayrollPeriods.updatedAt)],
        limit: 100,
      }),
      this.db.query.wiPayrollPreparationBatches.findMany({
        where: eq(wiPayrollPreparationBatches.companyId, actor.companyId),
        orderBy: [desc(wiPayrollPreparationBatches.updatedAt)],
        limit: 100,
      }),
      this.db.query.ptiInsightDrafts.findMany({
        where: eq(ptiInsightDrafts.companyId, actor.companyId),
        orderBy: [desc(ptiInsightDrafts.createdAt)],
        limit: 50,
      }),
      this.db.query.ptiAuraInsights.findMany({
        where: eq(ptiAuraInsights.companyId, actor.companyId),
        orderBy: [desc(ptiAuraInsights.createdAt)],
        limit: 50,
      }),
      this.db.query.users.findMany({
        where: eq(users.companyId, actor.companyId),
        limit: 500,
      }),
    ]);

    const userNameById = new Map(
      userRows.map((u) => [u.id, this.displayName(u.firstName, u.lastName)]),
    );

    let totalStandardHours = 0;
    let totalOvertimeHours = 0;
    let totalTravelHours = 0;
    let pendingApprovalCount = 0;

    for (const row of timesheetRows) {
      totalStandardHours += parseHours(row.standardHours);
      totalOvertimeHours += parseHours(row.overtimeHours);
      totalTravelHours += parseHours(row.travelHours);
      if (row.status === 'submitted') pendingApprovalCount += 1;
    }

    const hours = buildPtiHoursSnapshot({
      timesheetCount: timesheetRows.length,
      mobileEntryCount: mobileRows.length,
      totalStandardHours: Math.round(totalStandardHours * 100) / 100,
      totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
      totalTravelHours: Math.round(totalTravelHours * 100) / 100,
      pendingApprovalCount,
    });

    const labourMinutes =
      this.labourMinutesFromTimesheets(timesheetRows) +
      mobileRows.reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);

    const labourCost = buildPtiLabourCostSnapshot({
      labourMinutes,
      hourlyRateCents: null,
    });

    const exportedBatchCount = payrollBatches.filter((b) => b.status === 'exported').length;
    const earningsTotalCents = payrollBatches.reduce(
      (sum, b) => sum + (b.earningsTotalCents ?? 0),
      0,
    );

    const payrollSummary = buildPtiPayrollSummarySnapshot({
      periodCount: payrollPeriods.length,
      batchCount: payrollBatches.length,
      exportedBatchCount,
      earningsTotalCents,
    });

    const recentWeekHours = this.hoursInWindow(timesheetRows, recentStart, now);
    const priorWeekHours = this.hoursInWindow(timesheetRows, priorStart, recentStart);

    const costForecast = buildPtiCostForecastSnapshot({
      recentWeekHours,
      priorWeekHours,
      hourlyRateCents: null,
    });

    const timesheets: PtiTimesheetRow[] = timesheetRows.slice(0, 100).map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: userNameById.get(row.userId) ?? null,
      jobId: row.jobId,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      status: row.status,
      standardHours: parseHours(row.standardHours),
      overtimeHours: parseHours(row.overtimeHours),
      travelHours: parseHours(row.travelHours),
      clockInAt: row.clockInAt?.toISOString() ?? null,
      clockOutAt: row.clockOutAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));

    const employeeHours = this.buildEmployeeHours(timesheetRows, userNameById);
    const attendance = this.buildAttendance(timesheetRows, userNameById);
    const jobTime = this.buildJobTime(timesheetRows, mobileRows);
    const insightDrafts = draftRows.map((d) => this.toDraft(d));
    const pendingApprovals = insightDrafts.filter(
      (d) => d.status === 'draft' || d.status === 'pending_approval',
    ).length;

    const hrFoundationPresent = true;

    let summary: string;
    if (hours.availability === 'unavailable') {
      summary =
        'Payroll & Timesheet Intelligence is ready. No real timesheet or mobile time rows yet — hours and labour cost stay unavailable (not invented).';
    } else {
      summary = `Real labour signals: ${hours.timesheetCount} timesheet(s), ${hours.mobileEntryCount} mobile entry(ies), ${hours.totalOvertimeHours}h overtime, ${pendingApprovalCount} pending approval(s). Labour cost unavailable without stored wage rate.`;
    }

    return {
      summary,
      productClarification: { ...PTI_PRODUCT_COPY },
      policy: {
        inventWages: false,
        autoPayrollMutation: false,
        fakePayroll: false,
        sensitivePayrollOwnerAdminOnly: true,
        timesheetAutoApproved: false,
        ownerControlled: true,
      },
      hours,
      labourCost,
      payrollSummary,
      costForecast,
      employeeHours,
      timesheets,
      jobTime,
      attendance,
      insightDrafts,
      auraInsights: insightRows.map((i) => this.toInsight(i)),
      connections: listPtiConnections({
        timesheetsAvailable: timesheetRows.length > 0,
        payrollAvailable: payrollPeriods.length > 0 || payrollBatches.length > 0,
        hrFoundationPresent,
      }),
      settings,
      pendingApprovals,
    };
  }

  async refreshInsightDrafts(
    actor: PtiActor,
    input: RefreshPtiInsightsRequest = {},
  ): Promise<{ created: number; drafts: PtiInsightDraftSummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.insightsEnabled) {
      throw new PayrollTimesheetIntelligenceError(
        'INVALID_STATE',
        'Insight drafts are disabled in Payroll & Timesheet Intelligence settings.',
      );
    }

    const [timesheetRows, userRows] = await Promise.all([
      this.db.query.wiTimesheets.findMany({
        where: eq(wiTimesheets.companyId, actor.companyId),
        orderBy: [desc(wiTimesheets.updatedAt)],
        limit: 500,
      }),
      this.db.query.users.findMany({
        where: eq(users.companyId, actor.companyId),
        limit: 500,
      }),
    ]);

    const userNameById = new Map(
      userRows.map((u) => [u.id, this.displayName(u.firstName, u.lastName)]),
    );

    const created: PtiInsightDraftSummary[] = [];
    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const threshold = settings.overtimeDailyThresholdHours;

    const overtimeByUser = new Map<string, number>();
    for (const row of timesheetRows) {
      const ot = parseHours(row.overtimeHours);
      if (ot <= 0) continue;
      overtimeByUser.set(row.userId, (overtimeByUser.get(row.userId) ?? 0) + ot);
    }

    for (const [userId, overtimeHours] of overtimeByUser) {
      if (overtimeHours < threshold) continue;

      const existingOpen = await this.db.query.ptiInsightDrafts.findFirst({
        where: and(
          eq(ptiInsightDrafts.companyId, actor.companyId),
          eq(ptiInsightDrafts.kind, 'overtime'),
          eq(ptiInsightDrafts.subjectUserId, userId),
          inArray(ptiInsightDrafts.status, ['draft', 'pending_approval']),
        ),
      });
      if (existingOpen) continue;

      const userName = userNameById.get(userId) ?? userId;
      const draft = buildOvertimeInsightDraft({
        userName,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        thresholdHours: threshold,
        subjectUserId: userId,
      });

      const [inserted] = await this.db
        .insert(ptiInsightDrafts)
        .values({
          companyId: actor.companyId,
          kind: draft.kind,
          status,
          title: draft.title,
          body: draft.body,
          subjectUserId: userId,
          inventedWages: false,
          autoPayrollMutation: false,
          createdByUserId: actor.userId,
          metadata: { source: 'real_timesheets', overtimeHours },
        })
        .returning();

      created.push(this.toDraft(inserted));
      await this.recordAudit(actor, 'pti_insight_draft_created', inserted.id, {
        kind: draft.kind,
        subjectUserId: userId,
        overtimeHours,
      });
    }

    const pendingCount = timesheetRows.filter((r) => r.status === 'submitted').length;
    if (pendingCount > 0) {
      const existingBacklog = await this.db.query.ptiInsightDrafts.findFirst({
        where: and(
          eq(ptiInsightDrafts.companyId, actor.companyId),
          eq(ptiInsightDrafts.kind, 'approval_backlog'),
          inArray(ptiInsightDrafts.status, ['draft', 'pending_approval']),
        ),
      });

      if (!existingBacklog) {
        const draft = buildApprovalBacklogInsightDraft({ pendingCount });
        const [inserted] = await this.db
          .insert(ptiInsightDrafts)
          .values({
            companyId: actor.companyId,
            kind: draft.kind,
            status,
            title: draft.title,
            body: draft.body,
            inventedWages: false,
            autoPayrollMutation: false,
            createdByUserId: actor.userId,
            metadata: { source: 'real_timesheets', pendingCount },
          })
          .returning();

        created.push(this.toDraft(inserted));
        await this.recordAudit(actor, 'pti_insight_draft_created', inserted.id, {
          kind: draft.kind,
          pendingCount,
        });
      }
    }

    const labourMinutes = this.labourMinutesFromTimesheets(timesheetRows);
    if (labourMinutes > 0) {
      const existingGap = await this.db.query.ptiInsightDrafts.findFirst({
        where: and(
          eq(ptiInsightDrafts.companyId, actor.companyId),
          eq(ptiInsightDrafts.kind, 'labour_cost'),
          inArray(ptiInsightDrafts.status, ['draft', 'pending_approval']),
        ),
      });

      if (!existingGap) {
        const draft = buildLabourCostGapInsightDraft({ labourMinutes });
        const [inserted] = await this.db
          .insert(ptiInsightDrafts)
          .values({
            companyId: actor.companyId,
            kind: draft.kind,
            status,
            title: draft.title,
            body: draft.body,
            inventedWages: false,
            autoPayrollMutation: false,
            createdByUserId: actor.userId,
            metadata: { source: 'real_timesheets', labourMinutes, hourlyRateCents: null },
          })
          .returning();

        created.push(this.toDraft(inserted));
        await this.recordAudit(actor, 'pti_insight_draft_created', inserted.id, {
          kind: draft.kind,
          labourMinutes,
          hourlyRateCents: null,
        });
      }
    }


    // AURA workforce insight drafts (recommendations only — never auto payroll)
    const auraCreated = await this.refreshAuraWorkforceInsights(actor, {
      timesheetRows,
      userNameById,
      pendingCount,
      labourMinutes,
      totalOvertimeHours: [...overtimeByUser.values()].reduce((s, n) => s + n, 0),
    });
    void auraCreated;

    return { created: created.length, drafts: created };
  }

  /**
   * AURA Workforce Insights — overtime trends, labour cost risks, capacity
   * issues, productivity patterns, scheduling opportunities. Draft recommendations only.
   */
  private async refreshAuraWorkforceInsights(
    actor: PtiActor,
    input: {
      timesheetRows: Array<{
        userId: string;
        jobId: string | null;
        standardHours: string | number | null;
        overtimeHours: string | number | null;
        travelHours: string | number | null;
        status: string;
      }>;
      userNameById: Map<string, string>;
      pendingCount: number;
      labourMinutes: number;
      totalOvertimeHours: number;
    },
  ): Promise<number> {
    let created = 0;
    const openTitles = new Set(
      (
        await this.db.query.ptiAuraInsights.findMany({
          where: and(
            eq(ptiAuraInsights.companyId, actor.companyId),
            eq(ptiAuraInsights.status, 'open'),
          ),
          limit: 100,
        })
      ).map((r) => r.title),
    );

    const candidates: Array<ReturnType<typeof buildAuraWorkforceInsightDraft>> = [];

    if (input.totalOvertimeHours > 0) {
      candidates.push(
        buildAuraWorkforceInsightDraft({
          kind: 'overtime_trend',
          title: `Overtime trend — ${Math.round(input.totalOvertimeHours * 10) / 10}h recorded`,
          supportingSignals: [
            `total_overtime_hours=${Math.round(input.totalOvertimeHours * 100) / 100}`,
            `timesheet_rows=${input.timesheetRows.length}`,
          ],
          recommendation:
            'Review overtime concentration vs schedule load. Draft only — does not change payroll or auto-approve timesheets.',
        }),
      );
    }

    if (input.labourMinutes > 0) {
      candidates.push(
        buildAuraWorkforceInsightDraft({
          kind: 'labour_cost_risk',
          title: 'Labour cost risk — hours without stored wage rate',
          supportingSignals: [
            `labour_minutes=${input.labourMinutes}`,
            'hourly_rate_cents=unavailable',
          ],
          recommendation:
            'Labour minutes are real; cost cents stay unavailable without a stored hourly rate. Wages are never invented. Draft recommendation only.',
        }),
      );
    }

    // Productivity patterns from job-linked vs total hours
    const byUser = new Map<string, { total: number; jobLinked: number }>();
    for (const row of input.timesheetRows) {
      const h =
        parseHours(row.standardHours) +
        parseHours(row.overtimeHours) +
        parseHours(row.travelHours);
      const cur = byUser.get(row.userId) ?? { total: 0, jobLinked: 0 };
      cur.total += h;
      if (row.jobId) cur.jobLinked += h;
      byUser.set(row.userId, cur);
    }
    for (const [userId, stats] of byUser) {
      if (stats.total < 8) continue;
      const ratio = stats.jobLinked / stats.total;
      if (ratio >= 0.15 && ratio <= 0.85) {
        const name = input.userNameById.get(userId) ?? userId;
        const prod = buildProductivityInsightDraft({
          userName: name,
          jobLinkedHours: Math.round(stats.jobLinked * 100) / 100,
          totalHours: Math.round(stats.total * 100) / 100,
        });
        candidates.push(
          buildAuraWorkforceInsightDraft({
            kind: 'productivity_pattern',
            title: prod.title,
            supportingSignals: [
              `user=${userId}`,
              `job_linked_hours=${stats.jobLinked}`,
              `total_hours=${stats.total}`,
            ],
            recommendation: prod.body.split('\n').slice(-1)[0] ?? prod.body,
          }),
        );
        break; // one productivity draft per refresh is enough
      }
    }

    if (input.pendingCount > 0 || input.totalOvertimeHours >= 8) {
      const sched = buildSchedulingOpportunityDraft({
        pendingApprovalCount: input.pendingCount,
        overtimeHours: input.totalOvertimeHours,
      });
      candidates.push(
        buildAuraWorkforceInsightDraft({
          kind: 'scheduling_opportunity',
          title: sched.title,
          supportingSignals: [
            `pending_approvals=${input.pendingCount}`,
            `overtime_hours=${Math.round(input.totalOvertimeHours * 100) / 100}`,
          ],
          recommendation:
            'Consider schedule buffering or approval catch-up. Draft only — never auto-mutates scheduling or payroll.',
        }),
      );

      const capacity = buildCapacityIssueDraft({
        pendingApprovalCount: input.pendingCount,
        overtimeHours: input.totalOvertimeHours,
        activeTechnicianCount: byUser.size,
      });
      candidates.push(
        buildAuraWorkforceInsightDraft({
          kind: 'capacity_issue',
          title: capacity.title,
          supportingSignals: [
            `pending_approvals=${input.pendingCount}`,
            `overtime_hours=${Math.round(input.totalOvertimeHours * 100) / 100}`,
            `active_technicians=${byUser.size}`,
          ],
          recommendation: capacity.recommendation,
        }),
      );
    }

    for (const candidate of candidates.slice(0, 8)) {
      if (openTitles.has(candidate.title)) continue;
      const [row] = await this.db
        .insert(ptiAuraInsights)
        .values({
          companyId: actor.companyId,
          target: candidate.target,
          status: 'open',
          title: candidate.title,
          insight: candidate.insight,
          href:
            candidate.target === 'scheduling'
              ? '/scheduling'
              : candidate.target === 'payroll'
                ? '/workforce-intelligence'
                : '/aura/command-centre',
          createdByUserId: actor.userId,
          metadata: {
            source: 'aura_workforce_insights',
            draftRecommendation: true,
            autoPayrollMutation: false,
            inventWages: false,
          },
        })
        .returning();
      openTitles.add(candidate.title);
      created += 1;
      await this.recordAudit(actor, 'pti_aura_workforce_insight_created', row.id, {
        target: row.target,
        title: row.title,
        draftRecommendation: true,
        inventWages: false,
        autoPayrollMutation: false,
      });
    }

    return created;
  }

  async decideInsightDraft(
    actor: PtiActor,
    draftId: string,
    input: DecidePtiInsightRequest,
  ): Promise<PtiInsightDraftSummary> {
    this.assertApprove(actor);

    const existing = await this.db.query.ptiInsightDrafts.findFirst({
      where: and(
        eq(ptiInsightDrafts.id, draftId),
        eq(ptiInsightDrafts.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new PayrollTimesheetIntelligenceError('NOT_FOUND', 'Insight draft not found.');
    }
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new PayrollTimesheetIntelligenceError(
        'INVALID_STATE',
        `Insight draft is already ${existing.status}.`,
      );
    }

    const nextStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'acknowledge'
          ? 'acknowledged'
          : 'rejected';

    const [updated] = await this.db
      .update(ptiInsightDrafts)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        inventedWages: false,
        autoPayrollMutation: false,
        updatedAt: new Date(),
      })
      .where(
        and(eq(ptiInsightDrafts.id, draftId), eq(ptiInsightDrafts.companyId, actor.companyId)),
      )
      .returning();

    await this.recordAudit(actor, `pti_insight_draft_${nextStatus}`, updated.id, {
      decision: input.decision,
      notes: input.notes ?? null,
      payrollMutated: false,
      wagesInvented: false,
    });

    return this.toDraft(updated);
  }

  async updateSettings(
    actor: PtiActor,
    input: UpdatePtiSettingsRequest,
  ): Promise<PtiSettings> {
    this.assertManageSettings(actor);
    await this.ensureSettings(actor);

    const patch: Partial<typeof ptiSettings.$inferInsert> = {
      inventWagesEnabled: false,
      autoPayrollMutationEnabled: false,
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    };
    if (input.insightsEnabled !== undefined) patch.insightsEnabled = input.insightsEnabled;
    if (input.selfTimesheetViewEnabled !== undefined) {
      patch.selfTimesheetViewEnabled = input.selfTimesheetViewEnabled;
    }
    if (input.standardWeeklyHours !== undefined) {
      patch.standardWeeklyHours = String(input.standardWeeklyHours);
    }
    if (input.overtimeDailyThresholdHours !== undefined) {
      patch.overtimeDailyThresholdHours = String(input.overtimeDailyThresholdHours);
    }
    if (input.notes !== undefined) patch.notes = input.notes;

    const [updated] = await this.db
      .update(ptiSettings)
      .set(patch)
      .where(eq(ptiSettings.companyId, actor.companyId))
      .returning();

    await this.recordAudit(actor, 'pti_settings_updated', updated.id, {
      insightsEnabled: updated.insightsEnabled,
      selfTimesheetViewEnabled: updated.selfTimesheetViewEnabled,
      inventWagesEnabled: false,
      autoPayrollMutationEnabled: false,
    });

    return this.toSettings(updated);
  }

  async createAuraInsight(
    actor: PtiActor,
    input: CreatePtiAuraInsightRequest,
  ): Promise<PtiAuraInsightSummary> {
    this.assertWrite(actor);

    if (input.sourceInsightDraftId) {
      const draft = await this.db.query.ptiInsightDrafts.findFirst({
        where: and(
          eq(ptiInsightDrafts.id, input.sourceInsightDraftId),
          eq(ptiInsightDrafts.companyId, actor.companyId),
        ),
      });
      if (!draft) {
        throw new PayrollTimesheetIntelligenceError('NOT_FOUND', 'Source insight draft not found.');
      }
    }

    const [inserted] = await this.db
      .insert(ptiAuraInsights)
      .values({
        companyId: actor.companyId,
        target: input.target,
        status: 'open',
        title: input.title.trim(),
        insight: input.insight.trim(),
        href: input.href?.trim() || null,
        sourceInsightDraftId: input.sourceInsightDraftId ?? null,
        createdByUserId: actor.userId,
        metadata: { invented: false, hourlyRateCents: null },
      })
      .returning();

    await this.recordAudit(actor, 'pti_aura_insight_created', inserted.id, {
      target: input.target,
    });

    return this.toInsight(inserted);
  }

  async acknowledgeAuraInsight(
    actor: PtiActor,
    insightId: string,
    input: AcknowledgePtiInsightRequest,
  ): Promise<PtiAuraInsightSummary> {
    this.assertWrite(actor);

    const existing = await this.db.query.ptiAuraInsights.findFirst({
      where: and(
        eq(ptiAuraInsights.id, insightId),
        eq(ptiAuraInsights.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new PayrollTimesheetIntelligenceError('NOT_FOUND', 'AURA insight not found.');
    }

    const [updated] = await this.db
      .update(ptiAuraInsights)
      .set({
        status: input.status,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(ptiAuraInsights.id, insightId), eq(ptiAuraInsights.companyId, actor.companyId)),
      )
      .returning();

    await this.recordAudit(actor, `pti_aura_insight_${input.status}`, updated.id, {
      status: input.status,
    });

    return this.toInsight(updated);
  }

  async getSelfTimesheetView(actor: PtiActor): Promise<PtiSelfTimesheetView> {
    if (!canAccessPtiSelfTimesheetView(actor)) {
      throw new PayrollTimesheetIntelligenceError(
        'FORBIDDEN',
        'Self timesheet view is not available for client accounts.',
      );
    }

    const settings = await this.ensureSettings(actor);
    if (!settings.selfTimesheetViewEnabled) {
      throw new PayrollTimesheetIntelligenceError(
        'INVALID_STATE',
        'Self timesheet view is disabled in Payroll & Timesheet Intelligence settings.',
      );
    }

    const user = await this.db.query.users.findFirst({
      where: and(eq(users.id, actor.userId), eq(users.companyId, actor.companyId)),
    });
    if (!user) {
      throw new PayrollTimesheetIntelligenceError('NOT_FOUND', 'User not found.');
    }

    const ownTimesheets = await this.db.query.wiTimesheets.findMany({
      where: and(
        eq(wiTimesheets.companyId, actor.companyId),
        eq(wiTimesheets.userId, actor.userId),
      ),
      orderBy: [desc(wiTimesheets.periodEnd)],
      limit: 50,
    });

    const timesheets = ownTimesheets.map((row) => ({
      id: row.id,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      status: row.status,
      standardHours: parseHours(row.standardHours),
      overtimeHours: parseHours(row.overtimeHours),
      travelHours: parseHours(row.travelHours),
      jobId: row.jobId,
      clockInAt: row.clockInAt?.toISOString() ?? null,
      clockOutAt: row.clockOutAt?.toISOString() ?? null,
    }));

    const summary =
      timesheets.length === 0
        ? 'No timesheet rows for your account yet — hours stay unavailable (not invented).'
        : `Your recorded timesheets: ${timesheets.length} row(s). Payroll and peer timesheets remain hidden.`;

    return {
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      roleName: actor.roleName,
      summary,
      timesheets,
      payrollHidden: true,
      peerTimesheetsHidden: true,
      labourCostHidden: true,
      settings: { selfTimesheetViewEnabled: settings.selfTimesheetViewEnabled },
    };
  }
}
