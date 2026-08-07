import { and, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  companies,
  completionReports,
  jobWorkflowEvents,
  jobs,
  mobileJobDocumentation,
  mobileJobInventoryUsage,
  mobileTimeEntries,
  opsMaintenanceRuns,
  ptiSettings,
  qualityComebacks,
  roles,
  users,
  wiTimesheets,
  wiWorkforceProfiles,
} from '@titan/db';
import {
  computeCompletionHoursFromEvents,
  formatPercentMetric,
  parseHours,
  resolveCompanyLocale,
  type WorkforceReportPeriod,
  WORKFORCE_REPORT_LIMITATIONS,
  workforceMetric,
  resolveTechnicianPublicReference,
  buildTimesheetDailyRows,
  defaultOvertimePolicyNote,
  summarizeTimesheetRows,
  type TechnicianActivityReportContext,
  type TechnicianProductivityReportContext,
  type TechnicianTimesheetReportContext,
  type WorkforceOperationsReportContext,
  type WorkforceReportKind,
} from '@titan/shared';

export class WorkforceReportDataError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'VALIDATION_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'WorkforceReportDataError';
  }
}

function displayName(firstName: string, lastName: string, email?: string): string {
  const name = `${firstName} ${lastName}`.trim();
  return name || email || 'Technician';
}

function reportRef(kind: WorkforceReportKind, suffix: string): string {
  const prefix =
    kind === 'technician_activity'
      ? 'TAR'
      : kind === 'technician_timesheet'
        ? 'TTS'
        : kind === 'technician_productivity'
          ? 'TPR'
          : 'WOS';
  return `${prefix}-${suffix}`;
}

export class WorkforceReportDataService {
  constructor(private readonly db: DatabaseClient) {}

