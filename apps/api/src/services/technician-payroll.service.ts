import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import type {
  TechnicianPayrollInviteSetup,
  TechnicianPayrollProfileSummary,
  TechnicianPayrollTermInput,
  TechnicianPayrollTermSummary,
  TechnicianPeriodWageBreakdown,
} from '@titan/shared';
import {
  PAYROLL_SETUP_INCOMPLETE,
  buildTechnicianPayrollTermSummary,
  canViewTechnicianPayroll,
  computeTechnicianPeriodWages,
  deriveInternalHourlyCostCents,
  isTechnicianPayrollTermComplete,
  normaliseOvertimeRules,
  normaliseWorkingCalendar,
  resolveBlendedOvertimeMultiplier,
  resolveEffectivePayrollTerm,
  technicianPayrollSetupLabel,
  validateTechnicianPayrollTermInput,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { mobileTimeEntries, technicianPayrollTerms, users } from '@titan/db';

export class TechnicianPayrollError extends Error {
  constructor(
    readonly code:
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'VALIDATION_ERROR'
      | 'NOT_TECHNICIAN'
      | 'PAYROLL_SETUP_INCOMPLETE',
    message: string,
  ) {
    super(message);
    this.name = 'TechnicianPayrollError';
  }
}

type ActorScope = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: readonly string[];
};

