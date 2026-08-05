import { Router, raw } from 'express';
import { z } from 'zod';
import {
  FACEBOOK_BUSINESS_HREF,
  FACEBOOK_CONTENT_STATUSES,
  FACEBOOK_CONTENT_TYPES,
  facebookAuraRequiresConfirmation,
  type FacebookAuraAction,
} from '@titan/shared';
import {
  FacebookBusinessError,
  type FacebookActor,
  type FacebookBusinessService,
} from '../services/facebook-business.service.js';
import { verifyFacebookWebhookSignature } from '../lib/facebook-graph.client.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';

const startOAuthSchema = z.object({ returnPath: z.string().trim().max(500).optional() });
const selectPageSchema = z.object({ pageId: z.string().trim().min(1).max(64) });

const createContentSchema = z.object({
  title: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(60_000),
  contentType: z.enum(FACEBOOK_CONTENT_TYPES as [string, ...string[]]).optional(),
  linkUrl: z.string().url().max(2000).nullable().optional(),
  marketingDraftId: z.string().uuid().nullable().optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
});

const updateContentSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  body: z.string().trim().min(1).max(60_000).optional(),
  linkUrl: z.string().url().max(2000).nullable().optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
});

const transitionSchema = z.object({
  to: z.enum(FACEBOOK_CONTENT_STATUSES as [string, ...string[]]),
  notes: z.string().trim().max(2000).optional(),
});

const rejectSchema = z.object({ notes: z.string().trim().min(1).max(2000) });

const attachMediaSchema = z.object({
  fileName: z.string().trim().min(1).max(300),
  mimeType: z.string().trim().min(1).max(100),
  byteSize: z.number().int().positive(),
  sourceUrl: z.string().url().max(2000).nullable().optional(),
  storageKey: z.string().trim().max(500).nullable().optional(),
  sourceContext: z
    .enum(['job', 'customer', 'employee', 'vehicle', 'marketing_library', 'upload'])
    .optional(),
});

const draftReplySchema = z.object({
  body: z.string().trim().min(1).max(8000),
  auraGenerated: z.boolean().optional(),
});

const assignLeadSchema = z.object({ assignToUserId: z.string().uuid() });

const resolveDuplicateSchema = z.object({
  decision: z.enum(['merge', 'separate']),
  mergeIntoLeadId: z.string().uuid().optional(),
});

/**
 * AURA may prepare text but anything that reaches a customer needs an explicit
 * confirmation flag on the request, which the UI only sets after the user
 * confirms. A missing flag is refused rather than treated as consent.
 */
const auraConfirmSchema = z.object({
  action: z.enum([
    'draft_post',
    'improve_copy',
    'suggest_schedule',
    'draft_comment_reply',
    'draft_lead_reply',
    'summarise_performance',
  ]),
  confirmed: z.boolean().optional(),
});

type RouterDeps = {
  facebookBusinessService: FacebookBusinessService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
  appUrl: string;
};

