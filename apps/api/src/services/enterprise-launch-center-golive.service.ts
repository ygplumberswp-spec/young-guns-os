import { and, eq } from 'drizzle-orm';
import type {
  ApproveLncGoLiveWizardRequest,
  CreateLncGoLiveWizardRequest,
  LncGoLiveWizardSummary,
  LncRollbackPlanLinkSummary,
  LncWizardStatus,
  LncWizardStepStatus,
  UpdateLncGoLiveWizardStepRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { lncGoLiveWizardSteps, lncGoLiveWizards, lncRollbackPlanLinks } from '@titan/db';
import type { EnterpriseBusinessContinuityService } from './enterprise-business-continuity.service.js';

type StaffScope = { companyId: string; userId: string };

const WIZARD_STEPS = [
  { stepKey: 'readiness_scan', stepName: 'Readiness scan', stepOrder: 1 },
  { stepKey: 'integration_verification', stepName: 'Integration verification', stepOrder: 2 },
  { stepKey: 'security_verification', stepName: 'Security verification', stepOrder: 3 },
  { stepKey: 'backup_verification', stepName: 'Backup verification', stepOrder: 4 },
  { stepKey: 'user_verification', stepName: 'User verification', stepOrder: 5 },
  { stepKey: 'final_approval', stepName: 'Final approval', stepOrder: 6 },
  { stepKey: 'deployment_confirmation', stepName: 'Deployment confirmation', stepOrder: 7 },
  { stepKey: 'post_deployment_validation', stepName: 'Post-deployment validation', stepOrder: 8 },
] as const;

export class EnterpriseLaunchCenterGoLiveService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly businessContinuityService: EnterpriseBusinessContinuityService,
  ) {}

  async listWizards(companyId: string): Promise<LncGoLiveWizardSummary[]> {
    const wizards = await this.db.query.lncGoLiveWizards.findMany({
      where: eq(lncGoLiveWizards.companyId, companyId),
      orderBy: (w, { desc }) => [desc(w.createdAt)],
      limit: 20,
    });
    return Promise.all(wizards.map((w) => this.toWizardSummary(w)));
  }

  async createWizard(scope: StaffScope, input: CreateLncGoLiveWizardRequest): Promise<LncGoLiveWizardSummary> {
    const wizardKey = `golive_${Date.now()}`;
    const [wizard] = await this.db
      .insert(lncGoLiveWizards)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        wizardKey,
        title: input.title.trim(),
        status: 'draft',
        currentStepKey: WIZARD_STEPS[0]!.stepKey,
        ownerUserId: input.ownerUserId ?? scope.userId,
      })
      .returning();

    for (const step of WIZARD_STEPS) {
      await this.db.insert(lncGoLiveWizardSteps).values({
        companyId: scope.companyId,
        goLiveWizardId: wizard!.id,
        stepKey: step.stepKey,
        stepName: step.stepName,
        stepOrder: step.stepOrder,
        status: 'pending',
      });
    }

    await this.syncRollbackPlans(scope.companyId, wizard!.id);
    return this.toWizardSummary(wizard!);
  }

  async updateWizardStep(
    scope: StaffScope,
    wizardId: string,
    stepKey: string,
    input: UpdateLncGoLiveWizardStepRequest,
  ): Promise<LncGoLiveWizardSummary> {
    const wizard = await this.ensureWizard(scope.companyId, wizardId);
    const step = await this.db.query.lncGoLiveWizardSteps.findFirst({
      where: and(
        eq(lncGoLiveWizardSteps.goLiveWizardId, wizardId),
        eq(lncGoLiveWizardSteps.stepKey, stepKey),
        eq(lncGoLiveWizardSteps.companyId, scope.companyId),
      ),
    });
    if (!step) throw new Error('Wizard step not found');

    await this.db
      .update(lncGoLiveWizardSteps)
      .set({
        status: input.status,
        notes: input.notes ?? step.notes,
        completedByUserId: input.status === 'passed' ? scope.userId : step.completedByUserId,
        completedAt: input.status === 'passed' ? new Date() : step.completedAt,
        updatedAt: new Date(),
      })
      .where(eq(lncGoLiveWizardSteps.id, step.id));

    const nextStatus: LncWizardStatus =
      stepKey === 'final_approval' && input.status === 'passed'
        ? 'pending_approval'
        : wizard.status === 'draft'
          ? 'in_progress'
          : wizard.status;

    const nextStep = WIZARD_STEPS.find((s) => s.stepOrder === step.stepOrder + 1);

    await this.db
      .update(lncGoLiveWizards)
      .set({
        status: nextStatus,
        currentStepKey: input.status === 'passed' && nextStep ? nextStep.stepKey : wizard.currentStepKey,
        updatedAt: new Date(),
      })
      .where(eq(lncGoLiveWizards.id, wizardId));

    return this.toWizardSummary(await this.ensureWizard(scope.companyId, wizardId));
  }

  async approveWizard(scope: StaffScope, wizardId: string, input: ApproveLncGoLiveWizardRequest): Promise<LncGoLiveWizardSummary> {
    const wizard = await this.ensureWizard(scope.companyId, wizardId);
    if (wizard.status !== 'pending_approval') {
      throw new Error('Wizard is not pending approval');
    }

    const [updated] = await this.db
      .update(lncGoLiveWizards)
      .set({
        status: 'approved',
        approvedByUserId: scope.userId,
        approvedAt: new Date(),
        currentStepKey: 'deployment_confirmation',
        metadata: { approvalNotes: input.notes ?? null },
        updatedAt: new Date(),
      })
      .where(eq(lncGoLiveWizards.id, wizardId))
      .returning();

    await this.db
      .update(lncGoLiveWizardSteps)
      .set({ status: 'passed', completedByUserId: scope.userId, completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(lncGoLiveWizardSteps.goLiveWizardId, wizardId), eq(lncGoLiveWizardSteps.stepKey, 'final_approval')));

    return this.toWizardSummary(updated ?? wizard);
  }

  async confirmDeployment(scope: StaffScope, wizardId: string): Promise<LncGoLiveWizardSummary> {
    const wizard = await this.ensureWizard(scope.companyId, wizardId);
    if (wizard.status !== 'approved') {
      throw new Error('Wizard must be approved before deployment confirmation');
    }

    const [updated] = await this.db
      .update(lncGoLiveWizards)
      .set({
        status: 'completed',
        currentStepKey: 'post_deployment_validation',
        completedAt: new Date(),
        metadata: {
          ...(wizard.metadata as Record<string, unknown>),
          deploymentConfirmedAt: new Date().toISOString(),
          deploymentConfirmedBy: scope.userId,
          note: 'Deployment confirmation recorded — no automatic production deployment performed.',
        },
        updatedAt: new Date(),
      })
      .where(eq(lncGoLiveWizards.id, wizardId))
      .returning();

    await this.db
      .update(lncGoLiveWizardSteps)
      .set({ status: 'passed', completedByUserId: scope.userId, completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(lncGoLiveWizardSteps.goLiveWizardId, wizardId), eq(lncGoLiveWizardSteps.stepKey, 'deployment_confirmation')));

    return this.toWizardSummary(updated ?? wizard);
  }

  async listRollbackPlans(companyId: string, wizardId?: string): Promise<LncRollbackPlanLinkSummary[]> {
    const rows = await this.db.query.lncRollbackPlanLinks.findMany({
      where: wizardId
        ? and(eq(lncRollbackPlanLinks.companyId, companyId), eq(lncRollbackPlanLinks.goLiveWizardId, wizardId))
        : eq(lncRollbackPlanLinks.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.createdAt)],
    });
    return rows.map(toRollbackPlanSummary);
  }

  async selectRollbackPlan(scope: StaffScope, wizardId: string, rollbackPlanLinkId: string): Promise<LncRollbackPlanLinkSummary[]> {
    await this.ensureWizard(scope.companyId, wizardId);
    await this.db
      .update(lncRollbackPlanLinks)
      .set({ isSelected: false, updatedAt: new Date() })
      .where(and(eq(lncRollbackPlanLinks.companyId, scope.companyId), eq(lncRollbackPlanLinks.goLiveWizardId, wizardId)));

    await this.db
      .update(lncRollbackPlanLinks)
      .set({ isSelected: true, updatedAt: new Date() })
      .where(and(eq(lncRollbackPlanLinks.id, rollbackPlanLinkId), eq(lncRollbackPlanLinks.companyId, scope.companyId)));

    return this.listRollbackPlans(scope.companyId, wizardId);
  }

  async validateRollbackPlan(scope: StaffScope, rollbackPlanLinkId: string): Promise<LncRollbackPlanLinkSummary> {
    const link = await this.db.query.lncRollbackPlanLinks.findFirst({
      where: and(eq(lncRollbackPlanLinks.id, rollbackPlanLinkId), eq(lncRollbackPlanLinks.companyId, scope.companyId)),
    });
    if (!link) throw new Error('Rollback plan link not found');

    const bc = await this.businessContinuityService.getDashboard(scope.companyId);
    const plan = bc.recoveryPlans.find((p) => p.id === link.recoveryPlanId);
    const passed = Boolean(plan);
    const report = {
      validatedAt: new Date().toISOString(),
      recoveryPlanFound: passed,
      recoveryPlanName: plan?.name ?? null,
      recoveryTestCount: bc.recoveryTests.filter((t) => t.recoveryPlanId === link.recoveryPlanId).length,
      note: 'Recovery validation only — rollback never initiated automatically.',
    };

    const [updated] = await this.db
      .update(lncRollbackPlanLinks)
      .set({
        validationStatus: passed ? 'passed' : 'failed',
        validationReport: report,
        updatedAt: new Date(),
      })
      .where(eq(lncRollbackPlanLinks.id, rollbackPlanLinkId))
      .returning();

    return toRollbackPlanSummary(updated ?? link);
  }

  private async syncRollbackPlans(companyId: string, wizardId: string): Promise<void> {
    const plans = await this.businessContinuityService.listRecoveryPlans(companyId);
    for (const plan of plans) {
      const existing = await this.db.query.lncRollbackPlanLinks.findFirst({
        where: and(
          eq(lncRollbackPlanLinks.companyId, companyId),
          eq(lncRollbackPlanLinks.goLiveWizardId, wizardId),
          eq(lncRollbackPlanLinks.recoveryPlanId, plan.id),
        ),
      });
      if (!existing) {
        await this.db.insert(lncRollbackPlanLinks).values({
          companyId,
          goLiveWizardId: wizardId,
          recoveryPlanId: plan.id,
          planName: plan.name,
          planDescription: plan.description ?? null,
        });
      }
    }
  }

  private async ensureWizard(companyId: string, wizardId: string) {
    const wizard = await this.db.query.lncGoLiveWizards.findFirst({
      where: and(eq(lncGoLiveWizards.companyId, companyId), eq(lncGoLiveWizards.id, wizardId)),
    });
    if (!wizard) throw new Error('Go-live wizard not found');
    return wizard;
  }

  private async toWizardSummary(wizard: typeof lncGoLiveWizards.$inferSelect): Promise<LncGoLiveWizardSummary> {
    const steps = await this.db.query.lncGoLiveWizardSteps.findMany({
      where: eq(lncGoLiveWizardSteps.goLiveWizardId, wizard.id),
      orderBy: (s, { asc }) => [asc(s.stepOrder)],
    });
    return {
      id: wizard.id,
      wizardKey: wizard.wizardKey,
      title: wizard.title,
      status: wizard.status,
      currentStepKey: wizard.currentStepKey,
      ownerUserId: wizard.ownerUserId,
      approvedByUserId: wizard.approvedByUserId,
      approvedAt: wizard.approvedAt?.toISOString() ?? null,
      completedAt: wizard.completedAt?.toISOString() ?? null,
      createdAt: wizard.createdAt.toISOString(),
      steps: steps.map((s) => ({
        id: s.id,
        stepKey: s.stepKey,
        stepName: s.stepName,
        stepOrder: s.stepOrder,
        status: s.status as LncWizardStepStatus,
        completedAt: s.completedAt?.toISOString() ?? null,
        notes: s.notes,
      })),
    };
  }
}

function toRollbackPlanSummary(row: typeof lncRollbackPlanLinks.$inferSelect): LncRollbackPlanLinkSummary {
  return {
    id: row.id,
    goLiveWizardId: row.goLiveWizardId,
    recoveryPlanId: row.recoveryPlanId,
    planName: row.planName,
    planDescription: row.planDescription,
    isSelected: row.isSelected,
    validationStatus: row.validationStatus,
    validationReport: (row.validationReport ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}
