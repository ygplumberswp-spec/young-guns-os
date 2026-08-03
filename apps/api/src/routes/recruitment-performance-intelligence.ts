import { Router } from 'express';
import { z } from 'zod';
import type { RecruitmentPerformanceIntelligenceService } from '../services/recruitment-performance-intelligence.service.js';
import {
  RecruitmentPerformanceIntelligenceError,
  type RpiActor,
} from '../services/recruitment-performance-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const pipelineStageSchema = z.enum([
  'new',
  'applied',
  'screening',
  'interview',
  'assessment',
  'offered',
  'offer',
  'hired',
  'rejected',
]);

const createCandidateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  roleTitle: z.string().trim().max(200).nullable().optional(),
  source: z.string().trim().max(200).nullable().optional(),
  skills: z.array(z.string().trim().max(100)).max(50).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  status: pipelineStageSchema.optional(),
});

const createHiringDraftSchema = z.object({
  candidateId: z.string().uuid(),
  toStage: pipelineStageSchema,
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(5000).optional(),
  submitForApproval: z.boolean().optional(),
});

const decideHiringSchema = z.object({
  decision: z.enum(['approve', 'reject', 'cancel']),
  notes: z.string().trim().max(2000).optional(),
  executeOnCandidate: z.boolean().optional(),
});

const createInterviewDraftSchema = z.object({
  candidateId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(5000).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  interviewerUserId: z.string().uuid().optional(),
  submitForApproval: z.boolean().optional(),
});