function toActor(req: import('express').Request): FacebookActor {
  const auth = (req as AuthenticatedRequest).auth;
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

const STATUS_BY_CODE: Record<string, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFIGURATION_REQUIRED: 503,
  CONNECTION_NOT_USABLE: 409,
  MISSING_PERMISSION: 403,
  NOT_AUTHORISED: 409,
  DUPLICATE_PUBLISH: 409,
  PUBLISH_FAILED: 502,
  REPLY_FAILED: 502,
  SYNC_FAILED: 502,
  CANCEL_FAILED: 502,
  IMMUTABLE: 409,
  INVALID_TRANSITION: 409,
  ALREADY_IMPORTED: 409,
  PAGE_NOT_AVAILABLE: 409,
  META_PAGE_LIST_EMPTY: 409,
  META_PAGE_LIST_FAILED: 502,
  META_PAGE_ROW_INCOMPLETE: 409,
  META_PAGE_TOKEN_UNAVAILABLE: 409,
  META_TOKEN_SCOPE_MISMATCH: 403,
  PAGE_NOT_AUTHORISED: 403,
  DIRECT_PAGE_LOOKUP_READY: 409,
  DIRECT_PAGE_IDENTITY_AVAILABLE: 409,
  DIRECT_PAGE_TOKEN_AVAILABLE: 409,
  DIRECT_PAGE_TOKEN_UNAVAILABLE: 409,
  DIRECT_PAGE_PERMISSION_DENIED: 403,
  DIRECT_PAGE_NOT_FOUND: 404,
  DIRECT_PAGE_INVALID_FIELD: 400,
  FACEBOOK_PAGE_OBJECT_INACCESSIBLE: 403,
  DIRECT_PAGE_LOOKUP_FAILED: 502,
  PAGE_IDENTITY_MISMATCH: 409,
  BUSINESS_PERMISSION_REQUIRED: 403,
  BUSINESS_AUTHORIZATION_READY: 409,
  BUSINESS_PORTFOLIO_NOT_FOUND: 404,
  BUSINESS_PORTFOLIO_FOUND: 409,
  BUSINESS_PAGE_NOT_ASSIGNED: 404,
  BUSINESS_PAGE_DISCOVERED: 409,
  BUSINESS_PAGE_TOKEN_UNAVAILABLE: 409,
  BUSINESS_PAGE_CONNECTED: 409,
  META_APP_REVIEW_REQUIRED: 403,
  META_PROVIDER_FAILED: 502,
  FACEBOOK_PAGE_SELECTION_REQUIRED: 409,
};

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof FacebookBusinessError) {
    res
      .status(STATUS_BY_CODE[error.code] ?? 400)
      .json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

function wrap(
  res: import('express').Response,
  next: import('express').NextFunction,
  run: () => Promise<unknown>,
): void {
  run()
    .then((payload) => {
      if (!res.headersSent) res.json({ data: payload });
    })
    .catch((error) => {
      if (!handleError(res, error)) next(error);
    });
}

export function createFacebookBusinessRouter({
  facebookBusinessService,
  jwtSecret,
  authService,
  appUrl,
}: RouterDeps): Router {
  const router = Router();

  // ─── Public endpoints (no session) ─────────────────────────────────────────

  /**
   * Meta's subscription handshake. Answered only when the challenge carries the
   * verify token configured on this host.
   */
  router.get('/webhook', (req, res) => {
    const verifyToken = facebookBusinessService.getWebhookVerifyToken();
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (!verifyToken || mode !== 'subscribe' || token !== verifyToken) {
      res.sendStatus(403);
      return;
    }
    res.status(200).send(String(challenge ?? ''));
  });

  /**
   * Webhook receiver. The raw body is required because the signature is
   * computed over the exact bytes Meta sent — re-serialising parsed JSON
   * produces a different digest and would reject every genuine delivery.
   */
  router.post('/webhook', raw({ type: '*/*', limit: '1mb' }), (req, res, next) => {
    const appSecret = facebookBusinessService.getAppSecret();
    if (!appSecret) {
      res.sendStatus(503);
      return;
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const signatureValid = verifyFacebookWebhookSignature({
      rawBody,
      signatureHeader: req.header('x-hub-signature-256'),
      appSecret,
    });

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      payload = {};
    }

    facebookBusinessService
      .handleWebhook({ signatureValid, payload })
      .then((result) => {
        // Meta retries on any non-200, so a rejected signature still answers 403
        // deliberately rather than inviting an infinite redelivery loop.
        res.sendStatus(result.accepted ? 200 : 403);
      })
      .catch(next);
  });

  /** OAuth return leg. Meta redirects the browser here, so there is no session. */
  router.get('/oauth/callback', (req, res, next) => {
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    const fallback = `${appUrl.replace(/\/$/, '')}${FACEBOOK_BUSINESS_HREF}`;

    if (!code || !state) {
      const denied = typeof req.query.error === 'string' ? req.query.error : 'missing_code';
      res.redirect(`${fallback}?facebook=error&reason=${encodeURIComponent(denied)}`);
      return;
    }

    facebookBusinessService
      .handleOAuthCallback({ code, state })
      .then((result) => res.redirect(result.redirectUrl))
      .catch((error) => {
        if (error instanceof FacebookBusinessError) {
          res.redirect(`${fallback}?facebook=error&reason=${encodeURIComponent(error.code)}`);
          return;
        }
        next(error);
      });
  });

  // ─── Authenticated endpoints ───────────────────────────────────────────────

  router.use(createAuthMiddleware({ jwtSecret, authService }));

  router.get('/connection', (req, res, next) =>
    wrap(res, next, () => facebookBusinessService.getConnection(toActor(req))),
  );

  router.get('/capabilities', (req, res, next) =>
    wrap(res, next, () => facebookBusinessService.getCapabilities(toActor(req))),
  );

  router.post('/oauth/start', (req, res, next) => {
    const parsed = startOAuthSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid payload.' } });
      return;
    }
    wrap(res, next, () =>
      facebookBusinessService.startOAuth(toActor(req), parsed.data.returnPath ?? null),
    );
  });

  router.post('/oauth/start-page-read', (req, res, next) => {
    const parsed = startOAuthSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid payload.' } });
      return;
    }
    wrap(res, next, () =>
      facebookBusinessService.startPageReadOAuth(toActor(req), parsed.data.returnPath ?? null),
    );
  });

  router.post('/oauth/start-business-portfolio', (req, res, next) => {
    const parsed = startOAuthSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid payload.' } });
      return;
    }
    wrap(res, next, () =>
      facebookBusinessService.startBusinessPortfolioOAuth(
        toActor(req),
        parsed.data.returnPath ?? null,
      ),
    );
  });

  router.get('/pages', (req, res, next) =>
    wrap(res, next, async () => {
      const discovery = await facebookBusinessService.discoverPagesForSelection(toActor(req));
      return {
        ...discovery,
        pendingPageCandidate: discovery.pendingPageCandidate,
        directLookup: discovery.directLookup,
        businessPortfolio: discovery.businessPortfolio,
        needsBusinessPortfolioAccess: discovery.needsBusinessPortfolioAccess,
        pages: discovery.pages.map((page) => ({
          id: page.id,
          name: page.name,
          category: page.category,
          tasks: page.tasks,
          selectable: page.selectable,
          status: page.status,
          statusDetail: page.statusDetail,
          diagnostics: page.diagnostics,
        })),
      };
    }),
  );

  router.post('/pages/select', (req, res, next) => {
    const parsed = selectPageSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'A pageId is required.' } });
      return;
    }
    wrap(res, next, () => facebookBusinessService.selectPage(toActor(req), parsed.data.pageId));
  });

  router.post('/connection/check', (req, res, next) =>
    wrap(res, next, () => facebookBusinessService.checkConnection(toActor(req))),
  );

  router.post('/connection/disconnect', (req, res, next) =>
    wrap(res, next, () => facebookBusinessService.disconnect(toActor(req))),
  );

  // ─── Content ───────────────────────────────────────────────────────────────

  router.get('/content', (req, res, next) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    wrap(res, next, () =>
      facebookBusinessService.listContent(
        toActor(req),
        status as Parameters<FacebookBusinessService['listContent']>[1],
      ),
    );
  });

  router.post('/content', (req, res, next) => {
    const parsed = createContentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'INVALID_REQUEST', message: 'Invalid Facebook post payload.' } });
      return;
    }
    wrap(res, next, () =>
      facebookBusinessService.createContent(toActor(req), {
        ...parsed.data,
        contentType: parsed.data.contentType as Parameters<
          FacebookBusinessService['createContent']
        >[1]['contentType'],
      }),
    );
  });

  router.patch('/content/:contentId', (req, res, next) => {
    const parsed = updateContentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid update payload.' } });
      return;
    }
    wrap(res, next, () =>
      facebookBusinessService.updateContent(toActor(req), req.params.contentId!, parsed.data),
    );
  });

  router.post('/content/:contentId/transition', (req, res, next) => {
    const parsed = transitionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid transition.' } });
      return;
    }
    wrap(res, next, () =>
      facebookBusinessService.transitionContent(
        toActor(req),
        req.params.contentId!,
        parsed.data.to as Parameters<FacebookBusinessService['transitionContent']>[2],
        parsed.data.notes,
      ),
    );
  });

  router.post('/content/:contentId/reject', (req, res, next) => {
    const parsed = rejectSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'INVALID_REQUEST', message: 'Rejection notes are required.' } });
      return;
    }
    wrap(res, next, () =>
      facebookBusinessService.rejectContent(toActor(req), req.params.contentId!, parsed.data.notes),
    );
  });

  router.post('/content/:contentId/publish', (req, res, next) =>
    wrap(res, next, () => facebookBusinessService.publishContent(toActor(req), req.params.contentId!)),
  );

  router.post('/content/:contentId/cancel', (req, res, next) =>
    wrap(res, next, () => facebookBusinessService.cancelScheduled(toActor(req), req.params.contentId!)),
  );

  router.post('/content/:contentId/media', (req, res, next) => {
    const parsed = attachMediaSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid media payload.' } });
      return;
    }
    wrap(res, next, () =>
      facebookBusinessService.attachMedia(toActor(req), req.params.contentId!, parsed.data),
    );
  });

  router.post('/content/:contentId/privacy-acknowledge', (req, res, next) =>
    wrap(res, next, async () => {
      await facebookBusinessService.acknowledgePrivacy(toActor(req), req.params.contentId!);
      return { acknowledged: true };
    }),
  );

  router.get('/content/:contentId/attribution', (req, res, next) =>
    wrap(res, next, () => facebookBusinessService.getAttribution(toActor(req), req.params.contentId!)),
  );

  // ─── Comments ──────────────────────────────────────────────────────────────

  router.get('/comments', (req, res, next) =>
    wrap(res, next, () =>
      facebookBusinessService.listComments(toActor(req), req.query.unanswered === 'true'),
    ),
  );

  router.post('/comments/:commentId/reply', (req, res, next) => {
    const parsed = draftReplySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Reply body is required.' } });
      return;
    }
    wrap(res, next, () =>
      facebookBusinessService.draftCommentReply(
        toActor(req),
        req.params.commentId!,
        parsed.data.body,
        parsed.data.auraGenerated ?? false,
      ),
    );
  });

  router.post('/replies/:replyId/approve-send', (req, res, next) =>
    wrap(res, next, () =>
      facebookBusinessService.approveAndSendCommentReply(toActor(req), req.params.replyId!),
    ),
  );

  router.post('/comments/:commentId/convert-to-lead', (req, res, next) =>
    wrap(res, next, () =>
      facebookBusinessService.convertCommentToLead(toActor(req), req.params.commentId!),
    ),
  );

  // ─── Leads ─────────────────────────────────────────────────────────────────

  router.get('/leads', (req, res, next) =>
    wrap(res, next, () => facebookBusinessService.listLeads(toActor(req))),
  );

  router.post('/leads/:fbLeadId/assign', (req, res, next) => {
    const parsed = assignLeadSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'assignToUserId is required.' } });
      return;
    }
    wrap(res, next, () =>
      facebookBusinessService.assignLead(toActor(req), req.params.fbLeadId!, parsed.data.assignToUserId),
    );
  });

  router.post('/leads/:fbLeadId/resolve-duplicate', (req, res, next) => {
    const parsed = resolveDuplicateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid decision.' } });
      return;
    }
    wrap(res, next, () =>
      facebookBusinessService.resolveLeadDuplicate(
        toActor(req),
        req.params.fbLeadId!,
        parsed.data.decision,
        parsed.data.mergeIntoLeadId,
      ),
    );
  });

  // ─── Insights, sync, notifications, dashboard ──────────────────────────────

  router.get('/insights', (req, res, next) =>
    wrap(res, next, () => facebookBusinessService.getInsights(toActor(req))),
  );

  router.post('/insights/refresh', (req, res, next) =>
    wrap(res, next, () => facebookBusinessService.refreshInsights(toActor(req))),
  );

  router.post('/sync', (req, res, next) =>
    wrap(res, next, () => facebookBusinessService.runSync(toActor(req), 'manual')),
  );

  router.get('/sync-runs', (req, res, next) =>
    wrap(res, next, () => facebookBusinessService.listSyncRuns(toActor(req))),
  );

  router.get('/notifications', (req, res, next) =>
    wrap(res, next, () => facebookBusinessService.listNotifications(toActor(req))),
  );

  router.get('/dashboard-card', (req, res, next) =>
    wrap(res, next, () => facebookBusinessService.getDashboardCard(toActor(req))),
  );

  /** Reports whether an AURA action needs the user to confirm before it runs. */
  router.post('/aura/precheck', (req, res, next) => {
    const parsed = auraConfirmSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid AURA action.' } });
      return;
    }
    const action = parsed.data.action as FacebookAuraAction;
    const requiresConfirmation = facebookAuraRequiresConfirmation(action);

    wrap(res, next, async () => ({
      action,
      requiresConfirmation,
      allowed: !requiresConfirmation || parsed.data.confirmed === true,
      note: requiresConfirmation
        ? 'This action would reach a customer. AURA prepares the text; a person must confirm before it is sent.'
        : 'AURA may prepare this internally without a confirmation step.',
    }));
  });

  return router;
}
