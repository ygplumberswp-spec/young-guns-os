import { Router } from 'express';
import { z } from 'zod';
import type { KnowledgeService } from '../services/knowledge.service.js';
import { KnowledgeError } from '../services/knowledge.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const articleTypeSchema = z.enum([
  'article',
  'procedure',
  'documentation',
  'troubleshooting',
  'technical_reference',
  'internal_note',
  'faq',
]);
const contentStatusSchema = z.enum(['draft', 'pending_approval', 'published', 'archived']);
const policyTypeSchema = z.enum(['safety', 'hr', 'operational', 'financial', 'compliance']);
const trainingContentTypeSchema = z.enum(['video', 'pdf', 'manual', 'article', 'other']);
const trainingCourseStatusSchema = z.enum(['draft', 'active', 'archived']);
const trainingRecordStatusSchema = z.enum(['not_started', 'in_progress', 'completed', 'expired']);
const entityTypeSchema = z.enum(['article', 'sop', 'policy']);
const searchTypeSchema = z.enum(['article', 'sop', 'policy', 'training', 'document']);
const recommendationStatusSchema = z.enum(['pending', 'accepted', 'dismissed', 'completed']);

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
});

const createArticleSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  articleType: articleTypeSchema.optional(),
  title: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1).max(50000),
  summary: z.string().trim().max(2000).optional().nullable(),
  keywords: z.array(z.string().trim().min(1).max(100)).optional(),
  documentId: z.string().uuid().optional().nullable(),
  relatedArticleIds: z.array(z.string().uuid()).optional(),
  requiredPermissions: z.array(z.string().trim().min(1).max(100)).optional(),
  status: contentStatusSchema.optional(),
});

const updateArticleSchema = createArticleSchema.partial().extend({
  changeSummary: z.string().trim().max(2000).optional().nullable(),
});

const createSopSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1).max(50000),
  summary: z.string().trim().max(2000).optional().nullable(),
  department: z.string().trim().max(200).optional().nullable(),
  effectiveDate: z.string().datetime().optional().nullable(),
  keywords: z.array(z.string().trim().min(1).max(100)).optional(),
  requiredPermissions: z.array(z.string().trim().min(1).max(100)).optional(),
});

const updateSopSchema = createSopSchema.partial().extend({
  changeSummary: z.string().trim().max(2000).optional().nullable(),
});

const createTrainingCourseSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(5000).optional().nullable(),
  contentType: trainingContentTypeSchema.optional(),
  contentUrl: z.string().trim().url().optional().nullable(),
  documentId: z.string().uuid().optional().nullable(),
  skillTags: z.array(z.string().trim().min(1).max(100)).optional(),
  certificationRequired: z.boolean().optional(),
  certificationValidDays: z.number().int().min(1).max(3650).optional().nullable(),
  status: trainingCourseStatusSchema.optional(),
});

const updateTrainingCourseSchema = createTrainingCourseSchema.partial();