const decideInterviewSchema = z.object({
  decision: z.enum(['schedule', 'complete', 'approve', 'reject', 'cancel']),
  notes: z.string().trim().max(2000).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

const refreshRecommendationsSchema = z.object({
  submitForApproval: z.boolean().optional(),
});

const decideRecommendationSchema = z.object({
  decision: z.enum(['approve', 'reject', 'acknowledge']),
  notes: z.string().trim().max(2000).optional(),
});

const updateSettingsSchema = z.object({
  recruitmentEnabled: z.boolean().optional(),
  performanceInsightsEnabled: z.boolean().optional(),
  selfPerformanceViewEnabled: z.boolean().optional(),
  interviewWorkflowEnabled: z.boolean().optional(),
  auraSuggestionsEnabled: z.boolean().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const createInsightSchema = z.object({
  target: z.enum([
    'command_centre',
    'executive_dashboard',
    'hr_employee_intelligence',
    'payroll_timesheet_intelligence',
    'workforce_intelligence',
    'technician_intelligence',
    'recruiting',
    'jobs',
    'training',
    'performance',
    'timesheets',
  ]),
  title: z.string().trim().min(1).max(200),
  insight: z.string().trim().min(1).max(5000),
  href: z.string().trim().max(500).optional(),
  sourceHiringDraftId: z.string().uuid().optional(),
  sourceRecommendationId: z.string().uuid().optional(),
  sourceInterviewDraftId: z.string().uuid().optional(),
});

const ackInsightSchema = z.object({
  status: z.enum(['acknowledged', 'dismissed']),
});

type RouterDeps = {
  recruitmentPerformanceIntelligenceService: RecruitmentPerformanceIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): RpiActor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function paramId(req: import('express').Request): string {
  const raw = req.params.id;
  return String(Array.isArray(raw) ? raw[0] : raw ?? '');
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof RecruitmentPerformanceIntelligenceError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'INVALID_STATE'
            ? 409
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

export function createRecruitmentPerformanceIntelligenceRouter({
  recruitmentPerformanceIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    '*',
    'workforce:read',
    'workforce:write',
    'workforce_intelligence:read',
    'workforce_intelligence:write',
    'workforce_intelligence:manage',
    'recruiting:read',
    'recruiting:write',
  );
  const requireWrite = requireAnyPermission(
    '*',
    'workforce:write',
    'workforce_intelligence:write',
    'workforce_intelligence:manage',
    'recruiting:write',
  );
  const requireSelf = requireAnyPermission(
    '*',
    'workforce:read',
    'workforce:write',
    'workforce_intelligence:read',
    'workforce_intelligence:write',
    'workforce_intelligence:manage',
    'recruiting:read',
    'recruiting:write',
    'jobs:read',
    'mobile:read',
    'mobile:write',
  );

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    try {
      await teamService.ensureDefaultRoles(getAuth(req).companyId);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await recruitmentPerformanceIntelligenceService.getDashboard(
        toActor(req),
      );
      res.json({
        data: {
          dashboard,
          autoHiringDecision: false as const,
          inventScores: false as const,
          inventCandidates: false as const,
          noAutomaticHiring: true as const,
          ownerApprovalRequired: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/me', requireSelf, async (req, res) => {
    try {
      const view = await recruitmentPerformanceIntelligenceService.getSelfPerformanceView(
        toActor(req),
      );
      res.json({
        data: {
          view,
          peerPerformanceHidden: true as const,
          recruitmentPipelineHidden: true as const,
          inventScores: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/candidates', requireRead, async (req, res) => {
    try {
      const candidates = await recruitmentPerformanceIntelligenceService.listCandidates(
        toActor(req),
      );
      res.json({
        data: {
          candidates,
          inventCandidates: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/candidates', requireWrite, async (req, res) => {
    try {
      const body = createCandidateSchema.parse(req.body ?? {});
      const candidate = await recruitmentPerformanceIntelligenceService.createCandidate(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          candidate,
          inventCandidates: false as const,
          autoHiringDecision: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/hiring-drafts', requireWrite, async (req, res) => {
    try {
      const body = createHiringDraftSchema.parse(req.body ?? {});
      const draft = await recruitmentPerformanceIntelligenceService.createHiringDraft(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          draft,
          autoHiringDecision: false as const,
          ownerApprovalRequired: true as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/hiring-drafts/:id/decide', requireWrite, async (req, res) => {
    try {
      const body = decideHiringSchema.parse(req.body ?? {});
      const draft = await recruitmentPerformanceIntelligenceService.decideHiringDraft(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          draft,
          autoHiringDecision: false as const,
          ownerControlled: true as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/interview-drafts', requireWrite, async (req, res) => {
    try {
      const body = createInterviewDraftSchema.parse(req.body ?? {});
      const draft = await recruitmentPerformanceIntelligenceService.createInterviewDraft(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          draft,
          autoHiringDecision: false as const,
          inventScores: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/interview-drafts/:id/decide', requireWrite, async (req, res) => {
    try {
      const body = decideInterviewSchema.parse(req.body ?? {});
      const draft = await recruitmentPerformanceIntelligenceService.decideInterviewDraft(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          draft,
          autoHiringDecision: false as const,
          candidateStatusUnchanged: true as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/recommendations/refresh', requireWrite, async (req, res) => {
    try {
      const body = refreshRecommendationsSchema.parse(req.body ?? {});
      const result = await recruitmentPerformanceIntelligenceService.refreshRecommendations(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          ...result,
          autoExecuted: false as const,
          inventScores: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/recommendations/:id/decide', requireWrite, async (req, res) => {
    try {
      const body = decideRecommendationSchema.parse(req.body ?? {});
      const recommendation =
        await recruitmentPerformanceIntelligenceService.decideRecommendation(
          toActor(req),
          paramId(req),
          body,
        );
      res.json({
        data: {
          recommendation,
          autoExecuted: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.patch('/settings', requireWrite, async (req, res) => {
    try {
      const body = updateSettingsSchema.parse(req.body ?? {});
      const settings = await recruitmentPerformanceIntelligenceService.updateSettings(
        toActor(req),
        body,
      );
      res.json({
        data: {
          settings,
          autoHiringEnabled: false as const,
          inventScoresEnabled: false as const,
          ownerControlled: true as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/aura-insights', requireWrite, async (req, res) => {
    try {
      const body = createInsightSchema.parse(req.body ?? {});
      const insight = await recruitmentPerformanceIntelligenceService.createAuraInsight(
        toActor(req),
        body,
      );
      res.status(201).json({
        data: {
          insight,
          invented: false as const,
          autoHiringDecision: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/aura-insights/:id/acknowledge', requireWrite, async (req, res) => {
    try {
      const body = ackInsightSchema.parse(req.body ?? {});
      const insight = await recruitmentPerformanceIntelligenceService.acknowledgeInsight(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          insight,
          invented: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
