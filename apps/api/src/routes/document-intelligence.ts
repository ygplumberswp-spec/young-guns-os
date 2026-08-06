import { Router } from 'express';
import { z } from 'zod';
import type { DocumentIntelligenceService } from '../services/document-intelligence.service.js';
import {
  DocumentIntelligenceError,
  type DocIActor,
} from '../services/document-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const documentTypeSchema = z.enum([
  'coc',
  'quote',
  'invoice',
  'report',
  'warranty',
  'certificate',
  'photo',
  'other',
]);

const searchSchema = z.object({
  query: z.string().trim().max(200).optional(),
  documentType: documentTypeSchema.optional(),
  customerId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  expiringWithinDays: z.coerce.number().int().min(0).max(365).optional(),
  limit: z.coerce.number().int().min(1).max(250).optional(),
});

const upsertProfileSchema = z.object({
  documentId: z.string().uuid(),
  documentType: documentTypeSchema.optional(),
  propertyId: z.string().uuid().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const createVersionSchema = z.object({
  documentId: z.string().uuid(),
  title: z.string().trim().min(1).max(500).optional(),
  fileName: z.string().trim().min(1).max(500).optional(),
  fileType: z.string().trim().max(200).nullable().optional(),
  fileSizeBytes: z.number().int().nonnegative().nullable().optional(),
  changeNote: z.string().trim().max(2000).nullable().optional(),
});

const refreshSchema = z.object({
  submitForApproval: z.boolean().optional(),
  reminderLeadDays: z.number().int().min(1).max(365).optional(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject', 'acknowledge']),
  notes: z.string().trim().max(2000).optional(),
});

const ackReminderSchema = z.object({
  status: z.enum(['acknowledged', 'dismissed', 'resolved']),
});

const updateSettingsSchema = z.object({
  expiryRemindersEnabled: z.boolean().optional(),
  missingDocSuggestionsEnabled: z.boolean().optional(),
  reminderLeadDays: z.number().int().min(1).max(365).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const createInsightSchema = z.object({
  target: z.enum([
    'command_centre',
    'executive_dashboard',
    'documents',
    'customers',
    'jobs',
    'compliance',
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
  documentIntelligenceService: DocumentIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): DocIActor {
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
  if (error instanceof DocumentIntelligenceError) {
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

export function createDocumentIntelligenceRouter({
  documentIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission('documents:read', 'documents:write', 'agents:read');
  const requireWrite = requireAnyPermission('documents:write');

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
      const query = searchSchema.parse(req.query ?? {});
      const dashboard = await documentIntelligenceService.getDashboard(toActor(req), query);
      res.json({
        data: {
          dashboard,
          autoSendReminders: false as const,
          inventDocuments: false as const,
          fakeDocuments: false as const,
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

  router.get('/search', requireRead, async (req, res) => {
    try {
      const query = searchSchema.parse(req.query ?? {});
      const result = await documentIntelligenceService.searchDocuments(toActor(req), query);
      res.json({
        data: {
          ...result,
          inventDocuments: false as const,
          fakeDocuments: false as const,
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

  router.post('/profiles', requireWrite, async (req, res) => {
    try {
      const body = upsertProfileSchema.parse(req.body ?? {});
      const document = await documentIntelligenceService.upsertDocumentProfile(toActor(req), body);
      res.status(201).json({
        data: {
          document,
          inventDocuments: false as const,
          fakeDocuments: false as const,
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

  router.get('/documents/:id/versions', requireRead, async (req, res) => {
    try {
      const versions = await documentIntelligenceService.listVersions(toActor(req), paramId(req));
      res.json({
        data: {
          versions,
          inventDocuments: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/versions', requireWrite, async (req, res) => {
    try {
      const body = createVersionSchema.parse(req.body ?? {});
      const version = await documentIntelligenceService.createVersion(toActor(req), body);
      res.status(201).json({
        data: {
          version,
          inventDocuments: false as const,
          fakeDocuments: false as const,
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
      const result = await documentIntelligenceService.refreshRecommendations(toActor(req), body);
      res.status(201).json({
        data: {
          ...result,
          autoSendReminders: false as const,
          inventDocuments: false as const,
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
      const draft = await documentIntelligenceService.decideRecommendation(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          draft,
          autoExecuted: false as const,
          inventDocuments: false as const,
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

  router.post('/reminders/:id/acknowledge', requireWrite, async (req, res) => {
    try {
      const body = ackReminderSchema.parse(req.body ?? {});
      const reminder = await documentIntelligenceService.acknowledgeReminder(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          reminder,
          autoSendReminders: false as const,
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
      const settings = await documentIntelligenceService.updateSettings(toActor(req), body);
      res.json({
        data: {
          settings,
          autoSendReminders: false as const,
          inventDocuments: false as const,
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
      const insight = await documentIntelligenceService.createAuraInsight(toActor(req), body);
      res.status(201).json({
        data: {
          insight,
          autoExecuted: false as const,
          inventDocuments: false as const,
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
      const insight = await documentIntelligenceService.acknowledgeAuraInsight(
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
