import type { AddJobNoteRequest, JobDetail, SubmitJobCompletionRequest } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { mobileActionLogs } from '@titan/db';
import type { JobsService } from './jobs.service.js';
import type { NotificationService } from './notification.service.js';
import type { MobileSyncService } from './mobile-sync.service.js';

export class TechnicianWorkflowError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TechnicianWorkflowError';
  }
}

type TechnicianScope = {
  companyId: string;
  userId: string;
};

export class TechnicianWorkflowService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly jobsService: JobsService,
    private readonly notificationService: NotificationService,
    private readonly mobileSyncService: MobileSyncService,
  ) {}

  async acceptJob(scope: TechnicianScope, jobId: string): Promise<JobDetail> {
    const job = await this.requireAssignedJob(scope, jobId);

    if (!['new', 'scheduled'].includes(job.status)) {
      throw new TechnicianWorkflowError(
        'INVALID_STATUS',
        'Only new or scheduled jobs can be accepted',
      );
    }

    const updated = await this.jobsService.updateJob(scope.companyId, jobId, {
      status: 'scheduled',
    });

    await this.logAction(scope, 'accept_job', 'job', jobId, { previousStatus: job.status });
    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: scope.userId,
      notificationType: 'job_assigned',
      title: 'Job accepted',
      body: `You accepted ${updated.title}.`,
      entityType: 'job',
      entityId: jobId,
    });

    return updated;
  }

  async startJob(scope: TechnicianScope, jobId: string): Promise<JobDetail> {
    const job = await this.requireAssignedJob(scope, jobId);

    if (!['scheduled', 'new', 'in_progress'].includes(job.status)) {
      throw new TechnicianWorkflowError('INVALID_STATUS', 'Job cannot be started from this status');
    }

    const updated = await this.jobsService.updateJob(scope.companyId, jobId, {
      status: 'in_progress',
    });

    await this.logAction(scope, 'start_job', 'job', jobId, { previousStatus: job.status });
    return updated;
  }

  async pauseJob(scope: TechnicianScope, jobId: string): Promise<JobDetail> {
    const job = await this.requireAssignedJob(scope, jobId);

    if (job.status !== 'in_progress') {
      throw new TechnicianWorkflowError('INVALID_STATUS', 'Only in-progress jobs can be paused');
    }

    const updated = await this.jobsService.updateJob(scope.companyId, jobId, {
      status: 'scheduled',
    });

    await this.logAction(scope, 'pause_job', 'job', jobId, { previousStatus: job.status });
    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: scope.userId,
      notificationType: 'schedule_changed',
      title: 'Job paused',
      body: `${updated.title} was paused and returned to scheduled.`,
      entityType: 'job',
      entityId: jobId,
    });

    return updated;
  }

  async completeJob(scope: TechnicianScope, jobId: string): Promise<JobDetail> {
    const job = await this.requireAssignedJob(scope, jobId);

    if (!['in_progress', 'scheduled'].includes(job.status)) {
      throw new TechnicianWorkflowError('INVALID_STATUS', 'Job cannot be completed from this status');
    }

    const updated = await this.jobsService.updateJob(scope.companyId, jobId, {
      status: 'completed',
    });

    await this.logAction(scope, 'complete_job', 'job', jobId, { previousStatus: job.status });
    return updated;
  }

  async addJobNote(scope: TechnicianScope, jobId: string, input: AddJobNoteRequest): Promise<JobDetail> {
    const job = await this.requireAssignedJob(scope, jobId);
    const note = input.note.trim();

    if (!note) {
      throw new TechnicianWorkflowError('VALIDATION_ERROR', 'Note is required');
    }

    const combinedNotes = job.notes ? `${job.notes}\n\n${note}` : note;
    const updated = await this.jobsService.updateJob(scope.companyId, jobId, { notes: combinedNotes });

    await this.logAction(scope, 'add_job_note', 'job', jobId, { noteLength: note.length });
    return updated;
  }

  async submitCompletionFoundation(
    scope: TechnicianScope,
    jobId: string,
    input: SubmitJobCompletionRequest,
  ): Promise<{ job: JobDetail; pendingActionId: string }> {
    const job = await this.requireAssignedJob(scope, jobId);
    const summary = input.summary.trim();

    if (!summary) {
      throw new TechnicianWorkflowError('VALIDATION_ERROR', 'Completion summary is required');
    }

    const pendingAction = await this.mobileSyncService.createPendingAction({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType: 'submit_completion',
      entityType: 'job',
      entityId: jobId,
      payload: {
        summary,
        checklist: input.checklist ?? {},
        photoMetadata: input.photoMetadata ?? [],
        foundationOnly: true,
      },
    });

    await this.logAction(scope, 'submit_completion', 'job', jobId, {
      pendingActionId: pendingAction.id,
      photoCount: input.photoMetadata?.length ?? 0,
    });

    return { job, pendingActionId: pendingAction.id };
  }

  private async requireAssignedJob(scope: TechnicianScope, jobId: string) {
    const job = await this.jobsService.getJob(scope.companyId, jobId);

    if (!job) {
      throw new TechnicianWorkflowError('NOT_FOUND', 'Job not found');
    }

    if (job.assignedUserId !== scope.userId) {
      throw new TechnicianWorkflowError('FORBIDDEN', 'Job is not assigned to you');
    }

    return job;
  }

  private async logAction(
    scope: TechnicianScope,
    actionType: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(mobileActionLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType,
      entityId,
      metadata,
    });
  }
}
