import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import { createAccessToken } from '@titan/auth';
import { createMobileRouter } from './mobile.js';
import type { AuthService } from '../services/auth.service.js';
import type { JobExecutionService } from '../services/job-execution.service.js';
import type { MobileService } from '../services/mobile.service.js';
import type { MobileSyncService } from '../services/mobile-sync.service.js';
import type { MobileWorkforceService } from '../services/mobile-workforce.service.js';
import type { NotificationService } from '../services/notification.service.js';
import type { PortalAuthService } from '../services/portal-auth.service.js';
import type { RecommendationsService } from '../services/recommendations.service.js';
import type { TeamService } from '../services/team.service.js';
import type { TechnicianWorkflowService } from '../services/technician-workflow.service.js';
import type { JobCostCaptureService } from '../services/job-cost-capture.service.js';
import { JobExecutionError } from '../services/job-execution.service.js';

/**
 * Offline duplicate-completion API contract (OPS-013 / UX-B):
 * - offline flush replays return duplicate without re-applying
 * - gated complete replays same clientActionId without double-complete
 * - second complete without reopen rejects COMPLETION_SNAPSHOT_EXISTS
 */
const JWT_SECRET = 'mobile-offline-completion-test-secret';
const JOB_ID = '11111111-1111-1111-1111-111111111111';
const CLIENT_ACTION_ID = 'offline-note-stable-1';
const COMPLETION_ACTION_ID = 'complete-stable-1';

function accessToken(): string {
  return createAccessToken(
    {
      sub: 'user-1',
      companyId: 'company-1',
      roleId: 'role-1',
      roleName: 'Company Owner',
      sessionId: 'session-1',
      permissions: ['mobile:write', 'jobs:write'],
    },
    JWT_SECRET,
  ).token;
}

function buildApp(services: {
  mobileWorkforceService: Pick<MobileWorkforceService, 'flushOfflineActions'>;
  jobExecutionService: Pick<JobExecutionService, 'completeGated'>;
}) {
  const authService = {
    validateSession: async () => true,
  } as unknown as AuthService;

  const teamService = {
    ensureDefaultRoles: async () => undefined,
  } as unknown as TeamService;

  const app = express();
  app.use(express.json());
  app.use(
    '/mobile',
    createMobileRouter({
      mobileService: {} as MobileService,
      notificationService: {} as NotificationService,
      mobileSyncService: {} as MobileSyncService,
      technicianWorkflowService: {} as TechnicianWorkflowService,
      mobileWorkforceService: services.mobileWorkforceService as MobileWorkforceService,
      jobExecutionService: services.jobExecutionService as JobExecutionService,
      jobCostCaptureService: {} as JobCostCaptureService,
      paperlessFieldCashService: {
        afterSignedCompletion: async () => ({
          issues: [],
          readyForDraftInvoice: false,
          draftInvoice: null,
          ownerNotifyMessage: null,
        }),
        getTechnicianPaymentStrip: async () => null,
        recordOnSitePaymentEvidence: async () => ({}),
        getOwnerCompletionPack: async () => ({}),
        buildArrivalPrompt: () => ({
          shouldPrompt: false,
          jobId: null,
          jobNumber: null,
          message: null,
          autoStartLabour: false,
          verificationState: 'unavailable',
        }),
      } as unknown as import('../services/paperless-field-cash.service.js').PaperlessFieldCashService,
      recommendationsService: {} as RecommendationsService,
      teamService,
      portalAuthService: {} as PortalAuthService,
      db: {} as import('@titan/db').DatabaseClient,
      jwtSecret: JWT_SECRET,
      authService,
    }),
  );
  return app;
}

async function postJson(
  app: express.Express,
  path: string,
  body: unknown,
  token = accessToken(),
) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      data?: unknown;
      error?: { code?: string; message?: string };
    };
    return { status: response.status, payload };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

const completionPayload = {
  workPerformedSummary: 'Replaced faulty element and tested.',
  checklist: { leak_test_completed: true },
  customerRepName: 'Site Agent',
  cocRequired: 'not_required' as const,
  technicianDeclaration: true,
  clientActionId: COMPLETION_ACTION_ID,
};

