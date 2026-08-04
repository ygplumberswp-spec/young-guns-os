import { Router } from 'express';
import { z } from 'zod';
import { hasAnyPermission } from '@titan/auth';
import type { FinanceService } from '../services/finance.service.js';
import { FinanceError } from '../services/finance.service.js';
import type { CrmService } from '../services/crm.service.js';
import type { TeamService } from '../services/team.service.js';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import { appendServerTiming } from '../lib/server-timing.js';

const quoteStatusSchema = z.enum([
  'draft',
  'internal_review',
  'approved_for_sending',
  'sent',
  'viewed',
  'accepted',
  'declined',
  'expired',
  'superseded',
  'converted',
  'cancelled',
]);
const invoiceStatusSchema = z.enum(['draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled']);
const paymentMethodSchema = z.enum(['cash', 'card', 'bank_transfer', 'other']);
const quoteLineItemSchema = z.object({
  category: z.string().optional(),
  description: z.string().trim().min(1),
  quantity: z.number().positive().optional(),
  unitPriceCents: z.number().int(),
  unitCostCents: z.number().int().optional(),
  vatRateBps: z.number().int().min(0).max(10000).optional(),
  isOptional: z.boolean().optional(),
  optionTier: z.string().nullable().optional(),
});

const createQuoteSchema = z
  .object({
    customerId: z.string().uuid(),
    jobId: z.string().uuid().optional().nullable(),
    propertyId: z.string().uuid().optional().nullable(),
    leadId: z.string().uuid().optional().nullable(),
    status: quoteStatusSchema.optional(),
    amountCents: z.number().int().positive().optional(),
    currency: z.string().trim().min(3).max(3).optional(),
    validUntil: z.string().datetime().optional().nullable(),
    issuedAt: z.string().datetime().optional().nullable(),
    notes: z.string().trim().max(5000).optional().nullable(),
    customerNotes: z.string().trim().max(5000).optional().nullable(),
    scopeOfWork: z.string().trim().max(10000).optional().nullable(),
    exclusions: z.string().trim().max(10000).optional().nullable(),
    paymentTerms: z.string().trim().max(2000).optional().nullable(),
    billingAddress: z.string().trim().max(5000).optional().nullable(),
    siteAddress: z.string().trim().max(5000).optional().nullable(),
    postalAddress: z.string().trim().max(5000).optional().nullable(),
    lineItems: z.array(quoteLineItemSchema).optional().default([]),
    clientActionId: z.string().trim().min(1).max(200).optional().nullable(),
    belowFloorOverride: z.boolean().optional(),
    belowFloorReason: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((value) => value.lineItems.length > 0 || Boolean(value.amountCents), {
    message: 'amountCents or lineItems is required',
  });

const createInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  jobId: z.string().uuid().optional().nullable(),
  quoteId: z.string().uuid().optional().nullable(),
  status: invoiceStatusSchema.optional(),
  amountCents: z.number().int().positive().optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  issuedAt: z.string().datetime().optional().nullable(),
  customerReference: z.string().trim().max(200).optional().nullable(),
  billingAddress: z.string().trim().max(5000).optional().nullable(),
  siteAddress: z.string().trim().max(5000).optional().nullable(),
  postalAddress: z.string().trim().max(5000).optional().nullable(),
  stage: z.enum(['deposit', 'progress', 'final', 'standard']).optional(),
  lineItems: z.array(z.object({ category: z.string().optional(), description: z.string().trim().min(1), quantity: z.number().positive().optional(), unitPriceCents: z.number().int(), unitCostCents: z.number().int().optional(), vatRateBps: z.number().int().min(0).max(10000).optional() })).optional(),
  clientActionId: z.string().trim().min(1).max(200).optional().nullable(),
}).refine((value) => Boolean(value.amountCents) || Boolean(value.lineItems?.length), { message: 'amountCents or lineItems is required' });

const createPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  currency: z.string().trim().min(3).max(3).optional(),
  method: paymentMethodSchema.optional(),
  reference: z.string().trim().max(200).optional().nullable(),
  paidAt: z.string().datetime().optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
  clientActionId: z.string().trim().min(1).max(200).optional().nullable(),
});

