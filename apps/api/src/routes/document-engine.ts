import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import {
  DocumentEngineError,
  type DocumentActor,
  type DocumentEngineService,
} from '../services/document-engine.service.js';

type DocumentEngineRouterDeps = {
  documentEngineService: DocumentEngineService;
  jwtSecret: string;
  authService: Parameters<typeof createAuthMiddleware>[0]['authService'];
};

type YocoWebhookRouterDeps = {
  documentEngineService: DocumentEngineService;
};

const documentTypeSchema = z.enum(['invoice', 'quote', 'report']);
const reportKindSchema = z.enum(['service', 'inspection', 'maintenance']);
const documentStatusSchema = z.enum(['draft', 'in_review', 'issued', 'superseded', 'cancelled']);

const sectionSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.string().trim().min(1),
  title: z.string().nullable(),
  position: z.number().int().min(0),
  visible: z.boolean(),
  payload: z.record(z.unknown()),
});

const photoSchema = z.object({
  id: z.string().trim().min(1),
  documentationId: z.string().uuid(),
  jobId: z.string().uuid(),
  role: z.enum(['before', 'after', 'additional']),
  caption: z.string().nullable(),
  position: z.number().int().min(0),
  fileName: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  includeInPdf: z.boolean().optional(),
});

const createDocumentSchema = z
  .object({
    documentType: documentTypeSchema,
    reportKind: reportKindSchema.nullable().optional(),
    documentNumber: z.string().trim().min(1).max(60),
    title: z.string().trim().min(1).max(200),
    customerId: z.string().uuid().nullable().optional(),
    propertyId: z.string().uuid().nullable().optional(),
    jobId: z.string().uuid().nullable().optional(),
    invoiceId: z.string().uuid().nullable().optional(),
    quoteId: z.string().uuid().nullable().optional(),
  })
  .strict();

const updateDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    sections: z.array(sectionSchema).optional(),
    photos: z.array(photoSchema).optional(),
    content: z.record(z.unknown()).optional(),
    cocDocumentationId: z.string().uuid().nullable().optional(),
  })
  .strict();

const approvePaymentLinkSchema = z
  .object({
    /** Must equal the amount the Owner saw in the Approve & Issue dialog. */
    approvedOutstandingCents: z.number().int().positive(),
    documentId: z.string().uuid().nullable().optional(),
  })
  .strict();

function statusForCode(code: string): number {
  switch (code) {
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'DOCUMENT_LOCKED':
    case 'ALREADY_ISSUED':
    case 'BALANCE_CHANGED':
      return 409;
    case 'YOCO_NOT_CONNECTED':
    case 'WEBHOOK_SECRET_MISSING':
      return 503;
    case 'YOCO_FAILED':
      return 502;
    case 'INVALID_SIGNATURE':
      return 401;
    case 'UNKNOWN_PAYMENT_LINK':
      return 404;
    default:
      return 400;
  }
}

/**
 * Builds the actor from the verified session only. A client cannot influence the
 * company, role or permissions used for authorisation.
 */
function actorFrom(req: Request): DocumentActor {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    throw new DocumentEngineError('FORBIDDEN', 'Authentication is required');
  }
  return {
    userId: auth.userId,
    companyId: auth.companyId,
    roleName: auth.roleName ?? null,
    permissions: auth.permissions ?? [],
  };
}

function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch((error: unknown) => {
      if (error instanceof DocumentEngineError) {
        res.status(statusForCode(error.code)).json({
          error: { code: error.code, message: error.message },
        });
        return;
      }
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message ?? 'Invalid request' },
        });
        return;
      }
      next(error);
    });
  };
}

