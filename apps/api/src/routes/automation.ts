import { Router } from 'express';
import { z } from 'zod';
import type { AutomationService } from '../services/automation.service.js';
import { AutomationError } from '../services/automation.service.js';
import type { WorkflowEngineService } from '../services/workflow-engine.service.js';
import { WorkflowEngineError } from '../services/workflow-engine.service.js';
import type { WorkflowStudioService } from '../services/workflow-studio.service.js';
import { WorkflowStudioError } from '../services/workflow-studio.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const workflowStatusSchema = z.enum(['draft', 'pending_approval', 'active', 'paused']);
const triggerTypeSchema = z.enum([
  'manual',
  'job_created',
  'job_status_changed',
  'job_scheduled',
  'job_booked',
  'job_assigned',
  'job_completed',
  'customer_created',
  'customer_updated',
  'quote_created',
  'quote_accepted',
  'invoice_created',
  'payment_received',
  'invoice_overdue',
  'lead_created',
  'lead_converted',
  'stock_threshold_reached',
  'purchase_order_approved',
  'vehicle_status_changed',
  'voice_call_completed',
  'support_escalated',
  'marketing_campaign_completed',
  'maintenance_due',
  'scheduled_time',
  'webhook',
  'gps_event',
  'communication_received',
  'whatsapp_message_received',
]);
const actionTypeSchema = z.enum([
  'log_customer_activity',
  'send_communication',
  'update_job_status',
  'send_whatsapp_template',
  'send_whatsapp_draft',
  'update_customer',
  'assign_job_task',
  'send_email_draft',
  'create_payment_reminder',
  'ask_aura_agent',
  'generate_summary',
  'create_task',
  'assign_user',
  'notify_user',
  'send_internal_notification',
  'create_draft_sms',
  'create_draft_customer_response',
  'generate_recommendation',
  'create_purchase_order_draft',
  'generate_report',
  'create_follow_up',
  'trigger_aura_suggestion',
  'run_ai_agent',
  'update_record',
  'create_approval_request',
  'execute_approved_step',
]);
const conditionOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'exists',
  'not_exists',
  'contains',
  'greater_than',
  'less_than',
]);
const templateCategorySchema = z.enum([
  'customer_follow_up',
  'invoice_reminder',
  'lead_qualification',
  'job_completion',
  'technician_notification',
  'purchase_approval',
  'marketing_review',
  'executive_reporting',
  'custom',
]);
const scheduleTypeSchema = z.enum(['cron', 'daily', 'weekly', 'monthly', 'interval', 'one_time']);

const createTriggerSchema = z.object({
  triggerType: triggerTypeSchema,
  config: z.record(z.unknown()).optional(),
});

const createActionSchema = z.object({
  actionType: actionTypeSchema,
  sortOrder: z.number().int().nonnegative().optional(),
  config: z.record(z.unknown()).optional(),
});

const createConditionSchema = z.object({
  field: z.string().trim().min(1).max(200),
  operator: conditionOperatorSchema.optional(),
  value: z.string().trim().max(500).optional().nullable(),
  sortOrder: z.number().int().nonnegative().optional(),
});

const createWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  status: workflowStatusSchema.optional(),
  triggers: z.array(createTriggerSchema).optional(),
  actions: z.array(createActionSchema).optional(),
  conditions: z.array(createConditionSchema).optional(),
});

const updateWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  status: workflowStatusSchema.optional(),
  category: z.string().trim().max(100).optional().nullable(),
  canvasConfig: z.record(z.unknown()).optional(),
});

const reorderActionsSchema = z.object({
  actionIds: z.array(z.string().uuid()).min(1),
});

const runWorkflowSchema = z.object({
  payload: z.record(z.unknown()).optional(),
});

