import { Router } from 'express';
import { z } from 'zod';
import type { FinanceService } from '../services/finance.service.js';
import { FinanceError } from '../services/finance.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const quoteStatusSchema = z.enum(['draft', 'sent', 'accepted', 'declined', 'expired']);
const invoiceStatusSchema = z.enum(['draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled']);
const paymentMethodSchema = z.enum(['cash', 'card', 'bank_transfer', 'other']);

const createQuoteSchema = z.object({
  customerId: z.string().uuid(),
  jobId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(200),
  status: quoteStatusSchema.optional(),
  amountCents: z.number().int().positive(),
  currency: z.string().trim().min(3).max(3).optional(),
  validUntil: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

const createInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  jobId: z.string().uuid().optional().nullable(),
  quoteId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(200),
  status: invoiceStatusSchema.optional(),
  amountCents: z.number().int().positive(),
  currency: z.string().trim().min(3).max(3).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  issuedAt: z.string().datetime().optional().nullable(),
});

const createPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  currency: z.string().trim().min(3).max(3).optional(),
  method: paymentMethodSchema.optional(),
  reference: z.string().trim().max(200).optional().nullable(),
  paidAt: z.string().datetime().optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

type FinanceRouterDeps = {
  financeService: FinanceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createFinanceRouter({
  financeService,
  teamService,
  jwtSecret,
  authService,
}: FinanceRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
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

  router.get('/quotes', requireAnyPermission('finance:read', 'finance:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const quotes = await financeService.listQuotes(companyId);
    res.json({ data: { quotes } });
  });

  router.post('/quotes', requireAnyPermission('finance:write'), async (req, res) => {
    const { companyId } = getAuth(req);
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
      const quote = await financeService.createQuote(companyId, parsed.data);
      res.status(201).json({ data: { quote } });
    } catch (error) {
      handleFinanceError(res, error);
    }
  });

  router.get('/invoices', requireAnyPermission('finance:read', 'finance:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const invoices = await financeService.listInvoices(companyId);
    res.json({ data: { invoices } });
  });

  router.post('/invoices', requireAnyPermission('finance:write'), async (req, res) => {
    const { companyId } = getAuth(req);
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
      const invoice = await financeService.createInvoice(companyId, parsed.data);
      res.status(201).json({ data: { invoice } });
    } catch (error) {
      handleFinanceError(res, error);
    }
  });

  router.get('/payments', requireAnyPermission('finance:read', 'finance:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const payments = await financeService.listPayments(companyId);
    res.json({ data: { payments } });
  });

  router.post('/payments', requireAnyPermission('finance:write'), async (req, res) => {
    const { companyId } = getAuth(req);
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
      const payment = await financeService.createPayment(companyId, parsed.data);
      res.status(201).json({ data: { payment } });
    } catch (error) {
      handleFinanceError(res, error);
    }
  });

  return router;
}

function handleFinanceError(res: import('express').Response, error: unknown) {
  if (error instanceof FinanceError) {
    const status =
      error.code === 'NOT_FOUND' ||
      error.code === 'CUSTOMER_NOT_FOUND' ||
      error.code === 'JOB_NOT_FOUND' ||
      error.code === 'QUOTE_NOT_FOUND'
        ? 404
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
