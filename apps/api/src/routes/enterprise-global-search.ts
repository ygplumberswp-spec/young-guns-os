import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseGlobalSearchService } from '../services/enterprise-global-search.service.js';
import { EnterpriseGlobalSearchError } from '../services/enterprise-global-search.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const searchModeSchema = z.enum(['keyword', 'fuzzy', 'natural_language', 'hybrid']);
const entityTypeSchema = z.enum([
  'customer',
  'lead',
  'contact',
  'job',
  'quote',
  'invoice',
  'payment',
  'purchase_order',
  'supplier',
  'inventory',
  'asset',
  'vehicle',
  'technician',
  'property',
  'document',
  'ocr_content',
  'knowledge_article',
  'communication',
  'email',
  'whatsapp',
  'note',
  'task',
  'calendar_event',
  'ai_conversation',
  'audit_log',
  'automation',
  'industry_pack',
  'other',
]);
const feedScopeSchema = z.enum(['personal', 'team', 'company', 'department', 'ai', 'system']);

const platformConfigSchema = z.object({
  searchPolicy: z.record(z.unknown()).optional(),
  timelinePolicy: z.record(z.unknown()).optional(),
  feedPolicy: z.record(z.unknown()).optional(),
  indexPolicy: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const globalSearchSchema = z.object({
  query: z.string().trim().min(1).max(500),
  searchMode: searchModeSchema.optional(),
  entityTypes: z.array(entityTypeSchema).optional(),
  filters: z.record(z.unknown()).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const savedSearchSchema = z.object({
  name: z.string().trim().min(1).max(200),
  query: z.string().trim().min(1).max(500),
  searchMode: searchModeSchema.optional(),
  filters: z.record(z.unknown()).optional(),
  entityTypes: z.array(z.string()).optional(),
});

const searchSuggestionSchema = z.object({
  suggestionText: z.string().trim().min(1).max(500),
  suggestionType: z.string().trim().max(100).optional(),
  entityType: entityTypeSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

const activityFeedConfigSchema = z.object({
  feedScope: feedScopeSchema.optional(),
  name: z.string().trim().min(1).max(200),
  filters: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

const actionDraftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

type RouterDeps = {
  enterpriseGlobalSearchService: EnterpriseGlobalSearchService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function staffScope(req: import('express').Request) {
  const auth = getAuth(req);
  return { companyId: auth.companyId, userId: auth.userId };
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseGlobalSearchError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseGlobalSearchRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    authService: deps.authService,
  });
  const requireRead = requireAnyPermission(
    'search:read',
    'search:manage',
    'intelligence:read',
    'ops:read',
  );
  const requireWrite = requireAnyPermission('search:write', 'search:manage', 'ops:manage');
  const requireManage = requireAnyPermission('search:manage', 'ops:manage');

  router.use(requireStaffAuth);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dashboard = await deps.enterpriseGlobalSearchService.getDashboard(
        auth.companyId,
        auth.userId,
      );
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireRead, async (req, res) => {
    try {
      const platformConfig = await deps.enterpriseGlobalSearchService.getPlatformConfig(
        getAuth(req).companyId,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireManage, async (req, res) => {
    try {
      const input = platformConfigSchema.parse(req.body);
      const platformConfig = await deps.enterpriseGlobalSearchService.updatePlatformConfig(
        staffScope(req),
        input,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/search', requireRead, async (req, res) => {
    try {
      const input = globalSearchSchema.parse(req.body);
      const auth = getAuth(req);
      const results = await deps.enterpriseGlobalSearchService.globalSearch(
        { companyId: auth.companyId, userId: auth.userId },
        input,
        auth.permissions,
      );
      res.json({ data: { results } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/timeline', requireRead, async (req, res) => {
    try {
      const entityType = entityTypeSchema.parse(req.query.entityType);
      const entityId = z.string().uuid().parse(req.query.entityId);
      const limit = req.query.limit
        ? z.coerce.number().int().min(1).max(200).parse(req.query.limit)
        : undefined;
      const timeline = await deps.enterpriseGlobalSearchService.getTimeline(staffScope(req), {
        entityType,
        entityId,
        limit,
      });
      res.json({ data: { timeline } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/relationships', requireRead, async (req, res) => {
    try {
      const entityType = entityTypeSchema.parse(req.query.entityType);
      const entityId = z.string().uuid().parse(req.query.entityId);
      const limit = req.query.limit
        ? z.coerce.number().int().min(1).max(100).parse(req.query.limit)
        : undefined;
      const relationships = await deps.enterpriseGlobalSearchService.getRelationships(
        staffScope(req),
        {
          entityType,
          entityId,
          limit,
        },
      );
      res.json({ data: { relationships } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/activity-feed', requireRead, async (req, res) => {
    try {
      const feedScope = req.query.feedScope
        ? feedScopeSchema.parse(req.query.feedScope)
        : undefined;
      const moduleKey = typeof req.query.moduleKey === 'string' ? req.query.moduleKey : undefined;
      const eventType = typeof req.query.eventType === 'string' ? req.query.eventType : undefined;
      const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined;
      const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : undefined;
      const limit = req.query.limit
        ? z.coerce.number().int().min(1).max(100).parse(req.query.limit)
        : undefined;
      const activityFeed = await deps.enterpriseGlobalSearchService.getActivityFeed(
        staffScope(req),
        {
          feedScope,
          moduleKey,
          eventType,
          fromDate,
          toDate,
          limit,
        },
      );
      res.json({ data: { activityFeed } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/saved-searches', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const savedSearches = await deps.enterpriseGlobalSearchService.listSavedSearches(
        auth.companyId,
        auth.userId,
      );
      res.json({ data: { savedSearches } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/saved-searches', requireWrite, async (req, res) => {
    try {
      const input = savedSearchSchema.parse(req.body);
      const savedSearch = await deps.enterpriseGlobalSearchService.createSavedSearch(
        staffScope(req),
        input,
      );
      res.status(201).json({ data: { savedSearch } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/recent-searches', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const recentSearches = await deps.enterpriseGlobalSearchService.listRecentSearches(
        auth.companyId,
        auth.userId,
      );
      res.json({ data: { recentSearches } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/search-suggestions', requireRead, async (req, res) => {
    try {
      const searchSuggestions = await deps.enterpriseGlobalSearchService.listSearchSuggestions(
        getAuth(req).companyId,
      );
      res.json({ data: { searchSuggestions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/search-suggestions', requireWrite, async (req, res) => {
    try {
      const input = searchSuggestionSchema.parse(req.body);
      const searchSuggestion = await deps.enterpriseGlobalSearchService.createSearchSuggestion(
        staffScope(req),
        input,
      );
      res.status(201).json({ data: { searchSuggestion } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/search-alerts', requireRead, async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const searchAlerts = await deps.enterpriseGlobalSearchService.listSearchAlerts(
        getAuth(req).companyId,
        { status },
      );
      res.json({ data: { searchAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/search-alerts/sync', requireWrite, async (req, res) => {
    try {
      const searchAlerts = await deps.enterpriseGlobalSearchService.syncSearchAlerts(
        staffScope(req),
      );
      res.json({ data: { searchAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/search-index/refresh', requireManage, async (req, res) => {
    try {
      const result = await deps.enterpriseGlobalSearchService.refreshSearchIndex(staffScope(req));
      res.json({ data: result });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseGlobalSearchService.captureAnalytics(staffScope(req));
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/activity-feed-configs', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const activityFeedConfigs = await deps.enterpriseGlobalSearchService.listActivityFeedConfigs(
        auth.companyId,
        auth.userId,
      );
      res.json({ data: { activityFeedConfigs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/activity-feed-configs', requireWrite, async (req, res) => {
    try {
      const input = activityFeedConfigSchema.parse(req.body);
      const activityFeedConfig = await deps.enterpriseGlobalSearchService.createActivityFeedConfig(
        staffScope(req),
        input,
      );
      res.status(201).json({ data: { activityFeedConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/action-drafts', requireRead, async (req, res) => {
    try {
      const actionDrafts = await deps.enterpriseGlobalSearchService.listActionDrafts(
        getAuth(req).companyId,
      );
      res.json({ data: { actionDrafts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/action-drafts', requireWrite, async (req, res) => {
    try {
      const input = actionDraftSchema.parse(req.body);
      const actionDraft = await deps.enterpriseGlobalSearchService.createActionDraft(
        staffScope(req),
        input,
      );
      res.status(201).json({ data: { actionDraft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/audit-logs', requireRead, async (req, res) => {
    try {
      const auditLogs = await deps.enterpriseGlobalSearchService.listAuditLogs(
        getAuth(req).companyId,
      );
      res.json({ data: { auditLogs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