type FinanceRouterDeps = {
  financeService: FinanceService;
  crmService: CrmService;
  teamService: TeamService;
  db: DatabaseClient;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createFinanceRouter({
  financeService,
  crmService,
  teamService,
  db,
  jwtSecret,
  authService,
}: FinanceRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);

  router.use(requireAuth);
  router.use(denyTechnician);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get('/stats', requireAnyPermission('finance:read', 'finance:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await financeService.getStats(companyId);
    res.json({ data: stats });
  });

  router.get('/customers/search', requireAnyPermission('finance:read', 'finance:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const q = stringQuery(req.query.q);
    if (!q || q.length < 2) {
      res.json({ data: { customers: [] } });
      return;
    }
    const customers = await crmService.listCustomers(companyId, q);
    res.json({
      data: {
        customers: customers.slice(0, 12).map((customer) => ({
          id: customer.id,
          name: customer.name,
          companyName: customer.companyName,
          email: customer.email,
          phone: customer.phone,
          xeroContactId: customer.xeroContactId,
        })),
      },
    });
  });

  router.get('/catalogue/search', requireAnyPermission('finance:read', 'finance:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const q = stringQuery(req.query.q) ?? '';
    if (q.length > 120) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Catalogue search query must be 120 characters or fewer' },
      });
      return;
    }
    const items = await financeService.searchCatalogueItems(companyId, q);
    res.json({ data: { items } });
  });

  router.get('/quotes', requireAnyPermission('finance:read', 'finance:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const quotes = await financeService.listQuotes(companyId, { q: stringQuery(req.query.q), status: stringQuery(req.query.status) });
    res.json({ data: { quotes } });
  });

  router.post('/quotes', requireAnyPermission('finance:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = createQuoteSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid quote payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const quote = await financeService.createQuote(toFinanceActor(auth), parsed.data as any);
      res.status(201).json({ data: { quote } });
    } catch (error) {
      handleFinanceError(res, error);
    }
  });

  router.get(
    '/invoices',
    requireAnyPermission('finance:read', 'finance:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const started = performance.now();
      const invoices = await financeService.listInvoices(companyId, {
        q: stringQuery(req.query.q),
        status: stringQuery(req.query.status),
        overdueOnly: req.query.overdueOnly === 'true',
      });
      appendServerTiming(res, 'invoices-list', performance.now() - started);
      res.json({ data: { invoices } });
    },
  );

  router.post('/invoices', requireAnyPermission('finance:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = createInvoiceSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid invoice payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const invoice = await financeService.createInvoice(toFinanceActor(auth), parsed.data as any);
      res.status(201).json({ data: { invoice } });
    } catch (error) {
      handleFinanceError(res, error);
    }
  });

  router.get(
    '/payments',
    requireAnyPermission('finance:read', 'finance:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const payments = await financeService.listPayments(companyId, { q: stringQuery(req.query.q) });
      res.json({ data: { payments } });
    },
  );

  router.post('/payments', requireAnyPermission('finance:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = createPaymentSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid payment payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const payment = await financeService.createPayment(toFinanceActor(auth), parsed.data);
      res.status(201).json({ data: { payment } });
    } catch (error) {
      handleFinanceError(res, error);
    }
  });

  router.get('/quotes/:id', requireAnyPermission('finance:read', 'finance:write'), async (req, res) => {
    const auth = getAuth(req);
    const quote = await financeService.getQuoteDetail(auth.companyId, routeParam(req.params.id), { includeProfit: canViewProfit(auth) });
    if (!quote) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Quote not found' } }); return; }
    res.json({ data: { quote } });
  });
  router.patch('/quotes/:id', requireAnyPermission('finance:write'), async (req, res) => {
    try { res.json({ data: { quote: await financeService.updateQuote(toFinanceActor(getAuth(req)), routeParam(req.params.id), req.body) } }); } catch (error) { handleFinanceError(res, error); }
  });
  router.post('/quotes/:id/issue', requireAnyPermission('finance:write'), async (req, res) => {
    try { res.json({ data: { quote: await financeService.issueQuote(toFinanceActor(getAuth(req)), routeParam(req.params.id)) } }); } catch (error) { handleFinanceError(res, error); }
  });
  router.post('/quotes/:id/versions', requireAnyPermission('finance:write'), async (req, res) => {
    const parsed = z
      .object({
        clientActionId: z.string().min(1),
        reason: z.string().max(1000).optional().nullable(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid version payload' } });
      return;
    }
    try {
      res.status(201).json({
        data: {
          quote: await financeService.createQuoteVersion(
            toFinanceActor(getAuth(req)),
            routeParam(req.params.id),
            parsed.data,
          ),
        },
      });
    } catch (error) {
      handleFinanceError(res, error);
    }
  });
  router.post('/quotes/:id/invoices', requireAnyPermission('finance:write'), async (req, res) => {
    const parsed = z
      .object({
        clientActionId: z.string().min(1),
        stage: z.enum(['deposit', 'progress', 'final', 'standard']),
        dueDate: z.string().datetime().optional().nullable(),
        notes: z.string().max(5000).optional().nullable(),
        amountCents: z.number().int().positive().optional().nullable(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid invoice payload' } });
      return;
    }
    try {
      res.status(201).json({
        data: {
          invoice: await financeService.createInvoiceFromQuote(
            toFinanceActor(getAuth(req)),
            routeParam(req.params.id),
            parsed.data,
          ),
        },
      });
    } catch (error) {
      handleFinanceError(res, error);
    }
  });
  router.post('/jobs/:jobId/invoices', requireAnyPermission('finance:write'), async (req, res) => {
    const parsed = z
      .object({
        clientActionId: z.string().min(1),
        stage: z.enum(['deposit', 'progress', 'final', 'standard']),
        dueDate: z.string().datetime().optional().nullable(),
        notes: z.string().max(5000).optional().nullable(),
        amountCents: z.number().int().positive().optional().nullable(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid invoice payload' } });
      return;
    }
    try {
      res.status(201).json({
        data: {
          invoice: await financeService.createInvoiceFromJob(
            toFinanceActor(getAuth(req)),
            routeParam(req.params.jobId),
            parsed.data,
          ),
        },
      });
    } catch (error) {
      handleFinanceError(res, error);
    }
  });
  router.get('/invoices/:id', requireAnyPermission('finance:read', 'finance:write'), async (req, res) => {
    const invoice = await financeService.getInvoiceDetail(getAuth(req).companyId, routeParam(req.params.id));
    if (!invoice) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }); return; }
    res.json({ data: { invoice } });
  });
  router.patch('/invoices/:id', requireAnyPermission('finance:write'), async (req, res) => {
    try {
      res.json({
        data: {
          invoice: await financeService.updateInvoice(
            toFinanceActor(getAuth(req)),
            routeParam(req.params.id),
            req.body,
          ),
        },
      });
    } catch (error) {
      handleFinanceError(res, error);
    }
  });
  router.get('/payments/:id', requireAnyPermission('finance:read', 'finance:write'), async (req, res) => {
    const payment = await financeService.getPaymentDetail(getAuth(req).companyId, routeParam(req.params.id));
    if (!payment) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Payment not found' } }); return; }
    res.json({ data: { payment } });
  });
  router.get('/jobs/:jobId/finance-summary', requireAnyPermission('finance:read', 'finance:write'), async (req, res) => {
    const auth = getAuth(req);
    res.json({ data: { summary: await financeService.getJobFinanceSummary(auth.companyId, routeParam(req.params.jobId), { includeProfit: canViewProfit(auth) }) } });
  });

  return router;
}

function stringQuery(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function routeParam(value: string | string[]): string { return Array.isArray(value) ? value[0]! : value; }
function toFinanceActor(auth: ReturnType<typeof getAuth>) { return { companyId: auth.companyId, userId: auth.userId, permissions: auth.permissions, roleName: auth.roleName, canWrite: hasAnyPermission(auth.permissions, ['finance:write', '*']) }; }
function canViewProfit(auth: ReturnType<typeof getAuth>) { return hasAnyPermission(auth.permissions, ['finance:write', '*']) || ['Company Owner', 'Accountant', 'Manager'].includes(auth.roleName ?? ''); }

function handleFinanceError(res: import('express').Response, error: unknown) {
  if (error instanceof FinanceError) {
    const status =
      error.code === 'NOT_FOUND' ||
      error.code === 'CUSTOMER_NOT_FOUND' ||
      error.code === 'JOB_NOT_FOUND' ||
      error.code === 'QUOTE_NOT_FOUND'
        ? 404
        : error.code === 'SYNC_CONFLICT'
          ? 409
          : error.code === 'VALIDATION_ERROR'
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