export function createDocumentEngineRouter({
  documentEngineService,
  jwtSecret,
  authService,
}: DocumentEngineRouterDeps): Router {
  const router = Router();

  // Every document route requires a verified session before any handler runs.
  router.use(createAuthMiddleware({ jwtSecret, authService }));

  const listQuerySchema = z.object({
    documentType: documentTypeSchema.optional(),
    status: documentStatusSchema.optional(),
  });

  router.get(
    '/',
    requireAnyPermission('documents:read', 'finance:read'),
    asyncRoute(async (req, res) => {
      const filter = listQuerySchema.parse(req.query);
      const documents = await documentEngineService.listDocuments(actorFrom(req), filter);
      res.json({ data: documents });
    }),
  );

  router.post(
    '/',
    requireAnyPermission('documents:write', 'finance:write'),
    asyncRoute(async (req, res) => {
      const input = createDocumentSchema.parse(req.body);
      const created = await documentEngineService.createDocument(actorFrom(req), input);
      res.status(201).json({ data: created });
    }),
  );

  const ensureFinanceDocumentSchema = z.object({
    documentNumber: z.string().trim().min(1).max(60),
    title: z.string().trim().min(1).max(200),
    customerId: z.string().uuid().nullable().optional(),
    jobId: z.string().uuid().nullable().optional(),
  });

  router.post(
    '/finance/quotes/:quoteId/ensure',
    requireAnyPermission('finance:read', 'finance:write'),
    asyncRoute(async (req, res) => {
      const { quoteId } = z.object({ quoteId: z.string().uuid() }).parse(req.params);
      const body = ensureFinanceDocumentSchema.parse(req.body ?? {});
      const detail = await documentEngineService.ensureFinanceDocument(actorFrom(req), {
        documentType: 'quote',
        quoteId,
        documentNumber: body.documentNumber,
        title: body.title,
        customerId: body.customerId ?? null,
        jobId: body.jobId ?? null,
      });
      res.json({ data: detail });
    }),
  );

  router.post(
    '/finance/invoices/:invoiceId/ensure',
    requireAnyPermission('finance:read', 'finance:write'),
    asyncRoute(async (req, res) => {
      const { invoiceId } = z.object({ invoiceId: z.string().uuid() }).parse(req.params);
      const body = ensureFinanceDocumentSchema.parse(req.body ?? {});
      const detail = await documentEngineService.ensureFinanceDocument(actorFrom(req), {
        documentType: 'invoice',
        invoiceId,
        documentNumber: body.documentNumber,
        title: body.title,
        customerId: body.customerId ?? null,
        jobId: body.jobId ?? null,
      });
      res.json({ data: detail });
    }),
  );

  router.get(
    '/:documentId',
    requireAnyPermission('documents:read', 'finance:read'),
    asyncRoute(async (req, res) => {
      const { documentId } = z.object({ documentId: z.string().uuid() }).parse(req.params);
      const detail = await documentEngineService.getDocument(actorFrom(req), documentId);
      res.json({ data: detail });
    }),
  );

  router.patch(
    '/:documentId',
    requireAnyPermission('documents:write', 'finance:write'),
    asyncRoute(async (req, res) => {
      const { documentId } = z.object({ documentId: z.string().uuid() }).parse(req.params);
      const patch = updateDocumentSchema.parse(req.body);
      const updated = await documentEngineService.updateDocument(
        actorFrom(req),
        documentId,
        patch as Parameters<DocumentEngineService['updateDocument']>[2],
      );
      res.json({ data: updated });
    }),
  );

  router.post(
    '/:documentId/issue',
    requireAnyPermission('documents:write', 'finance:write'),
    asyncRoute(async (req, res) => {
      const { documentId } = z.object({ documentId: z.string().uuid() }).parse(req.params);
      const { changeSummary } = z
        .object({ changeSummary: z.string().trim().max(500).optional() })
        .parse(req.body ?? {});
      const issued = await documentEngineService.issueDocument(
        actorFrom(req),
        documentId,
        changeSummary,
      );
      res.json({ data: issued });
    }),
  );

  router.get(
    '/:documentId/versions',
    requireAnyPermission('documents:read', 'finance:read'),
    asyncRoute(async (req, res) => {
      const { documentId } = z.object({ documentId: z.string().uuid() }).parse(req.params);
      const versions = await documentEngineService.listDocumentVersions(
        actorFrom(req),
        documentId,
      );
      res.json({ data: versions });
    }),
  );

  // ---------------------------------------------------------------------------
  // AURA payment links — Draft (preview) then Approve & Execute (create)
  // ---------------------------------------------------------------------------

  router.get(
    '/invoices/:invoiceId/payment-link/preview',
    requireAnyPermission('finance:write'),
    asyncRoute(async (req, res) => {
      const { invoiceId } = z.object({ invoiceId: z.string().uuid() }).parse(req.params);
      const preview = await documentEngineService.prepareInvoicePaymentLink(
        actorFrom(req),
        invoiceId,
      );
      res.json({ data: preview });
    }),
  );

  router.post(
    '/invoices/:invoiceId/payment-link',
    requireAnyPermission('finance:write'),
    asyncRoute(async (req, res) => {
      const { invoiceId } = z.object({ invoiceId: z.string().uuid() }).parse(req.params);
      const body = approvePaymentLinkSchema.parse(req.body);
      const result = await documentEngineService.approveAndCreateInvoicePaymentLink(
        actorFrom(req),
        invoiceId,
        { approvedOutstandingCents: body.approvedOutstandingCents, documentId: body.documentId ?? null },
      );
      res.status(result.reused ? 200 : 201).json({ data: result });
    }),
  );

  return router;
}

/**
 * Public receiver: authenticity comes from the Standard Webhooks signature, not
 * from a session. Unverified deliveries are rejected and recorded.
 */
export function createYocoWebhookRouter({
  documentEngineService,
}: YocoWebhookRouterDeps): Router {
  const router = Router();

  router.post('/', (req, res, next) => {
    const rawBody =
      (req as Request & { rawBody?: string }).rawBody ??
      (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));

    documentEngineService
      .handleYocoWebhook({
        rawBody,
        headers: req.headers as Record<string, string | string[] | undefined>,
      })
      .then((result) => {
        res.status(200).json({ data: result });
      })
      .catch((error: unknown) => {
        if (error instanceof DocumentEngineError) {
          res
            .status(statusForCode(error.code))
            .json({ error: { code: error.code, message: error.message } });
          return;
        }
        if (error instanceof SyntaxError) {
          res
            .status(400)
            .json({ error: { code: 'INVALID_PAYLOAD', message: 'Webhook body is not valid JSON' } });
          return;
        }
        next(error);
      });
  });

  return router;
}
