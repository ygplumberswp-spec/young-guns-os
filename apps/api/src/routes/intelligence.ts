import { Router } from 'express';
import { z } from 'zod';
import type { IntelligenceService } from '../services/intelligence.service.js';
import type { MemoryService } from '../services/memory.service.js';
import type { CompanyDayPlanService } from '../services/company-day-plan.service.js';
import type { CompanyDayPlanFollowUpsService } from '../services/company-day-plan-follow-ups.service.js';
import type { CompanyBusinessRulesService } from '../services/company-business-rules.service.js';
import { MemoryError } from '../services/memory.service.js';
import { DayPlanError } from '../services/company-day-plan.service.js';
import { DayPlanFollowUpError } from '../services/company-day-plan-follow-ups.service.js';
import { BusinessRuleError } from '../services/company-business-rules.service.js';
import type { RecommendationsService } from '../services/recommendations.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission, requireCompanyMemoryWrite } from '../middleware/rbac.js';

const memoryCategorySchema = z.enum(['business_rule', 'preference', 'process', 'note']);

const createMemorySchema = z.object({
  category: memoryCategorySchema.optional(),
  information: z.string().trim().min(1).max(4000),
  importance: z.number().int().min(1).max(5).optional(),
});

const updateMemorySchema = z.object({
  category: memoryCategorySchema.optional(),
  information: z.string().trim().min(1).max(4000).optional(),
  importance: z.number().int().min(1).max(5).optional(),
  enabled: z.boolean().optional(),
});

const dayPlanCategorySchema = z.enum([
  'marketing',
  'communications',
  'operations',
  'finance',
  'other',
]);
const dayPlanPrioritySchema = z.enum(['normal', 'high']);
const dayPlanStatusSchema = z.enum(['active', 'completed', 'archived']);

const createDayPlanSchema = z.object({
  content: z.string().trim().min(1).max(500),
  department: z.string().trim().max(120).optional(),
  category: dayPlanCategorySchema.optional(),
  priority: dayPlanPrioritySchema.optional(),
  planDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  assignedUserId: z.string().uuid().optional(),
  assignedAgentRole: z.string().trim().max(120).optional(),
  dueTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  approvalRequired: z.boolean().optional(),
  source: z.enum(['manual', 'aura_suggested', 'business_rule']).optional(),
  businessRuleId: z.string().uuid().optional(),
});

const updateDayPlanSchema = z.object({
  content: z.string().trim().min(1).max(500).optional(),
  department: z.string().trim().max(120).nullish(),
  category: dayPlanCategorySchema.nullish(),
  priority: dayPlanPrioritySchema.optional(),
  status: dayPlanStatusSchema.optional(),
  assignedUserId: z.string().uuid().nullish(),
  assignedAgentRole: z.string().trim().max(120).nullish(),
  dueTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullish(),
  progressPct: z.number().int().min(0).max(100).optional(),
  approvalRequired: z.boolean().optional(),
});

const followUpActionSchema = z.object({
  action: z.enum(['review', 'edit', 'approve', 'decline', 'assign', 'complete']),
  reason: z.string().trim().max(2000).optional(),
  nextAction: z.string().trim().max(500).optional(),
  responsibleAgent: z.string().trim().max(120).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assignedUserId: z.string().uuid().optional(),
});

const businessRuleTypeSchema = z.enum(['always_follow', 'scheduled', 'approval']);
const businessRuleCategorySchema = z.enum([
  'company_wide',
  'finance',
  'sales',
  'marketing',
  'operations',
  'customers',
  'workforce_payroll',
  'fleet',
  'stock_suppliers',
  'compliance',
]);
const businessRuleStatusSchema = z.enum(['active', 'paused', 'archived']);

const createBusinessRuleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  department: z.string().trim().max(120).optional(),
  instruction: z.string().trim().min(1).max(4000),
  ruleType: businessRuleTypeSchema.optional(),
  category: businessRuleCategorySchema.optional(),
  frequencyCron: z.string().trim().max(120).nullish(),
  assignedAgentRole: z.string().trim().max(120).nullish(),
  approvalRequired: z.boolean().optional(),
  approvalType: z.string().trim().max(120).nullish(),
});

const updateBusinessRuleSchema = createBusinessRuleSchema.partial().extend({
  status: businessRuleStatusSchema.optional(),
});

