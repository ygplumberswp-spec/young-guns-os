import { Router } from 'express';
import { z } from 'zod';
import type { SalesIntelligenceAgentService } from '../services/sales-intelligence-agent.service.js';
import {
  SalesIntelligenceAgentError,
  type SalesIntelligenceActor,
} from '../services/sales-intelligence-agent.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const recommendationKindSchema = z.enum([
  'outreach_draft',
  'follow_up',
  'lead_priority',
  'quote_follow_up',
  'pipeline_advance',
  'revenue_opportunity',
  'best_next_action',
  'owner_decision',
  'aura_handoff',
]);

const createRecommendationSchema = z.object({
  kind: recommendationKindSchema,
  title: z.string().trim().min(1).max(200),
  recommendation: z.string().trim().min(1).max(5000),
  draftOutreach: z.string().trim().max(5000).optional(),
  sourceLeadId: z.string().uuid().optional(),
  sourceOpportunityId: z.string().uuid().optional(),
  sourceQuoteId: z.string().uuid().optional(),
  sourceCustomerId: z.string().uuid().optional(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(2000).optional(),
});

const askSchema = z.object({
  question: z.string().trim().min(1).max(2000),
});

type RouterDeps = {
  salesIntelligenceAgentService: SalesIntelligenceAgentService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): SalesIntelligenceActor {
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
  if (error instanceof SalesIntelligenceAgentError) {
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

/** Deny Technician/Client even if a wildcard somehow appears on the token. */
function denyTechnicianClient(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
): void {
  const role = getAuth(req).roleName;
  if (role === 'Technician' || role === 'Client') {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message:
          'Sales Intelligence Agent is Owner / sales-access only. Technician and Client are denied.',
      },
    });
    return;
  }
  next();
}

export function createSalesIntelligenceAgentRouter({
  salesIntelligenceAgentService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'sales:read',
    'sales:write',
    'sales_intelligence:read',
    'sales_intelligence:write',
    'sales_intelligence:manage',
    'leads:read',
    'leads:write',
    'agents:read',
    '*',
  );
  const requireWrite = requireAnyPermission(
    'sales:write',
    'sales_intelligence:write',
    'sales_intelligence:manage',
    'leads:write',
    'agents:write',
    '*',
  );

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });
  router.use(denyTechnicianClient);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await salesIntelligenceAgentService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoExecuted: false as const,
          outreachSent: false as const,
          fakeDataInvented: false as const,
          technicianClientDenied: true as const,
          spamProhibited: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to load Sales Intelligence Agent dashboard' },
        });
      }
    }
  });

  router.post('/register', requireWrite, async (req, res) => {
    try {
      const registry = await salesIntelligenceAgentService.ensureAgentRegistered(toActor(req));
      res.json({
        data: {
          registry,
          identity: dashboardIdentity(),
          autoExecuted: false as const,
          outreachSent: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to register Sales Intelligence Agent' },
        });
      }
    }
  });

  router.get('/context', requireRead, async (req, res) => {
    try {
      const context = await salesIntelligenceAgentService.getBusinessContext(toActor(req));
      res.json({
        data: {
          context,
          fakeDataInvented: false as const,
          autoExecuted: false as const,
          outreachSent: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to load sales business context' },
        });
      }
    }
  });

  router.post('/ask', requireRead, async (req, res) => {
    const parsed = askSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const answer = await salesIntelligenceAgentService.askQuestion(toActor(req), parsed.data);
      res.json({
        data: {
          answer,
          autoExecuted: false as const,
          outreachSent: false as const,
          fakeDataInvented: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to answer sales question' },
        });
      }
    }
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    try {
      const recommendations = await salesIntelligenceAgentService.listRecommendations(toActor(req));
      res.json({
        data: {
          recommendations,
          autoExecuted: false as const,
          outreachSent: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to list sales recommendations' },
        });
      }
    }
  });

  router.post('/recommendations', requireWrite, async (req, res) => {
    const parsed = createRecommendationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const recommendation = await salesIntelligenceAgentService.createRecommendation(
        toActor(req),
        parsed.data,
      );
      res.json({
        data: {
          recommendation,
          autoExecuted: false as const,
          outreachSent: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to create sales recommendation' },
        });
      }
    }
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    try {
      const recommendations =
        await salesIntelligenceAgentService.generateRecommendationsFromSignals(toActor(req));
      res.json({
        data: {
          recommendations,
          autoExecuted: false as const,
          outreachSent: false as const,
          note: 'Draft recommendations queued for Owner approval — no outreach was sent.',
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to generate sales recommendations' },
        });
      }
    }
  });

  router.post('/recommendations/:id/decide', requireWrite, async (req, res) => {
    const parsed = decideSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const recommendation = await salesIntelligenceAgentService.decideRecommendation(
        toActor(req),
        paramId(req),
        parsed.data,
      );
      res.json({
        data: {
          recommendation,
          autoExecuted: false as const,
          outreachSent: false as const,
          note: 'Owner decision recorded — no outreach message was sent and no CRM mutation was executed.',
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to decide sales recommendation' },
        });
      }
    }
  });

  router.get('/insights', requireRead, async (req, res) => {
    try {
      const insights = await salesIntelligenceAgentService.listInsights(toActor(req));
      res.json({ data: { insights, fakeDataInvented: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to list sales insights' },
        });
      }
    }
  });

  router.post('/insights/refresh', requireWrite, async (req, res) => {
    try {
      const insights = await salesIntelligenceAgentService.refreshInsights(toActor(req));
      res.json({
        data: {
          insights,
          fakeDataInvented: false as const,
          autoExecuted: false as const,
          outreachSent: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to refresh sales insights' },
        });
      }
    }
  });

  router.get('/signals', requireRead, async (req, res) => {
    try {
      const signals = await salesIntelligenceAgentService.listSignals(toActor(req));
      res.json({
        data: {
          signals,
          autoExecuted: false as const,
          fakeDataInvented: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to list sales opportunity signals' },
        });
      }
    }
  });

  router.post('/signals/refresh', requireWrite, async (req, res) => {
    try {
      const signals = await salesIntelligenceAgentService.refreshSignals(toActor(req));
      res.json({
        data: {
          signals,
          autoExecuted: false as const,
          outreachSent: false as const,
          note: 'Opportunity signals refreshed from real CRM/leads/quotes/pipeline only.',
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to refresh sales opportunity signals' },
        });
      }
    }
  });

  return router;
}

function dashboardIdentity() {
  return {
    agentKey: 'sales' as const,
    chatAgentKey: 'sales_intelligence' as const,
    autoExecuteOutreach: false as const,
  };
}
