import { and, eq } from 'drizzle-orm';
import type {
  ApprovePlGoLiveWizardRequest,
  CreatePlGoLiveWizardRequest,
  PlGoLiveWizardSummary,
  PlWizardStatus,
  PlWizardStepStatus,
  UpdatePlGoLiveWizardStepRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { plGoLiveWizardSteps, plGoLiveWizards } from '@titan/db';

type StaffScope = { companyId: string; userId: string };

const WIZARD_STEPS = [
  { stepKey: 'infrastructure', stepName: 'Infrastructure', stepOrder: 1 },
  { stepKey: 'integrations', stepName: 'Integrations', stepOrder: 2 },
  { stepKey: 'security', stepName: 'Security', stepOrder: 3 },
  { stepKey: 'domain', stepName: 'Domain', stepOrder: 4 },
  { stepKey: 'mobile', stepName: 'Mobile', stepOrder: 5 },
  { stepKey: 'billing', stepName: 'Billing', stepOrder: 6 },
  { stepKey: 'ai', stepName: 'AI', stepOrder: 7 },
  { stepKey: 'final_verification', stepName: 'Final verification', stepOrder: 8 },
  { stepKey: 'owner_approval', stepName: 'Owner approval', stepOrder: 9 },
  { stepKey: 'launch_confirmation', stepName: 'Launch confirmation', stepOrder: 10 },
] as const;

export class EnterpriseProductionLaunchGoLiveWizardService {
  constructor(private readonly db: DatabaseClient) {}

  async listWizards(companyId: string): Promise<PlGoLiveWizardSummary[]> {
    const wizards = await this.db.query.plGoLiveWizards.findMany({
      where: eq(plGoLiveWizards.companyId, companyId),
      orderBy: (w, { desc }) => [desc(w.createdAt)],
      limit: 20,
    });
    return Promise.all(wizards.map((w) => this.toWizardSummary(w)));
  }

  async createWizard(
    scope: StaffScope,
    input: CreatePlGoLiveWizardRequest,
  ): Promise<PlGoLiveWizardSummary> {
    const wizardKey = `golive_${Date.now()}`;
    const [wizard] = await this.db
      .insert(plGoLiveWizards)
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
      await this.db.insert(plGoLiveWizardSteps).values({
        companyId: scope.companyId,
        goLiveWizardId: wizard!.id,
        stepKey: step.stepKey,
        stepName: step.stepName,
        stepOrder: step.stepOrder,
        status: 'pending',
      });
    }

    return this.toWizardSummary(wizard!);
  }

  async updateWizardStep(
    scope: StaffScope,
    wizardId: string,
    stepKey: string,
    input: UpdatePlGoLiveWizardStepRequest,
  ): Promise<PlGoLiveWizardSummary> {
    const wizard = await this.ensureWizard(scope.companyId, wizardId);
    const step = await this.db.query.plGoLiveWizardSteps.findFirst({
      where: and(
        eq(plGoLiveWizardSteps.goLiveWizardId, wizardId),
        eq(plGoLiveWizardSteps.stepKey, stepKey),
        eq(plGoLiveWizardSteps.companyId, scope.companyId),
      ),
    });
    if (!step) throw new Error('Wizard step not found');

    await this.db
      .update(plGoLiveWizardSteps)
      .set({
        status: input.status,
        notes: input.notes ?? step.notes,
        completedByUserId: input.status === 'passed' ? scope.userId : step.completedByUserId,
        completedAt: input.status === 'passed' ? new Date() : step.completedAt,
        updatedAt: new Date(),
      })
      .where(eq(plGoLiveWizardSteps.id, step.id));

    const nextStatus: PlWizardStatus =
      stepKey === 'owner_approval' && input.status === 'passed'
        ? 'pending_approval'
        : wizard.status === 'draft'
          ? 'in_progress'
          : wizard.status;

    await this.db
      .update(plGoLiveWizards)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(plGoLiveWizards.id, wizardId));

    return this.toWizardSummary(await this.ensureWizard(scope.companyId, wizardId));
  }

  async approveWizard(
    scope: StaffScope,
    wizardId: string,
    input: ApprovePlGoLiveWizardRequest,
  ): Promise<PlGoLiveWizardSummary> {
    const wizard = await this.ensureWizard(scope.companyId, wizardId);
    if (wizard.status !== 'pending_approval' && wizard.status !== 'in_progress') {
      throw new Error('Wizard is not ready for approval.');
    }

    await this.db
      .update(plGoLiveWizardSteps)
      .set({
        status: 'passed',
        notes: input.notes ?? 'Owner approved',
        completedByUserId: scope.userId,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(plGoLiveWizardSteps.goLiveWizardId, wizardId),
          eq(plGoLiveWizardSteps.stepKey, 'owner_approval'),
          eq(plGoLiveWizardSteps.companyId, scope.companyId),
        ),
      );

    const [updated] = await this.db
      .update(plGoLiveWizards)
      .set({
        status: 'approved',
        approvedByUserId: scope.userId,
        approvedAt: new Date(),
        currentStepKey: 'launch_confirmation',
        updatedAt: new Date(),
      })
      .where(eq(plGoLiveWizards.id, wizardId))
      .returning();

    return this.toWizardSummary(updated!);
  }

  async confirmLaunch(scope: StaffScope, wizardId: string): Promise<PlGoLiveWizardSummary> {
    const wizard = await this.ensureWizard(scope.companyId, wizardId);
    if (wizard.status !== 'approved') {
      throw new Error('Wizard requires owner approval before launch confirmation.');
    }

    await this.db
      .update(plGoLiveWizardSteps)
      .set({
        status: 'passed',
        completedByUserId: scope.userId,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(plGoLiveWizardSteps.goLiveWizardId, wizardId),
          eq(plGoLiveWizardSteps.stepKey, 'launch_confirmation'),
          eq(plGoLiveWizardSteps.companyId, scope.companyId),
        ),
      );

    const [updated] = await this.db
      .update(plGoLiveWizards)
      .set({
        status: 'launched',
        launchConfirmed: true,
        launchedAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          ...(wizard.metadata as Record<string, unknown>),
          note: 'Launch confirmed — no automatic deployment executed.',
        },
      })
      .where(eq(plGoLiveWizards.id, wizardId))
      .returning();

    return this.toWizardSummary(updated!);
  }

  private async ensureWizard(companyId: string, wizardId: string) {
    const wizard = await this.db.query.plGoLiveWizards.findFirst({
      where: and(eq(plGoLiveWizards.companyId, companyId), eq(plGoLiveWizards.id, wizardId)),
    });
    if (!wizard) throw new Error('Go-live wizard not found');
    return wizard;
  }

  private async toWizardSummary(
    row: typeof plGoLiveWizards.$inferSelect,
  ): Promise<PlGoLiveWizardSummary> {
    const steps = await this.db.query.plGoLiveWizardSteps.findMany({
      where: eq(plGoLiveWizardSteps.goLiveWizardId, row.id),
      orderBy: (s, { asc }) => [asc(s.stepOrder)],
    });
    return {
      id: row.id,
      wizardKey: row.wizardKey,
      title: row.title,
      status: row.status as PlWizardStatus,
      currentStepKey: row.currentStepKey,
      ownerUserId: row.ownerUserId,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      launchedAt: row.launchedAt?.toISOString() ?? null,
      launchConfirmed: row.launchConfirmed,
      steps: steps.map((s) => ({
        id: s.id,
        stepKey: s.stepKey,
        stepName: s.stepName,
        stepOrder: s.stepOrder,
        status: s.status as PlWizardStepStatus,
        notes: s.notes,
        completedAt: s.completedAt?.toISOString() ?? null,
      })),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
