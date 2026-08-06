import { Router } from 'express';
import { z } from 'zod';
import {
  canAccessSmartNotifications,
  SN_CATEGORIES,
  SN_MAX_SNOOZE_MINUTES,
  SN_MIN_SNOOZE_MINUTES,
  type SnCategory,
} from '@titan/shared';
import type { SmartNotificationIntelligenceService } from '../services/smart-notification-intelligence.service.js';
import {
  SmartNotificationIntelligenceError,
  type SnActor,
} from '../services/smart-notification-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';

const categorySchema = z.enum(SN_CATEGORIES as unknown as [SnCategory, ...SnCategory[]]);
const severitySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);

const updateSettingsSchema = z.object({
  groupDuplicatesEnabled: z.boolean().optional(),
  dailyBriefEnabled: z.boolean().optional(),
  maxFeedItems: z.number().int().min(1).max(200).optional(),
  maxBriefItems: z.number().int().min(1).max(50).optional(),
  globalMinSeverity: severitySchema.optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const updateCategorySchema = z.object({
  enabled: z.boolean().optional(),
  minSeverity: severitySchema.optional(),
  digestOnly: z.boolean().optional(),
});

const signalActionSchema = z.object({
  groupKey: z.string().trim().min(1).max(500),
  action: z.enum(['acknowledge', 'snooze', 'dismiss', 'escalate', 'reopen']),
  snoozeMinutes: z
    .number()
    .int()
    .min(SN_MIN_SNOOZE_MINUTES)
    .max(SN_MAX_SNOOZE_MINUTES)
    .optional(),
  notes: z.string().trim().max(2000).optional(),
});

const createActionSchema = z.object({
  groupKey: z.string().trim().max(500).nullable().optional(),
  category: categorySchema.nullable().optional(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  submitForApproval: z.boolean().optional(),
});

const decideActionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'acknowledge']),
  notes: z.string().trim().max(2000).optional(),
});

const refreshSchema = z.object({
  submitForApproval: z.boolean().optional(),
});

type RouterDeps = {
  smartNotificationIntelligenceService: SmartNotificationIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): SnActor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function paramValue(req: import('express').Request, key: string): string {
  const raw = req.params[key];
  return String(Array.isArray(raw) ? raw[0] : (raw ?? ''));
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof SmartNotificationIntelligenceError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

export function createSmartNotificationIntelligenceRouter({
  smartNotificationIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);

  /**
   * Any signed-in role may open a feed, but the service decides what it holds:
   * technicians see their own assigned work, clients their own records, and
   * sensitive finance, payroll, security and strategy categories stay Owner
   * only. The service re-checks the same rules so this guard cannot be bypassed.
   */
  router.use((req, res, next) => {
    const auth = getAuth(req);
    if (!canAccessSmartNotifications({ roleName: auth.roleName, permissions: auth.permissions })) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Smart Notifications requires a signed-in role on this company.',
        },
      });
      return;
    }
    next();
  });

  router.use(async (req, _res, next) => {
    try {
      await teamService.ensureDefaultRoles(getAuth(req).companyId);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/dashboard', async (req, res) => {
    try {
      const dashboard = await smartNotificationIntelligenceService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoActioned: false as const,
          autoExecuted: false as const,
          inventSignals: false as const,
          fakeBusinessData: false as const,
          approvalRequired: true as const,
          sensitiveCategoriesOwnerOnly: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/settings', async (req, res) => {
    try {
      const settings = await smartNotificationIntelligenceService.getSettings(toActor(req));
      res.json({ data: { settings, sensitiveCategoriesOwnerOnly: true as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.patch('/settings', async (req, res) => {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid settings payload.' } });
      return;
    }
    try {
      const settings = await smartNotificationIntelligenceService.updateSettings(
        toActor(req),
        parsed.data,
      );
      res.json({
        data: {
          settings,
          autoActioned: false as const,
          inventSignals: false as const,
          sensitiveCategoriesOwnerOnly: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/categories', async (req, res) => {
    try {
      const controls = await smartNotificationIntelligenceService.listCategoryControls(
        toActor(req),
      );
      res.json({ data: { controls, sensitiveCategoriesOwnerOnly: true as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.patch('/categories/:category', async (req, res) => {
    const category = categorySchema.safeParse(paramValue(req, 'category'));
    const parsed = updateCategorySchema.safeParse(req.body);
    if (!category.success || !parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid category payload.' } });
      return;
    }
    try {
      const control = await smartNotificationIntelligenceService.updateCategoryControl(
        toActor(req),
        category.data,
        parsed.data,
      );
      res.json({
        data: {
          control,
          autoActioned: false as const,
          sensitiveCategoriesOwnerOnly: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/signals/act', async (req, res) => {
    const parsed = signalActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid signal action payload.' } });
      return;
    }
    try {
      const result = await smartNotificationIntelligenceService.actOnSignal(
        toActor(req),
        parsed.data,
      );
      res.json({
        data: {
          ...result,
          autoActioned: false as const,
          historyPreserved: true as const,
          executedDownstreamChange: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/signals/:groupKey/audit', async (req, res) => {
    try {
      const entries = await smartNotificationIntelligenceService.listSignalAudit(
        toActor(req),
        decodeURIComponent(paramValue(req, 'groupKey')),
      );
      res.json({ data: { entries, historyPreserved: true as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/audit', async (req, res) => {
    try {
      const entries = await smartNotificationIntelligenceService.listCompanyAudit(toActor(req));
      res.json({ data: { entries, historyPreserved: true as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/actions', async (req, res) => {
    try {
      const actions = await smartNotificationIntelligenceService.listActionDrafts(toActor(req));
      res.json({
        data: {
          actions,
          approvalRequired: true as const,
          autoExecuted: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/actions', async (req, res) => {
    const parsed = createActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid recommendation payload.' } });
      return;
    }
    try {
      const action = await smartNotificationIntelligenceService.createActionDraft(
        toActor(req),
        parsed.data,
      );
      res.status(201).json({
        data: {
          action,
          approvalRequired: true as const,
          autoExecuted: false as const,
          inventSignals: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/actions/refresh', async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid refresh payload.' } });
      return;
    }
    try {
      const actions = await smartNotificationIntelligenceService.refreshActionDrafts(
        toActor(req),
        parsed.data,
      );
      res.json({
        data: {
          actions,
          approvalRequired: true as const,
          autoExecuted: false as const,
          inventSignals: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/actions/:id/decide', async (req, res) => {
    const actionId = z.string().uuid().safeParse(paramValue(req, 'id'));
    const parsed = decideActionSchema.safeParse(req.body);
    if (!actionId.success || !parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid decision payload.' } });
      return;
    }
    try {
      const action = await smartNotificationIntelligenceService.decideActionDraft(
        toActor(req),
        actionId.data,
        parsed.data,
      );
      res.json({
        data: {
          action,
          autoExecuted: false as const,
          executedDownstreamChange: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
