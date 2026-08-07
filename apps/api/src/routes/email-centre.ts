import { Router } from 'express';
import { z } from 'zod';
import type { TeamService } from '../services/team.service.js';
import {
  EmailCentreService,
  mapEmailCentreError,
} from '../services/email-centre.service.js';
import type { CommPlatformActor } from '../services/communications-platform.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const mailboxFilterSchema = z.object({
  folder: z.enum(['inbox', 'sent', 'drafts', 'labels', 'all', 'chats']).optional(),
  unread: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  urgent: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  q: z.string().trim().max(500).optional(),
  linkTargetType: z
    .enum(['customer', 'lead', 'job', 'quote', 'invoice', 'property', 'supplier', 'staff'])
    .optional(),
  linkTargetId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const attachmentRefSchema = z.object({
  attachmentKind: z.enum([
    'quote',
    'boq',
    'invoice',
    'receipt',
    'coc',
    'report',
    'job_photo',
    'document',
  ]),
  entityType: z.string().trim().min(1).max(100),
  entityId: z.string().uuid(),
  documentId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(300),
  fileName: z.string().trim().max(500).optional(),
  mimeType: z.string().trim().max(200).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const draftSchema = z.object({
  to: z.array(z.string().email()).min(1).max(50),
  cc: z.array(z.string().email()).max(50).optional(),
  bcc: z.array(z.string().email()).max(50).optional(),
  subject: z.string().trim().min(1).max(500),
  bodyText: z.string().trim().min(1).max(50000),
  replyToMessageId: z.string().trim().max(200).optional(),
  forwardOfMessageId: z.string().trim().max(200).optional(),
  inboxItemId: z.string().uuid().optional(),
  labelIds: z.array(z.string()).max(20).optional(),
  attachmentLinks: z.array(attachmentRefSchema).max(20).optional(),
});

const linkSchema = z.object({
  linkTargetType: z.enum(['customer', 'job', 'lead', 'quote', 'invoice']),
  linkTargetId: z.string().uuid(),
});

const attachmentSchema = attachmentRefSchema.extend({
  anchorType: z.enum([
    'inbox_item',
    'gmail_draft',
    'timeline_entry',
    'timeline_note',
    'whatsapp_message',
    'communication',
  ]),
  anchorId: z.string().uuid(),
});

const noteSchema = z.object({
  body: z.string().trim().min(1).max(10000),
  customerId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  statusUpdate: z.string().trim().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
  attachmentLinks: z.array(attachmentRefSchema).max(20).optional(),
});

const timelineFilterSchema = z.object({
  customerId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  channel: z
    .enum([
      'voice',
      'whatsapp',
      'sms',
      'email',
      'live_chat',
      'website_chat',
      'facebook_messenger',
      'instagram',
      'microsoft_teams',
      'slack',
      'custom',
      'all',
      'note',
      'attachment',
    ])
    .optional(),
  entryType: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

type RouterDeps = {
  emailCentreService: EmailCentreService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
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

function handleError(error: unknown, res: import('express').Response): boolean {
  const mapped = mapEmailCentreError(error);
  if (mapped.code === 'INTERNAL_ERROR') return false;
  res.status(mapped.status).json({
    error: { code: mapped.code, message: mapped.message },
  });
  return true;
}

export function createEmailCentreRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    authService: deps.authService,
  });
  const requireRead = requireAnyPermission(
    'communications:read',
    'communications:write',
    'communications:manage',
    '*',
  );
  const requireWrite = requireAnyPermission(
    'communications:write',
    'communications:manage',
    '*',
  );

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await deps.teamService.ensureDefaultRoles(getActor(req as AuthenticatedRequest).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res, next) => {
    try {
      const dashboard = await deps.emailCentreService.getDashboard(
        getActor(req as AuthenticatedRequest),
      );
      res.json({ data: { dashboard } });
    } catch (error) {
      if (!handleError(error, res)) next(error);
    }
  });

  router.get('/mailbox', requireRead, async (req, res, next) => {
    try {
      const filter = mailboxFilterSchema.parse(req.query);
      const mailbox = await deps.emailCentreService.listMailbox(
        getActor(req as AuthenticatedRequest),
        filter,
      );
      res.json({ data: { mailbox } });
    } catch (error) {
      if (!handleError(error, res)) next(error);
    }
  });

  router.get('/threads/:id', requireRead, async (req, res, next) => {
    try {
      const thread = await deps.emailCentreService.getThreadHistory(
        getActor(req as AuthenticatedRequest),
        getRouteParam(req.params.id),
      );
      res.json({ data: { thread } });
    } catch (error) {
      if (!handleError(error, res)) next(error);
    }
  });

  router.get('/drafts', requireRead, async (req, res, next) => {
    try {
      const drafts = await deps.emailCentreService.listDrafts(
        getActor(req as AuthenticatedRequest),
      );
      res.json({ data: { drafts } });
    } catch (error) {
      if (!handleError(error, res)) next(error);
    }
  });

  router.post('/drafts', requireWrite, async (req, res, next) => {
    try {
      const body = draftSchema.parse(req.body);
      const draft = await deps.emailCentreService.createReplyOrForwardDraft(
        getActor(req as AuthenticatedRequest),
        body,
      );
      res.status(201).json({ data: { draft } });
    } catch (error) {
      if (!handleError(error, res)) next(error);
    }
  });

  router.post('/drafts/:id/approve', requireWrite, async (req, res, next) => {
    try {
      const draft = await deps.emailCentreService.approveDraft(
        getActor(req as AuthenticatedRequest),
        getRouteParam(req.params.id),
      );
      res.json({ data: { draft } });
    } catch (error) {
      if (!handleError(error, res)) next(error);
    }
  });

  router.post('/drafts/:id/execute', requireWrite, async (req, res, next) => {
    try {
      const draft = await deps.emailCentreService.executeDraft(
        getActor(req as AuthenticatedRequest),
        getRouteParam(req.params.id),
      );
      res.json({ data: { draft } });
    } catch (error) {
      if (!handleError(error, res)) next(error);
    }
  });

  router.post('/mailbox/:id/link', requireWrite, async (req, res, next) => {
    try {
      const body = linkSchema.parse(req.body);
      const item = await deps.emailCentreService.linkEmail(
        getActor(req as AuthenticatedRequest),
        getRouteParam(req.params.id),
        body,
      );
      res.json({ data: { item } });
    } catch (error) {
      if (!handleError(error, res)) next(error);
    }
  });

  router.get('/attachments', requireRead, async (req, res, next) => {
    try {
      const query = z
        .object({
          anchorType: z
            .enum([
              'inbox_item',
              'gmail_draft',
              'timeline_entry',
              'timeline_note',
              'whatsapp_message',
              'communication',
            ])
            .optional(),
          anchorId: z.string().uuid().optional(),
          customerId: z.string().uuid().optional(),
          jobId: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        })
        .parse(req.query);
      const attachments = await deps.emailCentreService.listAttachments(
        getActor(req as AuthenticatedRequest),
        query,
      );
      res.json({ data: { attachments } });
    } catch (error) {
      if (!handleError(error, res)) next(error);
    }
  });

  router.post('/attachments', requireWrite, async (req, res, next) => {
    try {
      const body = attachmentSchema.parse(req.body);
      const attachment = await deps.emailCentreService.createAttachmentLink(
        getActor(req as AuthenticatedRequest),
        body,
      );
      res.status(201).json({ data: { attachment } });
    } catch (error) {
      if (!handleError(error, res)) next(error);
    }
  });

  router.get('/timeline', requireRead, async (req, res, next) => {
    try {
      const filter = timelineFilterSchema.parse(req.query);
      const timeline = await deps.emailCentreService.getTimeline(
        getActor(req as AuthenticatedRequest),
        filter,
      );
      res.json({ data: { timeline } });
    } catch (error) {
      if (!handleError(error, res)) next(error);
    }
  });

  router.post('/timeline/sync', requireWrite, async (req, res, next) => {
    try {
      const timeline = await deps.emailCentreService.syncTimeline(
        getActor(req as AuthenticatedRequest),
      );
      res.json({ data: { timeline } });
    } catch (error) {
      if (!handleError(error, res)) next(error);
    }
  });

  router.post('/timeline/notes', requireWrite, async (req, res, next) => {
    try {
      const body = noteSchema.parse(req.body);
      const note = await deps.emailCentreService.createTimelineNote(
        getActor(req as AuthenticatedRequest),
        body,
      );
      res.status(201).json({ data: { note } });
    } catch (error) {
      if (!handleError(error, res)) next(error);
    }
  });

  return router;
}
