import { Router } from 'express';
import { z } from 'zod';
import type { CustomerSupportService } from '../services/customer-support.service.js';
import { CustomerSupportError } from '../services/customer-support.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const conversationStatusSchema = z.enum([
  'open',
  'in_progress',
  'waiting_customer',
  'escalated',
  'resolved',
  'closed',
]);
const channelSchema = z.enum(['portal', 'email', 'phone', 'chat', 'other']);
const messageRoleSchema = z.enum(['customer', 'agent', 'system', 'ai_draft']);
const escalationStatusSchema = z.enum(['pending', 'assigned', 'in_progress', 'resolved', 'dismissed']);
const escalationPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
const sentimentSchema = z.enum(['positive', 'neutral', 'negative']);

const createConversationSchema = z.object({
  customerId: z.string().uuid(),
  portalUserId: z.string().uuid().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  channel: channelSchema.optional(),
  status: conversationStatusSchema.optional(),
  subject: z.string().trim().min(1).max(500),
  outcome: z.string().trim().max(5000).optional().nullable(),
  resolutionStatus: z.string().trim().max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateConversationSchema = createConversationSchema
  .omit({ customerId: true, portalUserId: true })
  .partial()
  .extend({
    resolvedAt: z.string().datetime().optional().nullable(),
  });

const createMessageSchema = z.object({
  role: messageRoleSchema,
  content: z.string().trim().min(1).max(8000),
  occurredAt: z.string().datetime().optional(),
});

const createEscalationSchema = z.object({
  reason: z.string().trim().min(1).max(5000),
  priority: escalationPrioritySchema.optional(),
  assignedUserId: z.string().uuid().optional().nullable(),
  context: z.record(z.unknown()).optional(),
});

const updateEscalationSchema = z.object({
  status: escalationStatusSchema.optional(),
  priority: escalationPrioritySchema.optional(),
  assignedUserId: z.string().uuid().optional().nullable(),
  resolution: z.string().trim().max(5000).optional().nullable(),
  context: z.record(z.unknown()).optional(),
  resolvedAt: z.string().datetime().optional().nullable(),
});

const createFeedbackSchema = z.object({
  sentiment: sentimentSchema.optional(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  comment: z.string().trim().max(5000).optional().nullable(),
  context: z.record(z.unknown()).optional(),
});

type CustomerSupportRouterDeps = {
  customerSupportService: CustomerSupportService;
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

export function createCustomerSupportRouter({
  customerSupportService,
  teamService,
  jwtSecret,
  authService,
}: CustomerSupportRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'customer_support:read',
    'customer_support:write',
    'customers:read',
    'portal:read',
  );
  const requireWrite = requireAnyPermission('customer_support:write', 'communications:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/stats', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await customerSupportService.getStats(companyId);
    res.json({ data: { stats } });
  });

  router.get('/insights', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const insights = await customerSupportService.getAttentionInsights(companyId);
    res.json({ data: { insights } });
  });

  router.get('/conversations', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const conversations = await customerSupportService.listConversations(companyId);
    res.json({ data: { conversations } });
  });

  router.post('/conversations', requireWrite, async (req, res) => {
    const parsed = createConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid conversation payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const conversation = await customerSupportService.createConversation(auth, parsed.data);
      res.status(201).json({ data: { conversation } });
    } catch (error) {
      handleCustomerSupportError(res, error);
    }
  });

  router.patch('/conversations/:id', requireWrite, async (req, res) => {
    const parsed = updateConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid conversation payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const conversation = await customerSupportService.updateConversation(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { conversation } });
    } catch (error) {
      handleCustomerSupportError(res, error);
    }
  });

  router.get('/messages/:conversationId', requireRead, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const messages = await customerSupportService.listMessages(
        companyId,
        getRouteParam(req.params.conversationId),
      );
      res.json({ data: { messages } });
    } catch (error) {
      handleCustomerSupportError(res, error);
    }
  });

  router.post('/messages/:conversationId', requireWrite, async (req, res) => {
    const parsed = createMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid message payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const message = await customerSupportService.addMessage(
        auth,
        getRouteParam(req.params.conversationId),
        parsed.data,
      );
      res.status(201).json({ data: { message } });
    } catch (error) {
      handleCustomerSupportError(res, error);
    }
  });

  router.get('/escalations', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const escalations = await customerSupportService.listEscalations(companyId);
    res.json({ data: { escalations } });
  });

  router.post('/conversations/:id/escalations', requireWrite, async (req, res) => {
    const parsed = createEscalationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid escalation payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const escalation = await customerSupportService.createEscalation(
        auth,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.status(201).json({ data: { escalation } });
    } catch (error) {
      handleCustomerSupportError(res, error);
    }
  });

  router.patch('/escalations/:id', requireWrite, async (req, res) => {
    const parsed = updateEscalationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid escalation payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const escalation = await customerSupportService.updateEscalation(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { escalation } });
    } catch (error) {
      handleCustomerSupportError(res, error);
    }
  });

  router.get('/feedback', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const feedback = await customerSupportService.listFeedback(companyId);
    res.json({ data: { feedback } });
  });

  router.post('/conversations/:id/feedback', requireWrite, async (req, res) => {
    const parsed = createFeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid feedback payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const feedback = await customerSupportService.createFeedback(
        auth,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.status(201).json({ data: { feedback } });
    } catch (error) {
      handleCustomerSupportError(res, error);
    }
  });

  router.get('/customers/:customerId/job-status', requireRead, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const status = await customerSupportService.getCustomerJobStatus(
        companyId,
        getRouteParam(req.params.customerId),
      );
      res.json({ data: { status } });
    } catch (error) {
      handleCustomerSupportError(res, error);
    }
  });

  return router;
}

function handleCustomerSupportError(res: import('express').Response, error: unknown) {
  if (error instanceof CustomerSupportError) {
    res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}