describe('POST /mobile/technician/workforce/offline/flush — duplicate replay', () => {
  it('returns duplicate for a replayed clientActionId without calling apply twice', async () => {
    let applyCount = 0;
    const seen = new Set<string>();

    const app = buildApp({
      mobileWorkforceService: {
        flushOfflineActions: async (_scope, request) => {
          const results = request.actions.map((action) => {
            if (seen.has(action.clientActionId)) {
              return {
                clientActionId: action.clientActionId,
                actionType: action.actionType,
                status: 'duplicate' as const,
              };
            }
            seen.add(action.clientActionId);
            applyCount += 1;
            return {
              clientActionId: action.clientActionId,
              actionType: action.actionType,
              status: 'synced' as const,
              resultId: 'job-1',
            };
          });
          return { results };
        },
      },
      jobExecutionService: {
        completeGated: async () => {
          throw new Error('not expected');
        },
      },
    });

    const body = {
      actions: [
        {
          clientActionId: CLIENT_ACTION_ID,
          actionType: 'note',
          jobId: JOB_ID,
          payload: { note: 'Offline note' },
        },
      ],
    };

    const first = await postJson(app, '/mobile/technician/workforce/offline/flush', body);
    const second = await postJson(app, '/mobile/technician/workforce/offline/flush', body);

    assert.equal(first.status, 200);
    assert.equal(
      (first.payload.data as { results: Array<{ status: string }> }).results[0]?.status,
      'synced',
    );
    assert.equal(second.status, 200);
    assert.equal(
      (second.payload.data as { results: Array<{ status: string }> }).results[0]?.status,
      'duplicate',
    );
    assert.equal(applyCount, 1);
  });

  it('rejects an invalid offline flush payload', async () => {
    const app = buildApp({
      mobileWorkforceService: {
        flushOfflineActions: async () => ({ results: [] }),
      },
      jobExecutionService: {
        completeGated: async () => {
          throw new Error('not expected');
        },
      },
    });

    const result = await postJson(app, '/mobile/technician/workforce/offline/flush', { actions: [] });

    assert.equal(result.status, 400);
    assert.equal(result.payload.error?.code, 'VALIDATION_ERROR');
  });
});

describe('POST /mobile/technician/jobs/:id/complete-gated — duplicate completion', () => {
  it('accepts an idempotent replay with the same clientActionId', async () => {
    let completeCalls = 0;
    const completedIds = new Set<string>();

    const app = buildApp({
      mobileWorkforceService: {
        flushOfflineActions: async () => ({ results: [] }),
      },
      jobExecutionService: {
        completeGated: async (_scope, jobId, input) => {
          completeCalls += 1;
          if (input.clientActionId && completedIds.has(input.clientActionId)) {
            return { id: jobId, status: 'completed', executionPhase: 'completed' } as never;
          }
          if (input.clientActionId) completedIds.add(input.clientActionId);
          return { id: jobId, status: 'completed', executionPhase: 'completed' } as never;
        },
      },
    });

    const path = `/mobile/technician/jobs/${JOB_ID}/complete-gated`;
    const first = await postJson(app, path, completionPayload);
    const second = await postJson(app, path, completionPayload);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(completeCalls, 2);
  });

  it('returns COMPLETION_SNAPSHOT_EXISTS when a second complete uses a new clientActionId', async () => {
    let completeCalls = 0;

    const app = buildApp({
      mobileWorkforceService: {
        flushOfflineActions: async () => ({ results: [] }),
      },
      jobExecutionService: {
        completeGated: async (_scope, jobId, _input) => {
          completeCalls += 1;
          if (completeCalls === 1) {
            return { id: jobId, status: 'completed', executionPhase: 'completed' } as never;
          }
          throw new JobExecutionError(
            'COMPLETION_SNAPSHOT_EXISTS',
            'A completion snapshot already exists for this job — reopen the job with a reason before recording a new completion',
          );
        },
      },
    });

    const path = `/mobile/technician/jobs/${JOB_ID}/complete-gated`;
    const first = await postJson(app, path, {
      ...completionPayload,
      clientActionId: 'complete-first',
    });
    const second = await postJson(app, path, {
      ...completionPayload,
      clientActionId: 'complete-second',
    });

    assert.equal(first.status, 200);
    assert.equal(second.status, 400);
    assert.equal(second.payload.error?.code, 'COMPLETION_SNAPSHOT_EXISTS');
  });
});