const createTrainingRecordSchema = z.object({
  courseId: z.string().uuid(),
  userId: z.string().uuid(),
  status: trainingRecordStatusSchema.optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const updateTrainingRecordSchema = z.object({
  status: trainingRecordStatusSchema.optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const createPolicySchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  policyType: policyTypeSchema,
  title: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1).max(50000),
  summary: z.string().trim().max(2000).optional().nullable(),
  effectiveDate: z.string().datetime().optional().nullable(),
  expiryDate: z.string().datetime().optional().nullable(),
  keywords: z.array(z.string().trim().min(1).max(100)).optional(),
  requiredPermissions: z.array(z.string().trim().min(1).max(100)).optional(),
});

const updatePolicySchema = createPolicySchema.partial().extend({
  changeSummary: z.string().trim().max(2000).optional().nullable(),
});

const searchSchema = z.object({
  query: z.string().trim().min(1).max(500),
  types: z.array(searchTypeSchema).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const indexDocumentSchema = z.object({
  documentId: z.string().uuid(),
  categoryId: z.string().uuid().optional().nullable(),
  articleType: articleTypeSchema.optional(),
});

const updateRecommendationSchema = z.object({
  status: recommendationStatusSchema,
});

type KnowledgeRouterDeps = {
  knowledgeService: KnowledgeService;
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

export function createKnowledgeRouter({
  knowledgeService,
  teamService,
  jwtSecret,
  authService,
}: KnowledgeRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission('knowledge:read', 'knowledge:write', 'intelligence:read');
  const requireWrite = requireAnyPermission('knowledge:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/stats', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await knowledgeService.getStats(companyId);
    res.json({ data: { stats } });
  });

  router.get('/categories', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const categories = await knowledgeService.listCategories(companyId);
    res.json({ data: { categories } });
  });

  router.post('/categories', requireWrite, async (req, res) => {
    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid category payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const category = await knowledgeService.createCategory(companyId, parsed.data);
      res.status(201).json({ data: { category } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.patch('/categories/:id', requireWrite, async (req, res) => {
    const parsed = createCategorySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid category payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const category = await knowledgeService.updateCategory(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { category } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.get('/articles', requireRead, async (req, res) => {
    const auth = getAuth(req);
    const articles = await knowledgeService.listArticles(auth.companyId, auth.permissions);
    res.json({ data: { articles } });
  });

  router.get('/articles/:id', requireRead, async (req, res) => {
    const auth = getAuth(req);
    const article = await knowledgeService.getArticle(
      auth.companyId,
      getRouteParam(req.params.id),
      auth.permissions,
    );

    if (!article) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Article not found' } });
      return;
    }

    res.json({ data: { article } });
  });

  router.post('/articles', requireWrite, async (req, res) => {
    const parsed = createArticleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid article payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const article = await knowledgeService.createArticle(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { article } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.patch('/articles/:id', requireWrite, async (req, res) => {
    const parsed = updateArticleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid article payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const article = await knowledgeService.updateArticle(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { article } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.post('/articles/:id/submit', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const article = await knowledgeService.submitArticle(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
        { status: 'pending_approval' },
      );
      res.json({ data: { article } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.post('/articles/:id/publish', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const article = await knowledgeService.publishArticle(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
        { status: 'published' },
      );
      res.json({ data: { article } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.get('/sops', requireRead, async (req, res) => {
    const auth = getAuth(req);
    const sops = await knowledgeService.listSops(auth.companyId, auth.permissions);
    res.json({ data: { sops } });
  });

  router.get('/sops/:id', requireRead, async (req, res) => {
    const auth = getAuth(req);
    const sop = await knowledgeService.getSop(auth.companyId, getRouteParam(req.params.id), auth.permissions);

    if (!sop) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'SOP not found' } });
      return;
    }

    res.json({ data: { sop } });
  });

  router.post('/sops', requireWrite, async (req, res) => {
    const parsed = createSopSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid SOP payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const sop = await knowledgeService.createSop({ companyId: auth.companyId, userId: auth.userId }, parsed.data);
      res.status(201).json({ data: { sop } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.patch('/sops/:id', requireWrite, async (req, res) => {
    const parsed = updateSopSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid SOP payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const sop = await knowledgeService.updateSop(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { sop } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.post('/sops/:id/submit', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const sop = await knowledgeService.submitSop(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
      );
      res.json({ data: { sop } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.post('/sops/:id/publish', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const sop = await knowledgeService.publishSop(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
      );
      res.json({ data: { sop } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.post('/sops/:id/archive', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const sop = await knowledgeService.archiveSop(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
      );
      res.json({ data: { sop } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.get('/training/courses', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const courses = await knowledgeService.listTrainingCourses(companyId);
    res.json({ data: { courses } });
  });

  router.post('/training/courses', requireWrite, async (req, res) => {
    const parsed = createTrainingCourseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid training course payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const course = await knowledgeService.createTrainingCourse(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { course } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.patch('/training/courses/:id', requireWrite, async (req, res) => {
    const parsed = updateTrainingCourseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid training course payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const course = await knowledgeService.updateTrainingCourse(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { course } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.get('/training/records', requireRead, async (req, res) => {
    const auth = getAuth(req);
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const records = await knowledgeService.listTrainingRecords(auth.companyId, userId);
    res.json({ data: { records } });
  });

  router.post('/training/records', requireWrite, async (req, res) => {
    const parsed = createTrainingRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid training record payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const record = await knowledgeService.createTrainingRecord(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { record } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.patch('/training/records/:id', requireWrite, async (req, res) => {
    const parsed = updateTrainingRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid training record payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const record = await knowledgeService.updateTrainingRecord(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { record } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.get('/policies', requireRead, async (req, res) => {
    const auth = getAuth(req);
    const policies = await knowledgeService.listPolicies(auth.companyId, auth.permissions);
    res.json({ data: { policies } });
  });

  router.get('/policies/:id', requireRead, async (req, res) => {
    const auth = getAuth(req);
    const policy = await knowledgeService.getPolicy(
      auth.companyId,
      getRouteParam(req.params.id),
      auth.permissions,
    );

    if (!policy) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Policy not found' } });
      return;
    }

    res.json({ data: { policy } });
  });

  router.post('/policies', requireWrite, async (req, res) => {
    const parsed = createPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid policy payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const policy = await knowledgeService.createPolicy(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { policy } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.patch('/policies/:id', requireWrite, async (req, res) => {
    const parsed = updatePolicySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid policy payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const policy = await knowledgeService.updatePolicy(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { policy } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.post('/policies/:id/submit', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const policy = await knowledgeService.submitPolicy(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
      );
      res.json({ data: { policy } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.post('/policies/:id/publish', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const policy = await knowledgeService.publishPolicy(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
      );
      res.json({ data: { policy } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.get('/versions/:entityType/:entityId', requireRead, async (req, res) => {
    const parsed = entityTypeSchema.safeParse(getRouteParam(req.params.entityType));
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid entity type' } });
      return;
    }

    const { companyId } = getAuth(req);
    const versions = await knowledgeService.listVersionHistory(
      companyId,
      parsed.data,
      getRouteParam(req.params.entityId),
    );
    res.json({ data: { versions } });
  });

  router.post('/search', requireRead, async (req, res) => {
    const parsed = searchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid search payload' } });
      return;
    }

    const auth = getAuth(req);
    const results = await knowledgeService.searchKnowledge(auth.companyId, parsed.data, auth.permissions);
    res.json({ data: { results } });
  });

  router.post('/documents/index', requireWrite, async (req, res) => {
    const parsed = indexDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid index document payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const article = await knowledgeService.indexDocument(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { article } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const recommendations = await knowledgeService.listRecommendations(companyId);
    res.json({ data: { recommendations } });
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const recommendations = await knowledgeService.generateRecommendations(companyId);
      res.status(201).json({ data: { recommendations } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  router.patch('/recommendations/:id', requireWrite, async (req, res) => {
    const parsed = updateRecommendationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid recommendation payload' },
      });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const recommendation = await knowledgeService.updateRecommendation(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { recommendation } });
    } catch (error) {
      handleKnowledgeError(res, error);
    }
  });

  return router;
}

function handleKnowledgeError(res: import('express').Response, error: unknown) {
  if (error instanceof KnowledgeError) {
    res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}