type IntelligenceRouterDeps = {
  intelligenceService: IntelligenceService;
  recommendationsService: RecommendationsService;
  memoryService: MemoryService;
  dayPlanService: CompanyDayPlanService;
  dayPlanFollowUpsService: CompanyDayPlanFollowUpsService;
  businessRulesService: CompanyBusinessRulesService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function parseOptionalPlanDate(queryDate: unknown): string | undefined {
  return typeof queryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)
    ? queryDate
    : undefined;
}

export function createIntelligenceRouter({
  intelligenceService,
  recommendationsService,
  memoryService,
  dayPlanService,
  dayPlanFollowUpsService,
  businessRulesService,
  teamService,
  jwtSecret,
  authService,
}: IntelligenceRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get(
    '/dashboard',
    requireAnyPermission('intelligence:read', 'intelligence:write', 'agents:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const dashboard = await intelligenceService.getDashboard(companyId);
      res.json({ data: { dashboard } });
    },
  );

  router.get(
    '/dashboard-summary',
    requireAnyPermission('intelligence:read', 'intelligence:write', 'agents:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const summary = await dayPlanFollowUpsService.getDashboardSummary(
        companyId,
        parseOptionalPlanDate(req.query.date),
      );
      res.json({ data: { summary } });
    },
  );

  router.get(
    '/recommendations',
    requireAnyPermission('intelligence:read', 'intelligence:write', 'agents:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const result = await recommendationsService.getRecommendations(companyId);
      res.json({ data: result });
    },
  );

  router.get(
    '/memory',
    requireAnyPermission('intelligence:read', 'intelligence:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const memories = await memoryService.listMemories(companyId);
      res.json({ data: { memories } });
    },
  );

  router.post(
    '/memory',
    requireAnyPermission('intelligence:write'),
    requireCompanyMemoryWrite(),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = createMemorySchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid memory payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const memory = await memoryService.createMemory(auth, parsed.data);
        res.status(201).json({ data: { memory } });
      } catch (error) {
        handleMemoryError(res, error);
      }
    },
  );

  router.patch(
    '/memory/:id',
    requireAnyPermission('intelligence:write'),
    requireCompanyMemoryWrite(),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = updateMemorySchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid memory payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const memoryId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const memory = await memoryService.updateMemory(auth, memoryId, parsed.data);
        res.json({ data: { memory } });
      } catch (error) {
        handleMemoryError(res, error);
      }
    },
  );

  router.delete(
    '/memory/:id',
    requireAnyPermission('intelligence:write'),
    requireCompanyMemoryWrite(),
    async (req, res) => {
      const auth = getAuth(req);

      try {
        const memoryId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const deleted = await memoryService.deleteMemory(auth, memoryId);

        if (!deleted) {
          res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Memory not found' } });
          return;
        }

        res.json({ data: { success: true } });
      } catch (error) {
        handleMemoryError(res, error);
      }
    },
  );

  router.get(
    '/day-plans/today',
    requireAnyPermission(
      'intelligence:read',
      'intelligence:write',
      'executive:read',
      'executive:write',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const today = await dayPlanService.getTodayPlan(companyId, parseOptionalPlanDate(req.query.date));
      res.json({ data: today });
    },
  );

  router.get(
    '/day-plans/morning-suggestions',
    requireAnyPermission(
      'intelligence:read',
      'intelligence:write',
      'executive:read',
      'executive:write',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const suggestions = await dayPlanService.getMorningSuggestions(
        companyId,
        parseOptionalPlanDate(req.query.date),
      );
      res.json({ data: suggestions });
    },
  );

  router.get(
    '/day-plans/follow-ups',
    requireAnyPermission(
      'intelligence:read',
      'intelligence:write',
      'executive:read',
      'executive:write',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const result = await dayPlanFollowUpsService.listFollowUps(
        companyId,
        parseOptionalPlanDate(req.query.date),
      );
      res.json({ data: result });
    },
  );

  router.post(
    '/day-plans/follow-ups/:customerId',
    requireAnyPermission('intelligence:write', 'executive:write'),
    requireCompanyMemoryWrite(),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = followUpActionSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid follow-up action payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const customerId = Array.isArray(req.params.customerId)
          ? req.params.customerId[0]
          : req.params.customerId;
        const item = await dayPlanFollowUpsService.applyFollowUpAction(
          auth,
          customerId,
          parsed.data,
          parseOptionalPlanDate(req.query.date),
        );
        res.json({ data: { followUp: item } });
      } catch (error) {
        handleFollowUpError(res, error);
      }
    },
  );

  router.get(
    '/day-plans',
    requireAnyPermission(
      'intelligence:read',
      'intelligence:write',
      'executive:read',
      'executive:write',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const result = await dayPlanService.listPlansForDate(
        companyId,
        parseOptionalPlanDate(req.query.date),
      );
      res.json({ data: result });
    },
  );

  router.post(
    '/day-plans',
    requireAnyPermission('intelligence:write', 'executive:write'),
    requireCompanyMemoryWrite(),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = createDayPlanSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid day plan payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const plan = await dayPlanService.createPlan(auth, parsed.data);
        res.status(201).json({ data: { plan } });
      } catch (error) {
        handleDayPlanError(res, error);
      }
    },
  );

  router.post(
    '/day-plans/parse',
    requireAnyPermission('intelligence:write', 'executive:write'),
    requireCompanyMemoryWrite(),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = z
        .object({
          text: z.string().trim().min(1).max(4000),
          planDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid day plan parse payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const result = await dayPlanService.parseNaturalLanguagePriorities(auth, parsed.data);
        res.json({ data: result });
      } catch (error) {
        handleDayPlanError(res, error);
      }
    },
  );

  router.post(
    '/day-plans/approve-suggestions',
    requireAnyPermission('intelligence:write', 'executive:write'),
    requireCompanyMemoryWrite(),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = z
        .object({
          planDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          items: z
            .array(
              z.object({
                content: z.string().trim().min(1).max(500),
                category: dayPlanCategorySchema.nullish(),
                priority: dayPlanPrioritySchema.optional(),
                department: z.string().trim().max(120).nullish(),
                approvalRequired: z.boolean().optional(),
              }),
            )
            .min(1)
            .max(40),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid day plan approval payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const result = await dayPlanService.approveParsedSuggestions(auth, parsed.data);
        res.status(201).json({ data: result });
      } catch (error) {
        handleDayPlanError(res, error);
      }
    },
  );

  router.patch(
    '/day-plans/:id',
    requireAnyPermission('intelligence:write', 'executive:write'),
    requireCompanyMemoryWrite(),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = updateDayPlanSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid day plan payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const planId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const plan = await dayPlanService.updatePlan(auth, planId, parsed.data);
        res.json({ data: { plan } });
      } catch (error) {
        handleDayPlanError(res, error);
      }
    },
  );

  router.delete(
    '/day-plans/:id',
    requireAnyPermission('intelligence:write', 'executive:write'),
    requireCompanyMemoryWrite(),
    async (req, res) => {
      const auth = getAuth(req);

      try {
        const planId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const deleted = await dayPlanService.deletePlan(auth, planId);

        if (!deleted) {
          res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Day plan not found' } });
          return;
        }

        res.json({ data: { success: true } });
      } catch (error) {
        handleDayPlanError(res, error);
      }
    },
  );

  router.get(
    '/business-rules',
    requireAnyPermission(
      'intelligence:read',
      'intelligence:write',
      'executive:read',
      'executive:write',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const rules = await businessRulesService.listRules(companyId);
      res.json({ data: { rules } });
    },
  );

  router.post(
    '/business-rules',
    requireAnyPermission('intelligence:write', 'executive:write'),
    requireCompanyMemoryWrite(),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = createBusinessRuleSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid business rule payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const rule = await businessRulesService.createRule(auth, parsed.data);
        res.status(201).json({ data: { rule } });
      } catch (error) {
        handleBusinessRuleError(res, error);
      }
    },
  );

  router.patch(
    '/business-rules/:id',
    requireAnyPermission('intelligence:write', 'executive:write'),
    requireCompanyMemoryWrite(),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = updateBusinessRuleSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid business rule payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const ruleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const rule = await businessRulesService.updateRule(auth, ruleId, parsed.data);
        res.json({ data: { rule } });
      } catch (error) {
        handleBusinessRuleError(res, error);
      }
    },
  );

  return router;
}

function handleMemoryError(res: import('express').Response, error: unknown) {
  if (error instanceof MemoryError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : error.code === 'DUPLICATE' ? 409 : 400;
    res.status(status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  throw error;
}

function handleDayPlanError(res: import('express').Response, error: unknown) {
  if (error instanceof DayPlanError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : error.code === 'DUPLICATE' ? 409 : 400;
    res.status(status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  throw error;
}

function handleFollowUpError(res: import('express').Response, error: unknown) {
  if (error instanceof DayPlanFollowUpError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  throw error;
}

function handleBusinessRuleError(res: import('express').Response, error: unknown) {
  if (error instanceof BusinessRuleError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : error.code === 'DUPLICATE' ? 409 : 400;
    res.status(status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  throw error;
}
