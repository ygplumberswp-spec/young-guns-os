import { Router } from 'express';
import { z } from 'zod';
import type { ComplianceIntelligenceService } from '../services/compliance-intelligence.service.js';
import {
  ComplianceIntelligenceError,
  type CmiActor,
} from '../services/compliance-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const sansStatusSchema = z.enum(['tracked', 'retired', 'reference_only']);
const cocStatusSchema = z.enum([
  'intake',
  'documents_gathering',
  'inspection_pending',
  'review',
  'ready_for_issue',
  'issued',
  'expired',
  'cancelled',
]);

const upsertSansSchema = z.object({
  code: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(300),
  status: sansStatusSchema.optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const upsertCocSchema = z.object({
  title: z.string().trim().min(1).max(300),
  status: cocStatusSchema.optional(),
  documentId: z.string().uuid().nullable().optional(),
  jobId: z.string().uuid().nullable().optional(),
  propertyId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  sansStandardId: z.string().uuid().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const updateCocStatusSchema = z.object({
  status: cocStatusSchema,
  notes: z.string().trim().max(5000).optional(),
});

const runChecksSchema = z.object({
  jobId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
});

const refreshSchema = z.object({
  submitForApproval: z.boolean().optional(),
  reminderLeadDays: z.number().int().min(1).max(365).optional(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject', 'acknowledge']),
  notes: z.string().trim().max(2000).optional(),
});

const ackExpirySchema = z.object({
  status: z.enum(['acknowledged', 'dismissed', 'resolved']),
});

const createAuditPackSchema = z.object({
  title: z.string().trim().min(1).max(300),
  scopeNote: z.string().trim().max(5000).optional(),
  documentIds: z.array(z.string().uuid()).max(100).optional(),
});

const updateSettingsSchema = z.object({
  sansTrackingEnabled: z.boolean().optional(),
  cocWorkflowsEnabled: z.boolean().optional(),
  complianceChecksEnabled: z.boolean().optional(),
  expiryTrackingEnabled: z.boolean().optional(),
  auditPrepEnabled: z.boolean().optional(),
  reminderLeadDays: z.number().int().min(1).max(365).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const createInsightSchema = z.object({
  target: z.enum([
    'command_centre',
    'executive_dashboard',
    'documents',
    'document_intelligence',
    'legal_compliance',
    'properties',
    'jobs',
    'equipment',
    'operations',
  ]),
  title: z.string().trim().min(1).max(200),
  insight: z.string().trim().min(1).max(5000),
  href: z.string().trim().max(500).optional(),
  sourceRecommendationId: z.string().uuid().optional(),
});

const ackInsightSchema = z.object({
  status: z.enum(['acknowledged', 'dismissed']),
});

type RouterDeps = {
  complianceIntelligenceService: ComplianceIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): CmiActor {
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
  if (error instanceof ComplianceIntelligenceError) {
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

export function createComplianceIntelligenceRouter({
  complianceIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'legal_compliance:read',
    'legal_compliance:write',
    'legal_compliance:manage',
    'documents:read',
    'documents:write',
    'agents:read',
  );
  const requireWrite = requireAnyPermission(
    'legal_compliance:write',
    'legal_compliance:manage',
    'documents:write',
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
      const dashboard = await complianceIntelligenceService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoCertification: false as const,
          inventComplianceRecords: false as const,
          fakeComplianceRecords: false as const,
          autoExecuted: false as const,
          ownerControlled: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/sans-standards', requireWrite, async (req, res) => {
    try {
      const body = upsertSansSchema.parse(req.body ?? {});
      const standard = await complianceIntelligenceService.upsertSansStandard(toActor(req), body);
      res.status(201).json({
        data: {
          standard,
          inventComplianceRecords: false as const,
          fakeComplianceRecords: false as const,
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

  router.post('/coc-workflows', requireWrite, async (req, res) => {
    try {
      const body = upsertCocSchema.parse(req.body ?? {});
      const workflow = await complianceIntelligenceService.upsertCocWorkflow(toActor(req), body);
      res.status(201).json({
        data: {
          workflow,
          autoCertification: false as const,
          inventComplianceRecords: false as const,
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

  router.post('/coc-workflows/:id/status', requireWrite, async (req, res) => {
    try {
      const body = updateCocStatusSchema.parse(req.body ?? {});
      const workflow = await complianceIntelligenceService.updateCocWorkflowStatus(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          workflow,
          autoCertification: false as const,
          inventComplianceRecords: false as const,
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

  router.post('/checks/run', requireWrite, async (req, res) => {
    try {
      const body = runChecksSchema.parse(req.body ?? {});
      const result = await complianceIntelligenceService.runComplianceChecks(toActor(req), body);
      res.status(201).json({
        data: {
          ...result,
          autoCertification: false as const,
          inventComplianceRecords: false as const,
          fakeComplianceRecords: false as const,
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
      const body = refreshSchema.parse(req.body ?? {});
      const result = await complianceIntelligenceService.refreshRecommendations(toActor(req), body);
      res.status(201).json({
        data: {
          ...result,
          autoCertification: false as const,
          inventComplianceRecords: false as const,
          autoExecuted: false as const,
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

  router.post('/recommendations/:id/decide', requireWrite, async (req, res) => {
    try {
      const body = decideSchema.parse(req.body ?? {});
      const draft = await complianceIntelligenceService.decideRecommendation(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          draft,
          autoExecuted: false as const,
          autoCertification: false as const,
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

  router.post('/expiry/:id/acknowledge', requireWrite, async (req, res) => {
    try {
      const body = ackExpirySchema.parse(req.body ?? {});
      const item = await complianceIntelligenceService.acknowledgeExpiry(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          item,
          autoCertification: false as const,
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

  router.post('/audit-packs', requireWrite, async (req, res) => {
    try {
      const body = createAuditPackSchema.parse(req.body ?? {});
      const pack = await complianceIntelligenceService.createAuditPack(toActor(req), body);
      res.status(201).json({
        data: {
          pack,
          inventComplianceRecords: false as const,
          fakeComplianceRecords: false as const,
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
      const settings = await complianceIntelligenceService.updateSettings(toActor(req), body);
      res.json({
        data: {
          settings,
          autoCertification: false as const,
          inventComplianceRecords: false as const,
          autoExecuted: false as const,
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
      const insight = await complianceIntelligenceService.createAuraInsight(toActor(req), body);
      res.status(201).json({
        data: {
          insight,
          autoExecuted: false as const,
          inventComplianceRecords: false as const,
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
      const insight = await complianceIntelligenceService.acknowledgeAuraInsight(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          insight,
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

  return router;
}
