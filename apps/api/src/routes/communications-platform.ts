import { Router } from 'express';
import { z } from 'zod';
import { isPlatformOwnerRole } from '@titan/auth';
import { canConnectBusinessGmail } from '@titan/shared';
import type { TeamService } from '../services/team.service.js';
import {
  CommunicationsPlatformService,
  mapCommunicationsPlatformError,
  type CommPlatformActor,
} from '../services/communications-platform.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const inboxFilterSchema = z.object({
  channel: z.enum(['email', 'whatsapp', 'all']).optional(),
  accountKind: z
    .enum(['business_gmail', 'business_whatsapp', 'personal_whatsapp', 'business', 'personal', 'all'])
    .optional(),
  unread: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  urgent: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  participantKind: z.enum(['customer', 'supplier', 'staff', 'unknown', 'all']).optional(),
  folder: z.enum(['inbox', 'sent', 'drafts', 'labels', 'all', 'chats']).optional(),
  q: z.string().trim().max(500).optional(),
  linkTargetType: z
    .enum(['customer', 'lead', 'job', 'quote', 'invoice', 'property', 'supplier', 'staff'])
    .optional(),
  linkTargetId: z.string().uuid().optional(),
  includePersonal: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const gmailDraftSchema = z.object({
  to: z.array(z.string().email()).min(1).max(50),
  cc: z.array(z.string().email()).max(50).optional(),
  bcc: z.array(z.string().email()).max(50).optional(),
  subject: z.string().trim().min(1).max(500),
  bodyText: z.string().trim().min(1).max(50000),
  replyToMessageId: z.string().trim().max(200).optional(),
  forwardOfMessageId: z.string().trim().max(200).optional(),
  labelIds: z.array(z.string()).max(20).optional(),
});

const gmailSaveSchema = z.object({
  emailAddress: z.string().email().optional(),
  accessToken: z.string().trim().max(5000).optional(),
  refreshToken: z.string().trim().max(5000).optional(),
  expiresAt: z.string().datetime().optional(),
  syncEnabled: z.boolean().optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
});

const personalWaSchema = z.object({
  label: z.string().trim().max(200).optional(),
  phoneNumber: z.string().trim().max(50).optional(),
  accessToken: z.string().trim().max(5000).optional(),
  phoneNumberId: z.string().trim().max(200).optional(),
  businessAccountId: z.string().trim().max(200).optional(),
  syncEnabled: z.boolean().optional(),
  privateByDefault: z.boolean().optional(),
});

const importDecisionSchema = z.object({
  promptId: z.string().uuid().optional(),
  contactPhone: z.string().trim().max(50).optional(),
  contactName: z.string().trim().max(200).optional(),
  action: z.enum(['import', 'import_from', 'create_customer', 'link', 'keep_private']),
  linkTargetType: z
    .enum(['customer', 'lead', 'job', 'quote', 'invoice', 'property', 'supplier', 'staff'])
    .optional(),
  linkTargetId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
  importFromAt: z.string().datetime().optional(),
});

const linkSchema = z.object({
  linkTargetType: z.enum([
    'customer',
    'lead',
    'job',
    'quote',
    'invoice',
    'property',
    'supplier',
    'staff',
  ]),
  linkTargetId: z.string().uuid(),
});

const testSchema = z.object({
  accountKind: z.enum(['business_gmail', 'business_whatsapp', 'personal_whatsapp']),
});

const gmailOAuthStartSchema = z.object({
  returnPath: z.string().trim().max(300).optional(),
});

const gmailSyncSchema = z.object({
  folder: z.enum(['inbox', 'sent', 'drafts', 'labels', 'all', 'chats']).optional(),
  maxMessages: z.number().int().min(1).max(100).optional(),
});

const auraAssistSchema = z.object({
  mode: z.enum(['summarize', 'draft_reply']),
});

type RouterDeps = {
  communicationsPlatformService: CommunicationsPlatformService;
  gmailOAuthService: import('../services/gmail-oauth.service.js').GmailOAuthService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
  appUrl: string;
};