function toNumber(value: string | number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function rowToSummary(row: typeof technicianPayrollTerms.$inferSelect): TechnicianPayrollTermSummary {
  return buildTechnicianPayrollTermSummary({
    id: row.id,
    userId: row.userId,
    monthlySalaryCents: row.monthlySalaryCents,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    workingDaysPerWeek: toNumber(row.workingDaysPerWeek),
    workingHoursPerDay: toNumber(row.workingHoursPerDay),
    overtimeDailyThresholdHours: toNumber(row.overtimeDailyThresholdHours),
    overtimeMultiplierBps: row.overtimeMultiplierBps,
    payrollReference: row.payrollReference,
    notes: row.notes,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  });
}

export class TechnicianPayrollService {
  constructor(private readonly db: DatabaseClient) {}

  assertCanView(actor: ActorScope) {
    if (!canViewTechnicianPayroll(actor.permissions, actor.roleName)) {
      throw new TechnicianPayrollError(
        'FORBIDDEN',
        'Monthly salary and wage information is restricted to Owner / Finance / Admin',
      );
    }
  }

  async listTermsForUser(actor: ActorScope, userId: string): Promise<TechnicianPayrollProfileSummary> {
    this.assertCanView(actor);
    await this.requireTechnicianInCompany(actor.companyId, userId);

    const rows = await this.db.query.technicianPayrollTerms.findMany({
      where: and(
        eq(technicianPayrollTerms.companyId, actor.companyId),
        eq(technicianPayrollTerms.userId, userId),
      ),
      orderBy: [desc(technicianPayrollTerms.effectiveFrom)],
    });

    const terms = rows.map(rowToSummary);
    const today = new Date().toISOString().slice(0, 10);
    const currentTerm = resolveEffectivePayrollTerm(terms, today);
    const complete = currentTerm
      ? isTechnicianPayrollTermComplete({
          monthlySalaryCents: currentTerm.monthlySalaryCents,
          workingDaysPerWeek: currentTerm.workingDaysPerWeek,
          workingHoursPerDay: currentTerm.workingHoursPerDay,
          effectiveFrom: currentTerm.effectiveFrom,
        })
      : false;

    return {
      userId,
      setupStatus: complete ? 'complete' : 'incomplete',
      setupLabel: technicianPayrollSetupLabel(complete),
      currentTerm: currentTerm && complete ? currentTerm : currentTerm,
      terms,
    };
  }

  async createEffectiveTerm(
    actor: ActorScope,
    userId: string,
    input: TechnicianPayrollTermInput,
  ): Promise<TechnicianPayrollTermSummary> {
    this.assertCanView(actor);
    await this.requireTechnicianInCompany(actor.companyId, userId);

    const validated = validateTechnicianPayrollTermInput(input);
    if (!validated.ok) {
      throw new TechnicianPayrollError(
        validated.message === PAYROLL_SETUP_INCOMPLETE ? 'PAYROLL_SETUP_INCOMPLETE' : 'VALIDATION_ERROR',
        validated.message,
      );
    }
    const setup = validated.value;

    return this.db.transaction(async (tx) => {
      const open = await tx.query.technicianPayrollTerms.findFirst({
        where: and(
          eq(technicianPayrollTerms.companyId, actor.companyId),
          eq(technicianPayrollTerms.userId, userId),
          isNull(technicianPayrollTerms.effectiveTo),
        ),
      });

      if (open) {
        const openFrom = String(open.effectiveFrom).slice(0, 10);
        if (setup.effectiveFrom <= openFrom) {
          throw new TechnicianPayrollError(
            'VALIDATION_ERROR',
            'New salary effective date must be after the current term start',
          );
        }
        const dayBefore = previousDate(setup.effectiveFrom);
        await tx
          .update(technicianPayrollTerms)
          .set({ effectiveTo: dayBefore, updatedAt: new Date() })
          .where(eq(technicianPayrollTerms.id, open.id));
      }

      const [created] = await tx
        .insert(technicianPayrollTerms)
        .values({
          companyId: actor.companyId,
          userId,
          monthlySalaryCents: setup.monthlySalaryCents,
          effectiveFrom: setup.effectiveFrom,
          effectiveTo: null,
          workingDaysPerWeek: String(setup.workingDaysPerWeek),
          workingHoursPerDay: String(setup.workingHoursPerDay),
          overtimeDailyThresholdHours: String(setup.overtimeDailyThresholdHours),
          overtimeMultiplierBps: setup.overtimeMultiplierBps,
          payrollReference: setup.payrollReference ?? null,
          notes: setup.notes ?? null,
          createdByUserId: actor.userId,
          metadata: {
            source: 'owner_payroll_setup',
            salaryIsPayrollExpense: true,
            jobLabourIsAllocationOnly: true,
          },
        })
        .returning();

      if (!created) {
        throw new TechnicianPayrollError('VALIDATION_ERROR', 'Unable to save payroll term');
      }
      return rowToSummary(created);
    });
  }

  /** Apply invite-time payroll draft when a Technician accepts an invite. */
  async applyInvitePayrollSetup(input: {
    companyId: string;
    userId: string;
    createdByUserId: string | null;
    payrollSetup: Record<string, unknown> | null | undefined;
  }): Promise<void> {
    if (!input.payrollSetup || typeof input.payrollSetup !== 'object') return;

    const validated = validateTechnicianPayrollTermInput({
      monthlySalaryCents: Number(input.payrollSetup.monthlySalaryCents),
      effectiveFrom: String(input.payrollSetup.effectiveFrom ?? ''),
      workingDaysPerWeek: Number(input.payrollSetup.workingDaysPerWeek),
      workingHoursPerDay: Number(input.payrollSetup.workingHoursPerDay),
      overtimeDailyThresholdHours: Number(input.payrollSetup.overtimeDailyThresholdHours),
      overtimeMultiplierBps: Number(input.payrollSetup.overtimeMultiplierBps),
      payrollReference:
        typeof input.payrollSetup.payrollReference === 'string'
          ? input.payrollSetup.payrollReference
          : null,
      notes: typeof input.payrollSetup.notes === 'string' ? input.payrollSetup.notes : null,
    });
    if (!validated.ok) return;

    const setup = validated.value;
    await this.db.insert(technicianPayrollTerms).values({
      companyId: input.companyId,
      userId: input.userId,
      monthlySalaryCents: setup.monthlySalaryCents,
      effectiveFrom: setup.effectiveFrom,
      effectiveTo: null,
      workingDaysPerWeek: String(setup.workingDaysPerWeek),
      workingHoursPerDay: String(setup.workingHoursPerDay),
      overtimeDailyThresholdHours: String(setup.overtimeDailyThresholdHours),
      overtimeMultiplierBps: setup.overtimeMultiplierBps,
      payrollReference: setup.payrollReference ?? null,
      notes: setup.notes ?? null,
      createdByUserId: input.createdByUserId,
      metadata: {
        source: 'technician_invite_onboarding',
        salaryIsPayrollExpense: true,
        jobLabourIsAllocationOnly: true,
      },
    });
  }

  /**
   * Resolve derived hourly rate + OT multiplier for locking onto a timer entry.
   * Returns null rate when payroll setup is incomplete — callers must not invent wages.
   */
  async resolveLabourLockForUserAt(input: {
    companyId: string;
    userId: string;
    asOf: Date;
    durationMinutes: number;
  }): Promise<{
    setupComplete: boolean;
    hourlyCostCents: number | null;
    overtimeMultiplier: number;
    internalRateCentsPerHour: number | null;
    payrollTermId: string | null;
    setupLabel: string | null;
  }> {
    const asOf = input.asOf.toISOString().slice(0, 10);
    const rows = await this.db.query.technicianPayrollTerms.findMany({
      where: and(
        eq(technicianPayrollTerms.companyId, input.companyId),
        eq(technicianPayrollTerms.userId, input.userId),
      ),
      orderBy: [desc(technicianPayrollTerms.effectiveFrom)],
    });
    const terms = rows.map(rowToSummary);
    const term = resolveEffectivePayrollTerm(terms, asOf);
    if (
      !term ||
      !isTechnicianPayrollTermComplete({
        monthlySalaryCents: term.monthlySalaryCents,
        workingDaysPerWeek: term.workingDaysPerWeek,
        workingHoursPerDay: term.workingHoursPerDay,
        effectiveFrom: term.effectiveFrom,
      })
    ) {
      return {
        setupComplete: false,
        hourlyCostCents: null,
        overtimeMultiplier: 1,
        internalRateCentsPerHour: null,
        payrollTermId: null,
        setupLabel: PAYROLL_SETUP_INCOMPLETE,
      };
    }

    const calendar = normaliseWorkingCalendar(term);
    const hourly = deriveInternalHourlyCostCents(term.monthlySalaryCents, calendar);
    const overtime = normaliseOvertimeRules({
      dailyThresholdHours: term.overtimeDailyThresholdHours,
      multiplierBps: term.overtimeMultiplierBps,
    });
    const blended = resolveBlendedOvertimeMultiplier({
      durationMinutes: input.durationMinutes,
      dailyThresholdHours: overtime.dailyThresholdHours,
      overtimeMultiplierBps: overtime.multiplierBps,
    });

    return {
      setupComplete: hourly != null,
      hourlyCostCents: hourly,
      overtimeMultiplier: blended,
      internalRateCentsPerHour: hourly,
      payrollTermId: term.id,
      setupLabel: hourly != null ? null : PAYROLL_SETUP_INCOMPLETE,
    };
  }

  async computePeriodWages(
    actor: ActorScope,
    userId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<TechnicianPeriodWageBreakdown> {
    this.assertCanView(actor);
    await this.requireTechnicianInCompany(actor.companyId, userId);

    const profile = await this.listTermsForUser(actor, userId);
    const term = resolveEffectivePayrollTerm(profile.terms, periodEnd.slice(0, 10));

    const start = new Date(`${periodStart.slice(0, 10)}T00:00:00.000Z`);
    const end = new Date(`${periodEnd.slice(0, 10)}T23:59:59.999Z`);
    const entries = await this.db.query.mobileTimeEntries.findMany({
      where: and(
        eq(mobileTimeEntries.companyId, actor.companyId),
        eq(mobileTimeEntries.userId, userId),
        gte(mobileTimeEntries.startedAt, start),
        lte(mobileTimeEntries.startedAt, end),
        or(eq(mobileTimeEntries.entryType, 'job_time'), eq(mobileTimeEntries.entryType, 'travel')),
      ),
      columns: { durationMinutes: true, metadata: true, endedAt: true },
    });

    let workedMinutes = 0;
    let overtimeMinutes = 0;
    for (const entry of entries) {
      if (!entry.endedAt || !entry.durationMinutes || entry.durationMinutes <= 0) continue;
      workedMinutes += entry.durationMinutes;
      const meta = (entry.metadata ?? {}) as Record<string, unknown>;
      if (typeof meta.overtimeMinutes === 'number' && meta.overtimeMinutes > 0) {
        overtimeMinutes += Math.round(meta.overtimeMinutes);
      }
    }

    return computeTechnicianPeriodWages({
      term: term
        ? {
            monthlySalaryCents: term.monthlySalaryCents,
            workingDaysPerWeek: term.workingDaysPerWeek,
            workingHoursPerDay: term.workingHoursPerDay,
            overtimeDailyThresholdHours: term.overtimeDailyThresholdHours,
            overtimeMultiplierBps: term.overtimeMultiplierBps,
          }
        : null,
      periodStart: periodStart.slice(0, 10),
      periodEnd: periodEnd.slice(0, 10),
      workedMinutes,
      overtimeMinutes: overtimeMinutes > 0 ? overtimeMinutes : undefined,
    });
  }

  async getMemberPayrollBrief(
    companyId: string,
    userId: string,
  ): Promise<NonNullable<import('@titan/shared').TeamMember['payroll']>> {
    const rows = await this.db.query.technicianPayrollTerms.findMany({
      where: and(
        eq(technicianPayrollTerms.companyId, companyId),
        eq(technicianPayrollTerms.userId, userId),
      ),
      orderBy: [desc(technicianPayrollTerms.effectiveFrom)],
    });
    const terms = rows.map(rowToSummary);
    const today = new Date().toISOString().slice(0, 10);
    const current = resolveEffectivePayrollTerm(terms, today);
    const complete = current
      ? isTechnicianPayrollTermComplete({
          monthlySalaryCents: current.monthlySalaryCents,
          workingDaysPerWeek: current.workingDaysPerWeek,
          workingHoursPerDay: current.workingHoursPerDay,
          effectiveFrom: current.effectiveFrom,
        })
      : false;
    return {
      setupStatus: complete ? 'complete' : 'incomplete',
      setupLabel: technicianPayrollSetupLabel(complete),
      currentMonthlySalaryCents: complete ? current!.monthlySalaryCents : null,
      derivedHourlyCostCents: complete ? current!.derivedHourlyCostCents : null,
      effectiveFrom: current?.effectiveFrom ?? null,
    };
  }

  parseInvitePayrollSetup(
    raw: TechnicianPayrollInviteSetup | TechnicianPayrollTermInput | null | undefined,
  ): TechnicianPayrollInviteSetup | null {
    if (!raw) return null;
    const validated = validateTechnicianPayrollTermInput(raw);
    if (!validated.ok) {
      throw new TechnicianPayrollError(
        validated.message === PAYROLL_SETUP_INCOMPLETE ? 'PAYROLL_SETUP_INCOMPLETE' : 'VALIDATION_ERROR',
        validated.message,
      );
    }
    return validated.value;
  }

  private async requireTechnicianInCompany(companyId: string, userId: string) {
    const user = await this.db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.companyId, companyId)),
      with: { role: true },
    });
    if (!user) {
      throw new TechnicianPayrollError('NOT_FOUND', 'Team member not found');
    }
    if (user.role?.name !== 'Technician') {
      throw new TechnicianPayrollError(
        'NOT_TECHNICIAN',
        'Monthly salary payroll setup applies to Technician accounts',
      );
    }
    return user;
  }
}

function previousDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