type AutomationRouterDeps = {
  automationService: AutomationService;
  workflowEngineService: WorkflowEngineService;
  workflowStudioService: WorkflowStudioService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export function createAutomationRouter({
  automationService,
  workflowEngineService,
  workflowStudioService,
  teamService,
  jwtSecret,
  authService,
}: AutomationRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get(
    '/stats',
    requireAnyPermission('automation:read', 'automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const stats = await automationService.getStats(companyId);
      res.json({ data: stats });
    },
  );

  router.get(
    '/workflows',
    requireAnyPermission('automation:read', 'automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const workflows = await automationService.listWorkflows(companyId);
      res.json({ data: { workflows } });
    },
  );

  router.post('/workflows', requireAnyPermission('automation:write'), async (req, res) => {
    const { companyId, userId } = getAuth(req);
    const parsed = createWorkflowSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid workflow payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const workflow = await automationService.createWorkflow({ companyId, userId }, parsed.data);
      res.status(201).json({ data: { workflow } });
    } catch (error) {
      handleAutomationError(res, error);
    }
  });

  router.get(
    '/workflows/:id',
    requireAnyPermission('automation:read', 'automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const workflow = await automationService.getWorkflow(companyId, getRouteParam(req.params.id));

      if (!workflow) {
        res.status(404).json({
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message: 'Workflow not found',
          },
        });
        return;
      }

      res.json({ data: { workflow } });
    },
  );

  router.patch('/workflows/:id', requireAnyPermission('automation:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = updateWorkflowSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid workflow payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const workflow = await automationService.updateWorkflow(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { workflow } });
    } catch (error) {
      handleAutomationError(res, error);
    }
  });

  router.post(
    '/workflows/:id/triggers',
    requireAnyPermission('automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = createTriggerSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid trigger payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const trigger = await automationService.addTrigger(
          companyId,
          getRouteParam(req.params.id),
          parsed.data,
        );
        res.status(201).json({ data: { trigger } });
      } catch (error) {
        handleAutomationError(res, error);
      }
    },
  );

  router.post(
    '/workflows/:id/actions',
    requireAnyPermission('automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = createActionSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid action payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const action = await automationService.addAction(
          companyId,
          getRouteParam(req.params.id),
          parsed.data,
        );
        res.status(201).json({ data: { action } });
      } catch (error) {
        handleAutomationError(res, error);
      }
    },
  );

  router.post(
    '/workflows/:id/conditions',
    requireAnyPermission('automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = createConditionSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid condition payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const condition = await automationService.addCondition(
          companyId,
          getRouteParam(req.params.id),
          parsed.data,
        );
        res.status(201).json({ data: { condition } });
      } catch (error) {
        handleAutomationError(res, error);
      }
    },
  );

  router.post(
    '/workflows/:id/actions/reorder',
    requireAnyPermission('automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = reorderActionsSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid reorder payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const workflow = await automationService.reorderActions(
          companyId,
          getRouteParam(req.params.id),
          parsed.data,
        );
        res.json({ data: { workflow } });
      } catch (error) {
        handleAutomationError(res, error);
      }
    },
  );

  router.post('/workflows/:id/run', requireAnyPermission('automation:write'), async (req, res) => {
    const { companyId, userId } = getAuth(req);
    const parsed = runWorkflowSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid run payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const run = await workflowEngineService.runManual(
        { companyId, userId },
        getRouteParam(req.params.id),
        parsed.data.payload ?? {},
      );
      res.status(201).json({ data: { run } });
    } catch (error) {
      handleAutomationError(res, error);
    }
  });

  router.get(
    '/runs',
    requireAnyPermission('automation:read', 'automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const runs = await workflowEngineService.listRuns(companyId);
      res.json({ data: { runs } });
    },
  );

  router.get(
    '/runs/:id',
    requireAnyPermission('automation:read', 'automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const run = await workflowEngineService.getRun(companyId, getRouteParam(req.params.id));

      if (!run) {
        res.status(404).json({
          error: {
            code: 'RUN_NOT_FOUND',
            message: 'Workflow run not found',
          },
        });
        return;
      }

      res.json({ data: { run } });
    },
  );

  router.post(
    '/step-results/:id/approve',
    requireAnyPermission('automation:write'),
    async (req, res) => {
      const { companyId, userId } = getAuth(req);

      try {
        const run = await workflowEngineService.approveStepResult(
          { companyId, userId },
          getRouteParam(req.params.id),
        );
        res.json({ data: { run } });
      } catch (error) {
        handleAutomationError(res, error);
      }
    },
  );

  router.post(
    '/step-results/:id/reject',
    requireAnyPermission('automation:write'),
    async (req, res) => {
      const { companyId, userId } = getAuth(req);

      try {
        await workflowEngineService.rejectStepResult(
          { companyId, userId },
          getRouteParam(req.params.id),
        );
        res.json({ data: { success: true } });
      } catch (error) {
        handleAutomationError(res, error);
      }
    },
  );

  router.post('/steps/:id/retry', requireAnyPermission('automation:write'), async (req, res) => {
    const { companyId, userId } = getAuth(req);

    try {
      await workflowEngineService.retryStep({ companyId, userId }, getRouteParam(req.params.id));
      res.json({ data: { success: true } });
    } catch (error) {
      handleAutomationError(res, error);
    }
  });

  router.get(
    '/executions',
    requireAnyPermission('automation:read', 'automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const executions = await automationService.listExecutions(companyId);
      res.json({ data: { executions } });
    },
  );

  router.get(
    '/workflows/:id/executions',
    requireAnyPermission('automation:read', 'automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);

      try {
        const executions = await automationService.listWorkflowExecutions(
          companyId,
          getRouteParam(req.params.id),
        );
        res.json({ data: { executions } });
      } catch (error) {
        handleAutomationError(res, error);
      }
    },
  );

  router.get(
    '/workflows/:id/runs',
    requireAnyPermission('automation:read', 'automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const runs = await workflowEngineService.listRuns(companyId, getRouteParam(req.params.id));
      res.json({ data: { runs } });
    },
  );

  router.post(
    '/workflows/:id/submit',
    requireAnyPermission('automation:write'),
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const workflow = await workflowStudioService.submitWorkflow(
          { companyId: auth.companyId, userId: auth.userId },
          getRouteParam(req.params.id),
        );
        res.json({ data: { workflow } });
      } catch (error) {
        handleAutomationError(res, error);
      }
    },
  );

  router.post(
    '/workflows/:id/activate',
    requireAnyPermission('automation:write'),
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const workflow = await workflowStudioService.activateWorkflow(
          { companyId: auth.companyId, userId: auth.userId },
          getRouteParam(req.params.id),
        );
        res.json({ data: { workflow } });
      } catch (error) {
        handleAutomationError(res, error);
      }
    },
  );

  router.get(
    '/workflows/:id/validate',
    requireAnyPermission('automation:read', 'automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const validation = await workflowStudioService.validateWorkflow(
        companyId,
        getRouteParam(req.params.id),
      );
      res.json({ data: { validation } });
    },
  );

  router.post(
    '/workflows/:id/simulate',
    requireAnyPermission('automation:write'),
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const simulation = await workflowStudioService.simulateWorkflow(
          { companyId: auth.companyId, userId: auth.userId },
          getRouteParam(req.params.id),
          req.body ?? {},
        );
        res.status(201).json({ data: { simulation } });
      } catch (error) {
        handleAutomationError(res, error);
      }
    },
  );

  router.post(
    '/workflows/:id/execute',
    requireAnyPermission('automation:write'),
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const run = await workflowStudioService.executeWorkflow(
          { companyId: auth.companyId, userId: auth.userId },
          getRouteParam(req.params.id),
          (req.body?.payload as Record<string, unknown> | undefined) ?? {},
        );
        res.status(201).json({ data: { run } });
      } catch (error) {
        handleAutomationError(res, error);
      }
    },
  );

  router.get(
    '/history',
    requireAnyPermission('automation:read', 'automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const workflowId =
        typeof req.query.workflowId === 'string' ? req.query.workflowId : undefined;
      const history = await workflowStudioService.listWorkflowHistory(companyId, workflowId);
      res.json({ data: history });
    },
  );

  router.get(
    '/audit-logs',
    requireAnyPermission('automation:read', 'automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const workflowId =
        typeof req.query.workflowId === 'string' ? req.query.workflowId : undefined;
      const auditLogs = await workflowStudioService.listAuditLogs(companyId, workflowId);
      res.json({ data: { auditLogs } });
    },
  );

  router.get(
    '/templates',
    requireAnyPermission('automation:read', 'automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const templates = await workflowStudioService.listTemplates(companyId);
      res.json({ data: { templates } });
    },
  );

  router.post('/templates', requireAnyPermission('automation:write'), async (req, res) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2000).optional().nullable(),
        category: templateCategorySchema.optional(),
        templateKey: z.string().trim().min(1).max(100),
        definition: z.record(z.unknown()).optional(),
        isActive: z.boolean().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid template payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const template = await workflowStudioService.createTemplate(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { template } });
    } catch (error) {
      handleAutomationError(res, error);
    }
  });

  router.post(
    '/templates/:id/instantiate',
    requireAnyPermission('automation:write'),
    async (req, res) => {
      const parsed = z
        .object({
          name: z.string().trim().min(1).max(200),
          description: z.string().trim().max(2000).optional().nullable(),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid instantiate payload' } });
        return;
      }

      try {
        const auth = getAuth(req);
        const workflow = await workflowStudioService.instantiateTemplate(
          { companyId: auth.companyId, userId: auth.userId },
          getRouteParam(req.params.id),
          parsed.data,
        );
        res.status(201).json({ data: { workflow } });
      } catch (error) {
        handleAutomationError(res, error);
      }
    },
  );

  router.get(
    '/schedules',
    requireAnyPermission('automation:read', 'automation:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const schedules = await workflowStudioService.listSchedules(companyId);
      res.json({ data: { schedules } });
    },
  );

  router.post('/schedules', requireAnyPermission('automation:write'), async (req, res) => {
    const parsed = z
      .object({
        workflowId: z.string().uuid(),
        scheduleType: scheduleTypeSchema,
        cronExpression: z.string().trim().max(100).optional().nullable(),
        intervalMinutes: z.number().int().min(1).optional().nullable(),
        runAt: z.string().datetime().optional().nullable(),
        timezone: z.string().trim().max(100).optional(),
        enabled: z.boolean().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid schedule payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const schedule = await workflowStudioService.createSchedule(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { schedule } });
    } catch (error) {
      handleAutomationError(res, error);
    }
  });

  return router;
}

function handleAutomationError(res: import('express').Response, error: unknown) {
  if (
    error instanceof AutomationError ||
    error instanceof WorkflowEngineError ||
    error instanceof WorkflowStudioError
  ) {
    const status =
      error.code === 'WORKFLOW_NOT_FOUND' ||
      error.code === 'RUN_NOT_FOUND' ||
      error.code === 'STEP_RESULT_NOT_FOUND' ||
      error.code === 'STEP_NOT_FOUND'
        ? 404
        : error.code === 'VALIDATION_ERROR' || error.code === 'INVALID_STATE'
          ? 400
          : 400;

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
