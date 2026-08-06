import { Router } from 'express';
import { z } from 'zod';
import type { FinanceAuraAgentService } from '../services/finance-aura-agent.service.js';
import {
  FinanceAuraAgentError,
  type FinanceAuraActor,
} from '../services/finance-aura-agent.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const recommendationKindSchema = z.enum([
  'collections',
  'cashflow',
  'receivables_review',
  'payment_follow_up',
  'xero_reconciliation',
  'job_profitability_review',
  'owner_decision',
  'aura_handoff',
]);

const createRecommendationSchema = z.object({
  kind: recommendationKindSchema,
  title: z.string().trim().min(1).max(200),
  recommendation: z.string().trim().min(1).max(5000),
  sourceInvoiceId: z.string().uuid().optional(),
  sourcePaymentId: z.string().uuid().optional(),
  sourceJobId: z.string().uuid().optional(),
  sourceCustomerId: z.string().uuid().optional(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(2000).optional(),
});

const askSchema = z.object({
  question: z.string().trim().min(1).max(2000),
});

const acknowledgeSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

type RouterDeps = {
  financeAuraAgentService: FinanceAuraAgentService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): FinanceAuraActor {
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
  if (error instanceof FinanceAuraAgentError) {
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
        message: 'Finance AURA Agent is Owner / finance-access only. Technician and Client are denied.',
      },
    });
    return;
  }
  next();
}

export function createFinanceAuraAgentRouter({
  financeAuraAgentService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'finance:read',
    'finance:write',
    'agents:read',
    '*',
  );
  const requireWrite = requireAnyPermission('finance:write', 'agents:write', '*');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });
  router.use(denyTechnicianClient);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await financeAuraAgentService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoExecuted: false as const,
          fakeDataInvented: false as const,
          technicianClientDenied: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to load Finance AURA Agent dashboard' },
        });
      }
    }
  });

  router.post('/register', requireWrite, async (req, res) => {
    try {
      const registry = await financeAuraAgentService.ensureAgentRegistered(toActor(req));
      res.json({
        data: {
          registry,
          identity: dashboardIdentity(),
          autoExecuted: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to register Finance AURA Agent' },
        });
      }
    }
  });

  router.get('/context', requireRead, async (req, res) => {
    try {
      const context = await financeAuraAgentService.getBusinessContext(toActor(req));
      res.json({
        data: {
          context,
          fakeDataInvented: false as const,
          autoExecuted: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to load finance business context' },
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
      const answer = await financeAuraAgentService.askQuestion(toActor(req), parsed.data);
      res.json({
        data: {
          answer,
          autoExecuted: false as const,
          fakeDataInvented: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to answer finance question' },
        });
      }
    }
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    try {
      const recommendations = await financeAuraAgentService.listRecommendations(toActor(req));
      res.json({ data: { recommendations, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to list finance recommendations' },
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
      const recommendation = await financeAuraAgentService.createRecommendation(
        toActor(req),
        parsed.data,
      );
      res.json({ data: { recommendation, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to create finance recommendation' },
        });
      }
    }
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    try {
      const recommendations = await financeAuraAgentService.generateRecommendationsFromSignals(
        toActor(req),
      );
      res.json({
        data: {
          recommendations,
          autoExecuted: false as const,
          note: 'Draft recommendations queued for Owner approval — no financial mutations executed.',
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to generate finance recommendations' },
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
      const recommendation = await financeAuraAgentService.decideRecommendation(
        toActor(req),
        paramId(req),
        parsed.data,
      );
      res.json({
        data: {
          recommendation,
          autoExecuted: false as const,
          note: 'Owner decision recorded — no invoice, payment, or Xero mutation was executed.',
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to decide finance recommendation' },
        });
      }
    }
  });

  router.get('/insights', requireRead, async (req, res) => {
    try {
      const insights = await financeAuraAgentService.listInsights(toActor(req));
      res.json({ data: { insights, fakeDataInvented: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to list finance insights' },
        });
      }
    }
  });

  router.post('/insights/refresh', requireWrite, async (req, res) => {
    try {
      const insights = await financeAuraAgentService.refreshInsights(toActor(req));
      res.json({
        data: {
          insights,
          fakeDataInvented: false as const,
          autoExecuted: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to refresh finance insights' },
        });
      }
    }
  });

  router.get('/alerts', requireRead, async (req, res) => {
    try {
      const alerts = await financeAuraAgentService.listAlerts(toActor(req));
      res.json({ data: { alerts, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to list finance alerts' },
        });
      }
    }
  });

  router.post('/alerts/refresh', requireWrite, async (req, res) => {
    try {
      const alerts = await financeAuraAgentService.refreshAlerts(toActor(req));
      res.json({
        data: {
          alerts,
          autoExecuted: false as const,
          note: 'Alerts refreshed from real TITAN signals only.',
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to refresh finance alerts' },
        });
      }
    }
  });

  router.post('/alerts/:id/acknowledge', requireWrite, async (req, res) => {
    const parsed = acknowledgeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const alert = await financeAuraAgentService.acknowledgeAlert(
        toActor(req),
        paramId(req),
        parsed.data,
      );
      res.json({ data: { alert, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to acknowledge finance alert' },
        });
      }
    }
  });

  return router;
}

function dashboardIdentity() {
  return {
    agentKey: 'finance' as const,
    autoExecuteFinancialMutations: false as const,
  };
}
