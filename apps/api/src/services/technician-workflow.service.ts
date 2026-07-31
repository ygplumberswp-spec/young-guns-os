import type { AddJobNoteRequest, JobDetail, SubmitJobCompletionRequest } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { mobileActionLogs } from '@titan/db';
import type { JobsService } from './jobs.service.js';
import type { NotificationService } from './notification.service.js';
import type { MobileSyncService } from './mobile-sync.service.js';
import { JobExecutionError, JobExecutionService, userHasJobAccess } from './job-execution.service.js';

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

function mapExecutionError(error: unknown): TechnicianWorkflowError {
  if (error instanceof JobExecutionError) {
    return new TechnicianWorkflowError(error.code, error.message);
  }
  if (error instanceof TechnicianWorkflowError) {
    return error;
  }
  throw error;
}

export class TechnicianWorkflowService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly jobsService: JobsService,
    private readonly notificationService: NotificationService,
    private readonly mobileSyncService: MobileSyncService,
    private readonly jobExecutionService: JobExecutionService,
  ) {}

  async acceptJob(scope: TechnicianScope, jobId: string): Promise<JobDetail> {
    const job = await this.requireAssignedJob(scope, jobId);

    try {
      await this.jobExecutionService.transition(scope, jobId, { action: 'accept' });
    } catch (error) {
      throw mapExecutionError(error);
    }

    const updated = await this.jobsService.getJob(scope.companyId, jobId);
    if (!updated) {
      throw new TechnicianWorkflowError('NOT_FOUND', 'Job not found');
    }

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

    try {
      await this.jobExecutionService.transition(scope, jobId, { action: 'start_work' });
    } catch (error) {
      throw mapExecutionError(error);
    }

    const updated = await this.jobsService.getJob(scope.companyId, jobId);
    if (!updated) {
      throw new TechnicianWorkflowError('NOT_FOUND', 'Job not found');
    }

    await this.logAction(scope, 'start_job', 'job', jobId, { previousStatus: job.status });
    return updated;
  }

  async pauseJob(scope: TechnicianScope, jobId: string, reason?: string): Promise<JobDetail> {
    const job = await this.requireAssignedJob(scope, jobId);

    try {
      await this.jobExecutionService.transition(scope, jobId, { action: 'pause', reason });
    } catch (error) {
      throw mapExecutionError(error);
    }

    const updated = await this.jobsService.getJob(scope.companyId, jobId);
    if (!updated) {
      throw new TechnicianWorkflowError('NOT_FOUND', 'Job not found');
    }

    await this.logAction(scope, 'pause_job', 'job', jobId, { previousStatus: job.status, reason });
    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: scope.userId,
      notificationType: 'schedule_changed',
      title: 'Job paused',
      body: `${updated.title} was paused${reason ? `: ${reason}` : ''}.`,
      entityType: 'job',
      entityId: jobId,
    });

    return updated;
  }

  /** Legacy endpoint kept for compatibility — full completion now requires the gated completion endpoint. */
  async completeJob(scope: TechnicianScope, jobId: string): Promise<JobDetail> {
    await this.requireAssignedJob(scope, jobId);
    throw new TechnicianWorkflowError(
      'COMPLETION_GATE_REQUIRED',
      'Use the gated completion endpoint with full completion details to finish this job',
    );
  }

  async markEnRoute(scope: TechnicianScope, jobId: string): Promise<JobDetail> {
    const job = await this.requireAssignedJob(scope, jobId);

    if (!job.assignedUserId) {
      throw new TechnicianWorkflowError('INVALID_STATE', 'Job must have an assigned technician');
    }

    try {
      await this.jobExecutionService.transition(scope, jobId, { action: 'en_route' });
    } catch (error) {
      throw mapExecutionError(error);
    }

    await this.logAction(scope, 'mark_en_route', 'job', jobId, {
      previousStatus: job.status,
      trackingEnabled: true,
    });

    return job;
  }

  async markArrived(scope: TechnicianScope, jobId: string): Promise<JobDetail> {
    const job = await this.requireAssignedJob(scope, jobId);

    try {
      await this.jobExecutionService.transition(scope, jobId, { action: 'arrive' });
    } catch (error) {
      throw mapExecutionError(error);
    }

    await this.logAction(scope, 'mark_arrived', 'job', jobId, { previousStatus: job.status });
    return job;
  }

  async rejectDispatch(scope: TechnicianScope, jobId: string, reason?: string): Promise<JobDetail> {
    const job = await this.requireAssignedJob(scope, jobId);

    if (!['new', 'scheduled'].includes(job.status)) {
      throw new TechnicianWorkflowError(
        'INVALID_STATUS',
        'Dispatch cannot be rejected from this status',
      );
    }

    const updated = await this.jobsService.updateJob(scope.companyId, jobId, {
      assignedUserId: null,
      notes: reason?.trim()
        ? `${job.notes ? `${job.notes}\n\n` : ''}Dispatch rejected: ${reason.trim()}`
        : job.notes,
    });

    await this.logAction(scope, 'reject_dispatch', 'job', jobId, { reason: reason ?? null });
    return updated;
  }

  async addJobNote(
    scope: TechnicianScope,
    jobId: string,
    input: AddJobNoteRequest,
  ): Promise<JobDetail> {
    const job = await this.requireAssignedJob(scope, jobId);
    const note = input.note.trim();

    if (!note) {
      throw new TechnicianWorkflowError('VALIDATION_ERROR', 'Note is required');
    }

    const combinedNotes = job.notes ? `${job.notes}\n\n${note}` : note;
    const updated = await this.jobsService.updateJob(scope.companyId, jobId, {
      notes: combinedNotes,
    });

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

    const hasAccess = await userHasJobAccess(this.db, scope.companyId, jobId, scope.userId);
    if (!hasAccess) {
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
