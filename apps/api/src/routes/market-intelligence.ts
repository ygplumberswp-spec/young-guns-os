import { Router } from 'express';
import { z } from 'zod';
import {
  canAccessMarketIntelligence,
  MKT_LOOKBACK_MAX_DAYS,
  MKT_LOOKBACK_MIN_DAYS,
  MKT_MIN_EVIDENCE_CEILING,
  MKT_MIN_EVIDENCE_FLOOR,
  MKT_STALENESS_MAX_DAYS,
  MKT_STALENESS_MIN_DAYS,
  MKT_TOPICS,
  type MktTopic,
} from '@titan/shared';
import type { MarketIntelligenceService } from '../services/market-intelligence.service.js';
import {
  MarketIntelligenceError,
  type MktActor,
} from '../services/market-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';

const topicSchema = z.enum(MKT_TOPICS as unknown as [MktTopic, ...MktTopic[]]);
const originSchema = z.enum(['own_records', 'connected_provider', 'public_source', 'manual_entry']);

const updateSettingsSchema = z.object({
  lookbackDays: z.number().int().min(MKT_LOOKBACK_MIN_DAYS).max(MKT_LOOKBACK_MAX_DAYS).optional(),
  stalenessDays: z
    .number()
    .int()
    .min(MKT_STALENESS_MIN_DAYS)
    .max(MKT_STALENESS_MAX_DAYS)
    .optional(),
  minEvidenceRecords: z
    .number()
    .int()
    .min(MKT_MIN_EVIDENCE_FLOOR)
    .max(MKT_MIN_EVIDENCE_CEILING)
    .optional(),
  requireRegisteredSource: z.boolean().optional(),
  publishApprovedOnly: z.boolean().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const registerSourceSchema = z.object({
  sourceKey: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200),
  origin: originSchema,
  /**
   * Registering a source is an attestation that it is a supported public
   * source or connected provider that may lawfully be used, so the flag is
   * required rather than defaulted.
   */
  permitted: z.literal(true),
  verified: z.boolean().optional(),
  reference: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const updateSourceSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  permitted: z.boolean().optional(),
  verified: z.boolean().optional(),
  reference: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const decideInsightSchema = z.object({
  decision: z.enum(['approve', 'reject', 'archive', 'reopen']),
  notes: z.string().trim().max(2000).optional(),
});

const createOpportunitySchema = z.object({
  insightKey: z.string().trim().max(500).nullable().optional(),
  topic: topicSchema.nullable().optional(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  submitForApproval: z.boolean().optional(),
});

const decideOpportunitySchema = z.object({
  decision: z.enum(['approve', 'reject', 'acknowledge']),
  notes: z.string().trim().max(2000).optional(),
});

const refreshSchema = z.object({
  submitForApproval: z.boolean().optional(),
});

type RouterDeps = {
  marketIntelligenceService: MarketIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): MktActor {
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
  if (error instanceof MarketIntelligenceError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

export function createMarketIntelligenceRouter({
  marketIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);

  /**
   * Technicians and clients are refused outright, and a marketing user is only
   * admitted to the approved view. The service re-checks the same rules before
   * anything leaves it, so this guard cannot be bypassed.
   */
  router.use((req, res, next) => {
    const auth = getAuth(req);
    if (!canAccessMarketIntelligence({ roleName: auth.roleName, permissions: auth.permissions })) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message:
            'Market Intelligence is not available to this role. Market strategy, pricing and competitor topics are restricted.',
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
      const dashboard = await marketIntelligenceService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoActioned: false as const,
          autoExecuted: false as const,
          inventedMarketData: false as const,
          externalFetchPerformed: false as const,
          fakeBusinessData: false as const,
          approvalRequired: true as const,
          financeSensitiveOwnerOnly: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/settings', async (req, res) => {
    try {
      const settings = await marketIntelligenceService.getSettings(toActor(req));
      res.json({ data: { settings, financeSensitiveOwnerOnly: true as const } });
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
      const settings = await marketIntelligenceService.updateSettings(toActor(req), parsed.data);
      res.json({
        data: {
          settings,
          autoActioned: false as const,
          inventedMarketData: false as const,
          externalFetchPerformed: false as const,
          financeSensitiveOwnerOnly: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/sources', async (req, res) => {
    try {
      const sources = await marketIntelligenceService.listSources(toActor(req));
      res.json({ data: { sources, externalFetchPerformed: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/sources', async (req, res) => {
    const parsed = registerSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID',
          message:
            'Invalid source payload. A source can only be registered once the Owner confirms it is supported and may lawfully be used.',
        },
      });
      return;
    }
    try {
      const source = await marketIntelligenceService.registerSource(toActor(req), parsed.data);
      res.status(201).json({
        data: {
          source,
          externalFetchPerformed: false as const,
          ownerAttestedLawful: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.patch('/sources/:id', async (req, res) => {
    const sourceId = z.string().uuid().safeParse(paramValue(req, 'id'));
    const parsed = updateSourceSchema.safeParse(req.body);
    if (!sourceId.success || !parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid source payload.' } });
      return;
    }
    try {
      const source = await marketIntelligenceService.updateSource(
        toActor(req),
        sourceId.data,
        parsed.data,
      );
      res.json({ data: { source, externalFetchPerformed: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/insights/:insightKey/decide', async (req, res) => {
    const parsed = decideInsightSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid decision payload.' } });
      return;
    }
    try {
      const result = await marketIntelligenceService.decideInsight(
        toActor(req),
        decodeURIComponent(paramValue(req, 'insightKey')),
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

  router.get('/insights/:insightKey/audit', async (req, res) => {
    try {
      const entries = await marketIntelligenceService.listInsightAudit(
        toActor(req),
        decodeURIComponent(paramValue(req, 'insightKey')),
      );
      res.json({ data: { entries, historyPreserved: true as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/audit', async (req, res) => {
    try {
      const entries = await marketIntelligenceService.listCompanyAudit(toActor(req));
      res.json({ data: { entries, historyPreserved: true as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/opportunities', async (req, res) => {
    try {
      const opportunities = await marketIntelligenceService.listOpportunities(toActor(req));
      res.json({
        data: {
          opportunities,
          approvalRequired: true as const,
          autoExecuted: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/opportunities', async (req, res) => {
    const parsed = createOpportunitySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'INVALID', message: 'Invalid recommendation payload.' } });
      return;
    }
    try {
      const opportunity = await marketIntelligenceService.createOpportunity(
        toActor(req),
        parsed.data,
      );
      res.status(201).json({
        data: {
          opportunity,
          approvalRequired: true as const,
          autoExecuted: false as const,
          inventedMarketData: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/opportunities/refresh', async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid refresh payload.' } });
      return;
    }
    try {
      const opportunities = await marketIntelligenceService.refreshOpportunities(
        toActor(req),
        parsed.data,
      );
      res.json({
        data: {
          opportunities,
          approvalRequired: true as const,
          autoExecuted: false as const,
          inventedMarketData: false as const,
          externalFetchPerformed: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/opportunities/:id/decide', async (req, res) => {
    const opportunityId = z.string().uuid().safeParse(paramValue(req, 'id'));
    const parsed = decideOpportunitySchema.safeParse(req.body);
    if (!opportunityId.success || !parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid decision payload.' } });
      return;
    }
    try {
      const opportunity = await marketIntelligenceService.decideOpportunity(
        toActor(req),
        opportunityId.data,
        parsed.data,
      );
      res.json({
        data: {
          opportunity,
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