function getActor(req: AuthenticatedRequest): CommPlatformActor {
  const auth = req.auth!;
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

function denyPersonal(res: import('express').Response) {
  res.status(403).json({
    error: {
      code: 'FORBIDDEN',
      message: 'Personal WhatsApp Assistant is Platform Owner only',
    },
  });
}

export function createCommunicationsPlatformRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    authService: deps.authService,
  });
  const requireRead = requireAnyPermission(
    'communications:read',
    'communications:write',
    'communications:manage',
    'communications_intelligence:read',
    'integrations:read',
    'integrations:manage',
    '*',
  );
  const requireWrite = requireAnyPermission(
    'communications:write',
    'communications:manage',
    'integrations:manage',
    '*',
  );

  // OAuth callback is unauthenticated (Google redirect) — registered before auth middleware.
  router.get('/gmail/oauth/callback', async (req, res) => {
    try {
      const redirectUrl = await deps.gmailOAuthService.handleOAuthCallback({
        code: req.query.code as string | string[] | undefined,
        state: req.query.state as string | string[] | undefined,
        error: req.query.error as string | string[] | undefined,
        errorDescription: req.query.error_description as string | string[] | undefined,
      });
      res.redirect(redirectUrl);
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      const fallback = new URL('/communications-hub', deps.appUrl);
      fallback.searchParams.set('gmail', 'error');
      fallback.searchParams.set('message', mapped.message);
      res.redirect(fallback.toString());
    }
  });

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await deps.teamService.ensureDefaultRoles(getActor(req as AuthenticatedRequest).companyId);
    next();
  });

  router.get('/hub', requireRead, async (req, res) => {
    try {
      const dashboard = await deps.communicationsPlatformService.getHubDashboard(
        getActor(req as AuthenticatedRequest),
      );
      res.json({ data: { dashboard } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.get('/inbox', requireRead, async (req, res) => {
    try {
      const parsed = inboxFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid inbox filters',
            details: parsed.error.flatten(),
          },
        });
        return;
      }
      const result = await deps.communicationsPlatformService.listInbox(
        getActor(req as AuthenticatedRequest),
        parsed.data,
      );
      res.json({ data: { inbox: result } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.get('/search', requireRead, async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const result = await deps.communicationsPlatformService.searchBusiness(
        getActor(req as AuthenticatedRequest),
        q,
        typeof req.query.limit === 'string' ? Number(req.query.limit) : 50,
      );
      res.json({ data: { search: result } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.get('/settings', requireRead, async (req, res) => {
    try {
      const settings = await deps.communicationsPlatformService.getSettings(
        getActor(req as AuthenticatedRequest),
      );
      res.json({ data: { settings } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.get('/aura-hooks', requireRead, async (req, res) => {
    const hooks = deps.communicationsPlatformService.listAuraHooks(
      getActor(req as AuthenticatedRequest),
    );
    res.json({ data: { hooks } });
  });

  // --- Gmail OAuth / sync ---
  router.get('/gmail/oauth/status', requireRead, async (req, res) => {
    try {
      const actor = getActor(req as AuthenticatedRequest);
      const status = await deps.gmailOAuthService.getOAuthStatus(actor.companyId);
      res.json({ data: { status } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.post('/gmail/oauth/start', requireWrite, async (req, res) => {
    try {
      const actor = getActor(req as AuthenticatedRequest);
      if (!canConnectBusinessGmail(actor)) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Only Platform Owner or Company Owner can connect Business Gmail',
          },
        });
        return;
      }
      if (!deps.gmailOAuthService.isAppConfigured()) {
        res.status(503).json({
          error: {
            code: 'NOT_CONFIGURED',
            message:
              'Business Gmail is not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the API.',
          },
        });
        return;
      }
      const parsed = gmailOAuthStartSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid Gmail OAuth start payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }
      const result = await deps.gmailOAuthService.startOAuth({
        companyId: actor.companyId,
        userId: actor.userId,
        returnPath: parsed.data.returnPath ?? '/communications-hub',
      });
      res.json({ data: result });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.post('/gmail/sync', requireWrite, async (req, res) => {
    try {
      const parsed = gmailSyncSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid Gmail sync payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }
      // Accept quickly — import continues in-process after response (see syncGmailMailbox).
      const result = await deps.communicationsPlatformService.syncGmailMailbox(
        getActor(req as AuthenticatedRequest),
        parsed.data,
      );
      const status = result.syncStatus === 'syncing' ? 202 : 200;
      res.status(status).json({ data: { sync: result } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.get(
    '/gmail/inbox/:id/attachments/:attachmentId',
    requireRead,
    async (req, res) => {
      try {
        const result = await deps.communicationsPlatformService.getGmailAttachment(
          getActor(req as AuthenticatedRequest),
          getRouteParam(req.params.id),
          getRouteParam(req.params.attachmentId),
        );
        res.json({ data: result });
      } catch (error) {
        const mapped = mapCommunicationsPlatformError(error);
        res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
      }
    },
  );

  router.post('/gmail/inbox/:id/aura-assist', requireWrite, async (req, res) => {
    try {
      const parsed = auraAssistSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid AURA assist payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }
      const result = await deps.communicationsPlatformService.auraAssistInbox(
        getActor(req as AuthenticatedRequest),
        getRouteParam(req.params.id),
        parsed.data.mode,
      );
      res.json({ data: { assist: result } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  /** Business inbox AURA assist (Gmail + Business WhatsApp). Never auto-sends. */
  router.post('/inbox/:id/aura-assist', requireWrite, async (req, res) => {
    try {
      const parsed = auraAssistSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid AURA assist payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }
      const result = await deps.communicationsPlatformService.auraAssistInbox(
        getActor(req as AuthenticatedRequest),
        getRouteParam(req.params.id),
        parsed.data.mode,
      );
      res.json({ data: { assist: result } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  // --- Gmail mailbox ---
  router.get('/gmail/:folder', requireRead, async (req, res) => {
    try {
      const folder = getRouteParam(req.params.folder) as
        | 'inbox'
        | 'sent'
        | 'drafts'
        | 'labels'
        | 'all'
        | 'chats';
      const mailbox = await deps.communicationsPlatformService.getGmailMailbox(
        getActor(req as AuthenticatedRequest),
        folder,
      );
      res.json({ data: { mailbox } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.post('/gmail/drafts', requireWrite, async (req, res) => {
    try {
      const parsed = gmailDraftSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid Gmail draft',
            details: parsed.error.flatten(),
          },
        });
        return;
      }
      const draft = await deps.communicationsPlatformService.createGmailDraft(
        getActor(req as AuthenticatedRequest),
        parsed.data,
      );
      res.status(201).json({ data: { draft } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.post('/gmail/drafts/:id/approve', requireWrite, async (req, res) => {
    try {
      const draft = await deps.communicationsPlatformService.approveGmailDraft(
        getActor(req as AuthenticatedRequest),
        getRouteParam(req.params.id),
      );
      res.json({ data: { draft } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.post('/gmail/drafts/:id/execute', requireWrite, async (req, res) => {
    try {
      const draft = await deps.communicationsPlatformService.executeGmailDraft(
        getActor(req as AuthenticatedRequest),
        getRouteParam(req.params.id),
      );
      res.json({ data: { draft } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.put('/connections/gmail', requireWrite, async (req, res) => {
    try {
      const actor = getActor(req as AuthenticatedRequest);
      if (!canConnectBusinessGmail(actor)) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Only Platform Owner or Company Owner can connect Business Gmail',
          },
        });
        return;
      }
      const parsed = gmailSaveSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid Gmail connection payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }
      const connection = await deps.communicationsPlatformService.saveGmailConnection(
        actor,
        parsed.data,
      );
      res.json({ data: { connection } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.delete('/connections/gmail', requireWrite, async (req, res) => {
    try {
      const actor = getActor(req as AuthenticatedRequest);
      if (!canConnectBusinessGmail(actor)) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Only Platform Owner or Company Owner can disconnect Business Gmail',
          },
        });
        return;
      }
      const connection = await deps.communicationsPlatformService.disconnectGmail(actor);
      res.json({ data: { connection } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  // --- Business WhatsApp ---
  router.get('/whatsapp/business/chats', requireRead, async (req, res) => {
    try {
      const chats = await deps.communicationsPlatformService.listBusinessWhatsappChats(
        getActor(req as AuthenticatedRequest),
      );
      res.json({ data: { chats } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.post('/inbox/:id/link', requireWrite, async (req, res) => {
    try {
      const parsed = linkSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid link payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }
      const item = await deps.communicationsPlatformService.linkInboxItem(
        getActor(req as AuthenticatedRequest),
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { item } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  // --- Personal WhatsApp (Platform Owner only) ---
  router.get('/whatsapp/personal/chats', requireRead, async (req, res) => {
    const actor = getActor(req as AuthenticatedRequest);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    try {
      const chats = await deps.communicationsPlatformService.listPersonalChats(actor);
      res.json({ data: { chats } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.get('/whatsapp/personal/smart-detection', requireRead, async (req, res) => {
    const actor = getActor(req as AuthenticatedRequest);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    try {
      const prompts = await deps.communicationsPlatformService.listSmartDetectionPrompts(actor);
      res.json({ data: { prompts, autoImport: false as const } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.post('/whatsapp/personal/import-decisions', requireWrite, async (req, res) => {
    const actor = getActor(req as AuthenticatedRequest);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    try {
      const parsed = importDecisionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid import decision',
            details: parsed.error.flatten(),
          },
        });
        return;
      }
      const decision = await deps.communicationsPlatformService.recordImportDecision(
        actor,
        parsed.data,
      );
      res.status(201).json({ data: { decision } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.put('/connections/personal-whatsapp', requireWrite, async (req, res) => {
    const actor = getActor(req as AuthenticatedRequest);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    try {
      const parsed = personalWaSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid Personal WhatsApp payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }
      const connection = await deps.communicationsPlatformService.savePersonalWhatsapp(
        actor,
        parsed.data,
      );
      res.json({ data: { connection } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.delete('/connections/personal-whatsapp', requireWrite, async (req, res) => {
    const actor = getActor(req as AuthenticatedRequest);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    try {
      const connection = await deps.communicationsPlatformService.disconnectPersonalWhatsapp(actor);
      res.json({ data: { connection } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.post('/connections/test', requireWrite, async (req, res) => {
    try {
      const parsed = testSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid connection test payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }
      const actor = getActor(req as AuthenticatedRequest);
      if (parsed.data.accountKind === 'personal_whatsapp' && !isPlatformOwnerRole(actor)) {
        denyPersonal(res);
        return;
      }
      const result = await deps.communicationsPlatformService.testConnection(
        actor,
        parsed.data.accountKind,
      );
      res.json({ data: { result } });
    } catch (error) {
      const mapped = mapCommunicationsPlatformError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  return router;
}
