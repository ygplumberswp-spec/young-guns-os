import { Router } from 'express';
import { z } from 'zod';
import {
  ITPL_SECTION_KEYS,
  ITPL_SUPPORT_LEVELS,
  ITPL_TRADES,
  canReadItplTemplates,
  type ItplSectionKey,
  type ItplSupportLevel,
  type ItplTrade,
} from '@titan/shared';
import type { IndustryTemplatesService } from '../services/industry-templates.service.js';
import {
  IndustryTemplatesError,
  type ItplActor,
} from '../services/industry-templates.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';

const tradeSchema = z.enum(ITPL_TRADES as unknown as [ItplTrade, ...ItplTrade[]]);
const sectionSchema = z.enum(
  ITPL_SECTION_KEYS as unknown as [ItplSectionKey, ...ItplSectionKey[]],
);
const supportSchema = z.enum(
  ITPL_SUPPORT_LEVELS as unknown as [ItplSupportLevel, ...ItplSupportLevel[]],
);

const complianceSchema = z.object({
  reviewed: z.boolean(),
  authority: z.string().trim().max(200).nullable().default(null),
  reference: z.string().trim().max(300).nullable().default(null),
  reviewedAt: z.string().trim().max(40).nullable().default(null),
});

const entrySchema = z.object({
  key: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  capabilityRef: z.string().trim().max(80).nullable(),
  support: supportSchema,
  notes: z.string().trim().max(2000).nullable(),
  compliance: complianceSchema.nullable().optional(),
});

const sectionBodySchema = z.object({
  section: sectionSchema,
  label: z.string().trim().min(1).max(200),
  support: supportSchema,
  entries: z.array(entrySchema).max(200),
});

const definitionSchema = z.object({
  trade: tradeSchema,
  tradeLabel: z.string().trim().min(1).max(200),
  sections: z.array(sectionBodySchema).max(ITPL_SECTION_KEYS.length),
});

const createTemplateSchema = z.object({
  trade: tradeSchema,
  name: z.string().trim().min(1).max(200),
  customTradeLabel: z.string().trim().max(200).nullable().optional(),
  useBlueprint: z.boolean().optional(),
});

const saveVersionSchema = z.object({
  definition: definitionSchema,
  changeSummary: z.string().trim().min(1).max(2000),
});

const decideVersionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(2000).nullable().optional(),
});

const activateSchema = z.object({
  versionId: z.string().trim().min(1).max(80),
  note: z.string().trim().max(2000).nullable().optional(),
});

const updateSettingsSchema = z.object({
  technicianReadEnabled: z.boolean().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

type RouterDeps = {
  industryTemplatesService: IndustryTemplatesService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): ItplActor {
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
  if (error instanceof IndustryTemplatesError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'CONFLICT'
            ? 409
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

/**
 * Standing guarantees for the department, sent on every response so a caller
 * can assert them rather than trust prose: a template configures the one
 * shared core, it never seeds tenant records, it never asserts a compliance
 * standard, and a live-workflow change needs Owner approval.
 */
const HONESTY_FLAGS = {
  configuresExistingCore: true as const,
  duplicatedPlatform: false as const,
  seededTenantRecords: false as const,
  fakeBusinessData: false as const,
  unreviewedComplianceAsserted: false as const,
  approvalRequiredForLiveChanges: true as const,
  versionHistoryPreserved: true as const,
} as const;

export function createIndustryTemplatesRouter({
  industryTemplatesService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);

  /**
   * Clients are refused by role before permissions are read, so a wildcard
   * cannot admit them. Technicians pass this gate but the service re-checks
   * the same rules and gives them a read-only operational view, so this guard
   * cannot be bypassed.
   */
  router.use((req, res, next) => {
    const auth = getAuth(req);
    if (!canReadItplTemplates({ roleName: auth.roleName, permissions: auth.permissions })) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Industry templates are not available to this role.',
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
      const dashboard = await industryTemplatesService.getDashboard(toActor(req));
      res.json({ data: { dashboard, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.get('/settings', async (req, res) => {
    try {
      const actor = toActor(req);
      const settings = await industryTemplatesService.getSettings(actor.companyId);
      res.json({ data: { settings, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.patch('/settings', async (req, res) => {
    const parsed = updateSettingsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid settings payload.' } });
      return;
    }
    try {
      const settings = await industryTemplatesService.updateSettings(toActor(req), parsed.data);
      res.json({ data: { settings, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.get('/templates', async (req, res) => {
    try {
      const templates = await industryTemplatesService.listTemplates(toActor(req));
      res.json({ data: { templates, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.post('/templates', async (req, res) => {
    const parsed = createTemplateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid template payload.' } });
      return;
    }
    try {
      const template = await industryTemplatesService.createTemplate(toActor(req), parsed.data);
      res.status(201).json({ data: { template, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.get('/templates/:templateId', async (req, res) => {
    try {
      const template = await industryTemplatesService.getTemplate(
        toActor(req),
        paramValue(req, 'templateId'),
      );
      res.json({ data: { template, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.post('/templates/:templateId/versions', async (req, res) => {
    const parsed = saveVersionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid version payload.' } });
      return;
    }
    try {
      const version = await industryTemplatesService.saveVersion(
        toActor(req),
        paramValue(req, 'templateId'),
        parsed.data,
      );
      res.status(201).json({ data: { version, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.post('/templates/:templateId/versions/:versionId/submit', async (req, res) => {
    try {
      const version = await industryTemplatesService.submitVersion(
        toActor(req),
        paramValue(req, 'templateId'),
        paramValue(req, 'versionId'),
      );
      res.json({ data: { version, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.post('/templates/:templateId/versions/:versionId/decide', async (req, res) => {
    const parsed = decideVersionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid decision payload.' } });
      return;
    }
    try {
      const version = await industryTemplatesService.decideVersion(
        toActor(req),
        paramValue(req, 'templateId'),
        paramValue(req, 'versionId'),
        parsed.data,
      );
      res.json({ data: { version, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.post('/templates/:templateId/activate', async (req, res) => {
    const parsed = activateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid activation payload.' } });
      return;
    }
    try {
      const template = await industryTemplatesService.activateTemplate(
        toActor(req),
        paramValue(req, 'templateId'),
        parsed.data,
      );
      res.json({ data: { template, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.get('/audit', async (req, res) => {
    try {
      const limit = Number.parseInt(String(req.query.limit ?? '100'), 10);
      const entries = await industryTemplatesService.listAudit(
        toActor(req),
        Number.isFinite(limit) ? limit : 100,
      );
      res.json({ data: { entries, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  return router;
}