  private async loadCompany(companyId: string) {
    const company = await this.db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });
    if (!company) throw new WorkforceReportDataError('NOT_FOUND', 'Company not found');
    return company;
  }

  private async loadTechnician(companyId: string, userId: string) {
    const row = await this.db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        roleName: roles.name,
        employeeNumber: wiWorkforceProfiles.employeeNumber,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .leftJoin(wiWorkforceProfiles, eq(wiWorkforceProfiles.userId, users.id))
      .where(and(eq(users.companyId, companyId), eq(users.id, userId), eq(users.isActive, true)))
      .limit(1);

    const tech = row[0];
    if (!tech) throw new WorkforceReportDataError('NOT_FOUND', 'Technician not found in this tenant');
    return tech;
  }

  private async loadTechnicians(companyId: string) {
    return this.db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        employeeNumber: wiWorkforceProfiles.employeeNumber,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .leftJoin(wiWorkforceProfiles, eq(wiWorkforceProfiles.userId, users.id))
      .where(and(eq(users.companyId, companyId), eq(users.isActive, true), eq(roles.name, 'Technician')));
  }

  private async loadJobsForTechnician(
    companyId: string,
    technicianId: string,
    period: WorkforceReportPeriod,
  ) {
    return this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        eq(jobs.assignedUserId, technicianId),
        or(
          and(gte(jobs.createdAt, period.fromInstant), lte(jobs.createdAt, period.toInstant)),
          and(gte(jobs.scheduledAt, period.fromInstant), lte(jobs.scheduledAt, period.toInstant)),
          and(gte(jobs.updatedAt, period.fromInstant), lte(jobs.updatedAt, period.toInstant)),
        ),
      ),
    });
  }

  private async loadJobsForCompany(companyId: string, period: WorkforceReportPeriod) {
    return this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        or(
          and(gte(jobs.createdAt, period.fromInstant), lte(jobs.createdAt, period.toInstant)),
          and(gte(jobs.scheduledAt, period.fromInstant), lte(jobs.scheduledAt, period.toInstant)),
          and(gte(jobs.updatedAt, period.fromInstant), lte(jobs.updatedAt, period.toInstant)),
        ),
      ),
    });
  }

  private async loadWorkflowEvents(companyId: string, jobIds: string[]) {
    if (!jobIds.length) return [];
    return this.db
      .select()
      .from(jobWorkflowEvents)
      .where(and(eq(jobWorkflowEvents.companyId, companyId), inArray(jobWorkflowEvents.jobId, jobIds)));
  }

  private async loadTimesheets(
    companyId: string,
    period: WorkforceReportPeriod,
    userId?: string,
  ) {
    const conditions = [
      eq(wiTimesheets.companyId, companyId),
      lte(wiTimesheets.periodStart, period.periodEnd),
      gte(wiTimesheets.periodEnd, period.periodStart),
    ];
    if (userId) conditions.push(eq(wiTimesheets.userId, userId));

    const rows = await this.db.select().from(wiTimesheets).where(and(...conditions));
    const jobIds = rows.map((r) => r.jobId).filter((id): id is string => Boolean(id));
    const jobNumbers = new Map<string, string | null>();
    if (jobIds.length) {
      const jobRows = await this.db
        .select({ id: jobs.id, jobNumber: jobs.jobNumber })
        .from(jobs)
        .where(and(eq(jobs.companyId, companyId), inArray(jobs.id, jobIds)));
      for (const j of jobRows) jobNumbers.set(j.id, j.jobNumber);
    }

    return rows.map((r) => ({
      ...r,
      jobNumber: r.jobId ? (jobNumbers.get(r.jobId) ?? null) : null,
    }));
  }

  private async loadMobileEntries(
    companyId: string,
    period: WorkforceReportPeriod,
    userId?: string,
  ) {
    const conditions = [
      eq(mobileTimeEntries.companyId, companyId),
      gte(mobileTimeEntries.startedAt, period.fromInstant),
      lte(mobileTimeEntries.startedAt, period.toInstant),
    ];
    if (userId) conditions.push(eq(mobileTimeEntries.userId, userId));

    const rows = await this.db.select().from(mobileTimeEntries).where(and(...conditions));
    const jobIds = rows.map((r) => r.jobId).filter((id): id is string => Boolean(id));
    const jobNumbers = new Map<string, string | null>();
    if (jobIds.length) {
      const jobRows = await this.db
        .select({ id: jobs.id, jobNumber: jobs.jobNumber })
        .from(jobs)
        .where(and(eq(jobs.companyId, companyId), inArray(jobs.id, jobIds)));
      for (const j of jobRows) jobNumbers.set(j.id, j.jobNumber);
    }

    return rows.map((r) => ({
      entryType: r.entryType,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      durationMinutes: r.durationMinutes,
      jobNumber: r.jobId ? (jobNumbers.get(r.jobId) ?? null) : null,
    }));
  }

  private async loadOvertimePolicy(companyId: string) {
    const row = await this.db.query.ptiSettings.findFirst({
      where: eq(ptiSettings.companyId, companyId),
    });
    if (!row) {
      return {
        configured: false,
        standardWeeklyHours: null,
        overtimeDailyThresholdHours: null,
        note: 'Overtime rules are not configured — recorded hours only.',
      };
    }
    return {
      configured: true,
      standardWeeklyHours: parseHours(row.standardWeeklyHours),
      overtimeDailyThresholdHours: parseHours(row.overtimeDailyThresholdHours),
      note: 'Tenant PTI settings loaded.',
    };
  }

  private baseHeader(
    kind: WorkforceReportKind,
    companyName: string,
    period: WorkforceReportPeriod,
    technician?: { reference: string; name: string } | null,
  ) {
    const suffix = period.periodStart.replace(/-/g, '');
    return {
      reportReference: reportRef(kind, suffix),
      reportKind: kind,
      companyName,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      timezone: period.timezone,
      generatedAt: new Date().toISOString(),
      technicianReference: technician?.reference ?? null,
      technicianName: technician?.name ?? null,
      dataLimitations: [...WORKFORCE_REPORT_LIMITATIONS],
    };
  }

  async buildTechnicianActivityReport(
    companyId: string,
    technicianId: string,
    period: WorkforceReportPeriod,
  ): Promise<TechnicianActivityReportContext> {
    const company = await this.loadCompany(companyId);
    const locale = resolveCompanyLocale(company.preferences as never);
    const tech = await this.loadTechnician(companyId, technicianId);
    const techRef = resolveTechnicianPublicReference({
      employeeNumber: tech.employeeNumber,
      firstName: tech.firstName,
      lastName: tech.lastName,
    });
    const techName = displayName(tech.firstName, tech.lastName, tech.email);

    const jobRows = await this.loadJobsForTechnician(companyId, technicianId, period);
    const jobIds = jobRows.map((j) => j.id);
    const events = await this.loadWorkflowEvents(companyId, jobIds);
    const eventsByJob = new Map<string, typeof events>();
    for (const e of events) {
      const list = eventsByJob.get(e.jobId) ?? [];
      list.push(e);
      eventsByJob.set(e.jobId, list);
    }

    const assigned = jobRows.length;
    const completed = jobRows.filter((j) => j.status === 'completed').length;
    const cancelled = jobRows.filter((j) => j.status === 'cancelled').length;
    const open = jobRows.filter(
      (j) => j.status !== 'completed' && j.status !== 'cancelled',
    ).length;

    let started = 0;
    for (const job of jobRows) {
      const evts = eventsByJob.get(job.id) ?? [];
      if (evts.some((e) => e.toPhase === 'in_progress' || e.action === 'start_work')) started += 1;
      else if (job.executionPhase === 'in_progress') started += 1;
    }

    const statusMap = new Map<string, number>();
    for (const job of jobRows) {
      statusMap.set(job.status, (statusMap.get(job.status) ?? 0) + 1);
    }

    const [maintenanceCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(opsMaintenanceRuns)
      .where(
        and(
          eq(opsMaintenanceRuns.companyId, companyId),
          eq(opsMaintenanceRuns.createdByUserId, technicianId),
          gte(opsMaintenanceRuns.completedAt, period.fromInstant),
          lte(opsMaintenanceRuns.completedAt, period.toInstant),
        ),
      );

    const [completionReportCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(completionReports)
      .where(
        and(
          eq(completionReports.companyId, companyId),
          eq(completionReports.createdByUserId, technicianId),
          gte(completionReports.createdAt, period.fromInstant),
          lte(completionReports.createdAt, period.toInstant),
        ),
      );

    const [photoCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(mobileJobDocumentation)
      .where(
        and(
          eq(mobileJobDocumentation.companyId, companyId),
          eq(mobileJobDocumentation.userId, technicianId),
          gte(mobileJobDocumentation.createdAt, period.fromInstant),
          lte(mobileJobDocumentation.createdAt, period.toInstant),
        ),
      );

    const [materialCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(mobileJobInventoryUsage)
      .where(
        and(
          eq(mobileJobInventoryUsage.companyId, companyId),
          eq(mobileJobInventoryUsage.userId, technicianId),
          gte(mobileJobInventoryUsage.createdAt, period.fromInstant),
          lte(mobileJobInventoryUsage.createdAt, period.toInstant),
        ),
      );

    const callbackRows = await this.db
      .select({ id: qualityComebacks.id, type: qualityComebacks.comebackType })
      .from(qualityComebacks)
      .where(
        and(
          eq(qualityComebacks.companyId, companyId),
          eq(qualityComebacks.originalTechnicianId, technicianId),
          gte(qualityComebacks.createdAt, period.fromInstant),
          lte(qualityComebacks.createdAt, period.toInstant),
        ),
      );

    const callbacks = callbackRows.filter((r) => r.type === 'callback').length;
    const rework = callbackRows.filter((r) => r.type !== 'callback').length;

    const timesheets = await this.loadTimesheets(companyId, period, technicianId);
    let workingHours = 0;
    let breakHours = 0;
    for (const ts of timesheets) {
      workingHours +=
        parseHours(ts.standardHours) + parseHours(ts.overtimeHours) + parseHours(ts.travelHours);
      breakHours += parseHours(ts.breakHours);
    }

    const serviceVisits = jobRows.filter(
      (j) => j.jobType === 'service' && j.status === 'completed',
    ).length;

    const dataQualityNotes: string[] = [];
    if (!timesheets.length) {
      dataQualityNotes.push('No wi_timesheets rows in period — working hours from mobile entries may be incomplete.');
    }
    if (!events.length) {
      dataQualityNotes.push('No job_workflow_events recorded — started jobs rely on execution_phase only.');
    }

    const scheduledJobs = jobRows
      .filter((j) => j.status !== 'completed' && j.status !== 'cancelled')
      .slice(0, 50)
      .map((j) => ({
        jobNumber: j.jobNumber,
        title: j.title,
        scheduledAt: j.scheduledAt?.toISOString() ?? null,
        status: j.status,
      }));

    return {
      ...this.baseHeader('technician_activity', company.name, { ...period, timezone: locale.timezone }, {
        reference: techRef,
        name: techName,
      }),
      reportKind: 'technician_activity',
      technicianReference: techRef,
      technicianName: techName,
      jobsAssigned: workforceMetric('Jobs assigned', {
        value: assigned,
        inclusionRule: 'Jobs assigned to technician with activity timestamps in period',
        state: assigned === 0 ? 'measured_zero' : 'recorded',
      }),
      jobsStarted: workforceMetric('Jobs started', {
        value: started,
        inclusionRule: 'Jobs with in_progress workflow event or execution_phase in period',
        note: events.length ? null : 'Not available from current recorded data — no workflow events.',
        state: events.length ? (started === 0 ? 'measured_zero' : 'recorded') : 'unavailable',
      }),
      jobsCompleted: workforceMetric('Jobs completed', {
        value: completed,
        inclusionRule: 'jobs.status = completed in period window',
        state: completed === 0 ? 'measured_zero' : 'recorded',
      }),
      jobsOpen: workforceMetric('Jobs still open', {
        value: open,
        inclusionRule: 'Assigned jobs not completed or cancelled',
        state: open === 0 ? 'measured_zero' : 'recorded',
      }),
      jobsCancelled: workforceMetric('Cancelled jobs', {
        value: cancelled,
        inclusionRule: 'jobs.status = cancelled',
        state: cancelled === 0 ? 'measured_zero' : 'recorded',
      }),
      statusBreakdown: [...statusMap.entries()].map(([status, count]) => ({ status, count })),
      serviceVisits: workforceMetric('Service visits completed', {
        value: serviceVisits,
        inclusionRule: 'Completed jobs with jobType service',
        state: serviceVisits === 0 ? 'measured_zero' : 'recorded',
      }),
      maintenanceVisits: workforceMetric('Maintenance visits', {
        value: maintenanceCountRow?.count ?? 0,
        inclusionRule: 'ops_maintenance_runs created by technician in period',
        state: (maintenanceCountRow?.count ?? 0) === 0 ? 'measured_zero' : 'recorded',
      }),
      completionReportsSubmitted: workforceMetric('Completion reports submitted', {
        value: completionReportCountRow?.count ?? 0,
        inclusionRule: 'completion_reports.created_by_user_id in period',
        state: (completionReportCountRow?.count ?? 0) === 0 ? 'measured_zero' : 'recorded',
      }),
      photosEvidenceSubmitted: workforceMetric('Photos / evidence submitted', {
        value: photoCountRow?.count ?? 0,
        inclusionRule: 'mobile_job_documentation rows in period',
        state: (photoCountRow?.count ?? 0) === 0 ? 'measured_zero' : 'recorded',
      }),
      checklistsCompleted: workforceMetric('Checklists completed', {
        value: null,
        state: 'unavailable',
        inclusionRule: 'Structured checklist completion tracking not connected',
        note: 'Not available from current recorded data.',
      }),
      materialsRecorded: workforceMetric('Materials recorded (no cost)', {
        value: materialCountRow?.count ?? 0,
        inclusionRule: 'mobile_job_inventory_usage rows — quantities only, no unit cost',
        state: (materialCountRow?.count ?? 0) === 0 ? 'measured_zero' : 'recorded',
      }),
      callbacks: workforceMetric('Callbacks', {
        value: callbacks,
        inclusionRule: 'quality_comebacks.comeback_type = callback',
        state: callbacks === 0 ? 'measured_zero' : 'recorded',
      }),
      reworkVisits: workforceMetric('Rework / revisit', {
        value: rework,
        inclusionRule: 'quality_comebacks non-callback types',
        state: rework === 0 ? 'measured_zero' : 'recorded',
      }),
      recordedWorkingHours: workforceMetric('Recorded working hours', {
        value: timesheets.length ? Math.round(workingHours * 100) / 100 : null,
        unit: 'h',
        inclusionRule: 'Sum of wi_timesheets standard + overtime + travel hours',
        state: timesheets.length ? (workingHours === 0 ? 'measured_zero' : 'recorded') : 'not_recorded',
        note: timesheets.length ? null : 'No valid time entries recorded.',
      }),
      recordedBreakHours: workforceMetric('Recorded break hours', {
        value: timesheets.length ? Math.round(breakHours * 100) / 100 : null,
        unit: 'h',
        inclusionRule: 'wi_timesheets.break_hours',
        state: timesheets.length ? (breakHours === 0 ? 'measured_zero' : 'recorded') : 'not_recorded',
      }),
      scheduledJobs,
      dataQualityNotes,
    };
  }

  async buildTechnicianTimesheetReport(
    companyId: string,
    technicianId: string,
    period: WorkforceReportPeriod,
  ): Promise<TechnicianTimesheetReportContext> {
    const company = await this.loadCompany(companyId);
    const locale = resolveCompanyLocale(company.preferences as never);
    const tech = await this.loadTechnician(companyId, technicianId);
    const techRef = resolveTechnicianPublicReference({
      employeeNumber: tech.employeeNumber,
      firstName: tech.firstName,
      lastName: tech.lastName,
    });
    const techName = displayName(tech.firstName, tech.lastName, tech.email);

    const policy = await this.loadOvertimePolicy(companyId);
    const timesheets = await this.loadTimesheets(companyId, period, technicianId);
    const mobileEntries = await this.loadMobileEntries(companyId, period, technicianId);

    const dailyRows = buildTimesheetDailyRows({
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      timesheets: timesheets.map((ts) => ({
        periodStart: String(ts.periodStart),
        periodEnd: String(ts.periodEnd),
        status: ts.status,
        standardHours: ts.standardHours,
        overtimeHours: ts.overtimeHours,
        travelHours: ts.travelHours,
        breakHours: ts.breakHours,
        clockInAt: ts.clockInAt,
        clockOutAt: ts.clockOutAt,
        jobNumber: ts.jobNumber,
      })),
      mobileEntries,
      policy,
    });

    const totals = summarizeTimesheetRows(dailyRows);
    const approved = timesheets.filter((t) => t.status === 'approved').length;
    const submitted = timesheets.filter((t) => t.status === 'submitted').length;

    return {
      ...this.baseHeader('technician_timesheet', company.name, { ...period, timezone: locale.timezone }, {
        reference: techRef,
        name: techName,
      }),
      reportKind: 'technician_timesheet',
      technicianReference: techRef,
      technicianName: techName,
      dailyRows,
      totals,
      overtimePolicyNote: defaultOvertimePolicyNote(policy),
      approvalStatusNote:
        timesheets.length > 0
          ? `${approved} approved, ${submitted} submitted, ${timesheets.length} total timesheet rows in period.`
          : 'No timesheet rows in period.',
      technicianAcknowledgment: null,
      supervisorApproval:
        approved > 0 ? `${approved} timesheet row(s) approved in period.` : null,
    };
  }

  async buildTechnicianProductivityReport(
    companyId: string,
    technicianId: string,
    period: WorkforceReportPeriod,
  ): Promise<TechnicianProductivityReportContext> {
    const activity = await this.buildTechnicianActivityReport(companyId, technicianId, period);
    const jobRows = await this.loadJobsForTechnician(companyId, technicianId, period);
    const jobIds = jobRows.map((j) => j.id);
    const events = await this.loadWorkflowEvents(companyId, jobIds);

    const completionDurations: number[] = [];
    for (const job of jobRows.filter((j) => j.status === 'completed')) {
      const evts = events.filter((e) => e.jobId === job.id);
      const hours = computeCompletionHoursFromEvents(
        evts.map((e) => ({ toPhase: e.toPhase, createdAt: e.createdAt })),
      );
      if (hours != null) completionDurations.push(hours);
    }

    const avgCompletion =
      completionDurations.length > 0
        ? Math.round(
            (completionDurations.reduce((a, b) => a + b, 0) / completionDurations.length) * 100,
          ) / 100
        : null;

    const assigned = activity.jobsAssigned.numerator ?? 0;
    const completed = activity.jobsCompleted.numerator ?? 0;

    const metrics = [
      activity.jobsAssigned,
      activity.jobsCompleted,
      formatPercentMetric(
        'Completion percentage',
        completed,
        assigned,
        'completed / assigned jobs in period',
      ),
      activity.jobsOpen,
      activity.jobsCancelled,
      activity.recordedWorkingHours,
      workforceMetric('Completed jobs per recorded workday', {
        value:
          activity.recordedWorkingHours.numerator != null && activity.recordedWorkingHours.numerator > 0
            ? Math.round((completed / Math.max(1, activity.recordedWorkingHours.numerator / 8)) * 100) / 100
            : null,
        numerator: completed,
        denominator:
          activity.recordedWorkingHours.numerator != null
            ? Math.round((activity.recordedWorkingHours.numerator / 8) * 10) / 10
            : null,
        state:
          activity.recordedWorkingHours.numerator != null && activity.recordedWorkingHours.numerator > 0
            ? 'recorded'
            : 'insufficient_data',
        inclusionRule: 'completed jobs / estimated workdays from recorded hours',
        note: 'Workday estimate uses 8h divisor when hours recorded — not attendance tracking.',
      }),
      activity.completionReportsSubmitted,
      workforceMetric('Checklist completion percentage', {
        value: null,
        state: 'unavailable',
        inclusionRule: 'Structured checklist tracking not connected',
      }),
      activity.photosEvidenceSubmitted,
      activity.callbacks,
      activity.reworkVisits,
      activity.serviceVisits,
      activity.maintenanceVisits,
      workforceMetric('Average recorded job duration (hours)', {
        value: avgCompletion,
        numerator: completionDurations.length,
        denominator: jobRows.filter((j) => j.status === 'completed').length,
        unit: 'h',
        state:
          completionDurations.length > 0
            ? 'recorded'
            : events.length
              ? 'insufficient_data'
              : 'unavailable',
        inclusionRule: 'Mean of workflow-derived completion hours for completed jobs',
        note:
          completionDurations.length === 0
            ? 'Not available from current recorded data — requires valid start/end workflow events.'
            : null,
      }),
    ];

    return {
      ...this.baseHeader('technician_productivity', activity.companyName, period, {
        reference: activity.technicianReference,
        name: activity.technicianName,
      }),
      reportKind: 'technician_productivity',
      technicianReference: activity.technicianReference,
      technicianName: activity.technicianName,
      metrics,
      honestyNotes: [
        'No weighted scores, rankings or behavioural ratings are included.',
        'Completion percentage = jobs completed ÷ jobs assigned in period.',
        'Average job duration uses job_workflow_events only — not created/updated timestamps.',
        ...activity.dataQualityNotes,
      ],
    };
  }

  async buildWorkforceOperationsReport(
    companyId: string,
    period: WorkforceReportPeriod,
  ): Promise<WorkforceOperationsReportContext> {
    const company = await this.loadCompany(companyId);
    const locale = resolveCompanyLocale(company.preferences as never);
    const technicians = await this.loadTechnicians(companyId);
    const jobRows = await this.loadJobsForCompany(companyId, period);

    const assigned = jobRows.length;
    const completed = jobRows.filter((j) => j.status === 'completed').length;
    const open = jobRows.filter((j) => j.status !== 'completed' && j.status !== 'cancelled').length;
    const cancelled = jobRows.filter((j) => j.status === 'cancelled').length;

    const timesheets = await this.loadTimesheets(companyId, period);
    let totalWorking = 0;
    let totalOvertime = 0;
    for (const ts of timesheets) {
      totalWorking +=
        parseHours(ts.standardHours) + parseHours(ts.travelHours) + parseHours(ts.overtimeHours);
      totalOvertime += parseHours(ts.overtimeHours);
    }

    const [completionReportsCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(completionReports)
      .where(
        and(
          eq(completionReports.companyId, companyId),
          gte(completionReports.createdAt, period.fromInstant),
          lte(completionReports.createdAt, period.toInstant),
        ),
      );

    const [maintenanceCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(opsMaintenanceRuns)
      .where(
        and(
          eq(opsMaintenanceRuns.companyId, companyId),
          gte(opsMaintenanceRuns.completedAt, period.fromInstant),
          lte(opsMaintenanceRuns.completedAt, period.toInstant),
        ),
      );

    const callbackRows = await this.db
      .select({ type: qualityComebacks.comebackType })
      .from(qualityComebacks)
      .where(
        and(
          eq(qualityComebacks.companyId, companyId),
          gte(qualityComebacks.createdAt, period.fromInstant),
          lte(qualityComebacks.createdAt, period.toInstant),
        ),
      );

    const workloadByTechnician = await Promise.all(
      technicians.map(async (tech) => {
        const techJobs = jobRows.filter((j) => j.assignedUserId === tech.id);
        const techTimesheets = timesheets.filter((t) => t.userId === tech.id);
        let hours: number | null = null;
        let ot: number | null = null;
        if (techTimesheets.length) {
          hours = 0;
          ot = 0;
          for (const ts of techTimesheets) {
            hours += parseHours(ts.standardHours) + parseHours(ts.travelHours) + parseHours(ts.overtimeHours);
            ot += parseHours(ts.overtimeHours);
          }
          hours = Math.round(hours * 100) / 100;
          ot = Math.round(ot * 100) / 100;
        }
        const cb = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(qualityComebacks)
          .where(
            and(
              eq(qualityComebacks.companyId, companyId),
              eq(qualityComebacks.originalTechnicianId, tech.id),
              gte(qualityComebacks.createdAt, period.fromInstant),
              lte(qualityComebacks.createdAt, period.toInstant),
              eq(qualityComebacks.comebackType, 'callback'),
            ),
          );
        return {
          technicianReference: resolveTechnicianPublicReference({
            employeeNumber: tech.employeeNumber,
            firstName: tech.firstName,
            lastName: tech.lastName,
          }),
          technicianName: displayName(tech.firstName, tech.lastName, tech.email),
          jobsAssigned: techJobs.length,
          jobsCompleted: techJobs.filter((j) => j.status === 'completed').length,
          openJobs: techJobs.filter((j) => j.status !== 'completed' && j.status !== 'cancelled').length,
          recordedHours: hours,
          overtimeHours: ot,
          callbacks: cb[0]?.count ?? 0,
        };
      }),
    );

    const jobsWithCompletion = new Set(
      (
        await this.db
          .select({ jobId: completionReports.jobId })
          .from(completionReports)
          .where(eq(completionReports.companyId, companyId))
      ).map((r) => r.jobId),
    );
    const completedWithoutReport = jobRows.filter(
      (j) => j.status === 'completed' && !jobsWithCompletion.has(j.id),
    ).length;

    const [docCount] = await this.db
      .select({ count: sql<number>`count(distinct ${mobileJobDocumentation.jobId})::int` })
      .from(mobileJobDocumentation)
      .where(eq(mobileJobDocumentation.companyId, companyId));

    const jobsWithEvidence = docCount?.count ?? 0;
    const completedJobs = jobRows.filter((j) => j.status === 'completed').length;
    const lackingEvidence = Math.max(0, completedJobs - jobsWithEvidence);

    const dailyRowsAll = buildTimesheetDailyRows({
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      timesheets: timesheets.map((ts) => ({
        periodStart: String(ts.periodStart),
        periodEnd: String(ts.periodEnd),
        status: ts.status,
        standardHours: ts.standardHours,
        overtimeHours: ts.overtimeHours,
        travelHours: ts.travelHours,
        breakHours: ts.breakHours,
        clockInAt: ts.clockInAt,
        clockOutAt: ts.clockOutAt,
        jobNumber: ts.jobNumber,
      })),
      mobileEntries: [],
      policy: await this.loadOvertimePolicy(companyId),
    });
    const tsSummary = summarizeTimesheetRows(dailyRowsAll);

    const operationalWarnings: string[] = [];
    if (!timesheets.length) operationalWarnings.push('No wi_timesheets rows company-wide in period.');
    if (completedWithoutReport > 0) {
      operationalWarnings.push(`${completedWithoutReport} completed job(s) without a completion report.`);
    }

    return {
      ...this.baseHeader('workforce_operations', company.name, { ...period, timezone: locale.timezone }),
      reportKind: 'workforce_operations',
      activeTechnicians: workforceMetric('Active technicians', {
        value: technicians.length,
        inclusionRule: 'Active users with Technician role',
        state: technicians.length === 0 ? 'measured_zero' : 'recorded',
      }),
      assignedJobs: workforceMetric('Assigned jobs', {
        value: assigned,
        inclusionRule: 'Jobs with activity in period',
        state: assigned === 0 ? 'measured_zero' : 'recorded',
      }),
      completedJobs: workforceMetric('Completed jobs', {
        value: completed,
        inclusionRule: 'jobs.status = completed',
        state: completed === 0 ? 'measured_zero' : 'recorded',
      }),
      openJobs: workforceMetric('Open jobs', {
        value: open,
        inclusionRule: 'Not completed or cancelled',
        state: open === 0 ? 'measured_zero' : 'recorded',
      }),
      cancelledJobs: workforceMetric('Cancelled jobs', {
        value: cancelled,
        inclusionRule: 'jobs.status = cancelled',
        state: cancelled === 0 ? 'measured_zero' : 'recorded',
      }),
      totalRecordedWorkingHours: workforceMetric('Total recorded working hours', {
        value: timesheets.length ? Math.round(totalWorking * 100) / 100 : null,
        unit: 'h',
        inclusionRule: 'Sum of wi_timesheets hours company-wide',
        state: timesheets.length ? 'recorded' : 'not_recorded',
      }),
      totalRecordedOvertimeHours: workforceMetric('Total recorded overtime hours', {
        value: timesheets.length ? Math.round(totalOvertime * 100) / 100 : null,
        unit: 'h',
        inclusionRule: 'Sum of wi_timesheets.overtime_hours',
        state: timesheets.length ? 'recorded' : 'not_recorded',
        note: (await this.loadOvertimePolicy(companyId)).configured
          ? null
          : 'Overtime classification unavailable — rules not configured.',
      }),
      completionReportsSubmitted: workforceMetric('Completion reports submitted', {
        value: completionReportsCount?.count ?? 0,
        inclusionRule: 'completion_reports in period',
        state: (completionReportsCount?.count ?? 0) === 0 ? 'measured_zero' : 'recorded',
      }),
      serviceVisits: workforceMetric('Service visits completed', {
        value: jobRows.filter((j) => j.jobType === 'service' && j.status === 'completed').length,
        inclusionRule: 'Completed service-type jobs',
        state: 'recorded',
      }),
      maintenanceVisits: workforceMetric('Maintenance visits', {
        value: maintenanceCount?.count ?? 0,
        inclusionRule: 'ops_maintenance_runs in period',
        state: (maintenanceCount?.count ?? 0) === 0 ? 'measured_zero' : 'recorded',
      }),
      explicitCallbacks: workforceMetric('Explicit callbacks', {
        value: callbackRows.filter((r) => r.type === 'callback').length,
        inclusionRule: 'quality_comebacks comeback_type=callback',
        state: 'recorded',
      }),
      explicitRework: workforceMetric('Explicit rework / revisit', {
        value: callbackRows.filter((r) => r.type !== 'callback').length,
        inclusionRule: 'quality_comebacks non-callback',
        state: 'recorded',
      }),
      missingTimesheetEntries: workforceMetric('Missing timesheet days', {
        value: tsSummary.missingEntries,
        inclusionRule: 'Calendar days in period without wi_timesheets or mobile entries',
        state: 'recorded',
      }),
      jobsLackingEvidence: workforceMetric('Completed jobs lacking evidence', {
        value: lackingEvidence,
        inclusionRule: 'Completed jobs without mobile_job_documentation',
        state: lackingEvidence === 0 ? 'measured_zero' : 'recorded',
      }),
      jobsLackingCompletionReports: workforceMetric('Completed jobs lacking completion report', {
        value: completedWithoutReport,
        inclusionRule: 'Completed jobs without completion_reports row',
        state: completedWithoutReport === 0 ? 'measured_zero' : 'recorded',
      }),
      workloadByTechnician,
      operationalWarnings,
    };
  }
}
