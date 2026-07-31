import { Router } from 'express';
import { z } from 'zod';
import type { WorkforceService } from '../services/workforce.service.js';
import { WorkforceError } from '../services/workforce.service.js';
import { RecruitingError } from '../services/recruiting.service.js';
import type { RecruitingService } from '../services/recruiting.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const recruitingStatusSchema = z.enum([
  'new',
  'applied',
  'screening',
  'interview',
  'assessment',
  'offered',
  'offer',
  'hired',
  'rejected',
]);
const activityTypeSchema = z.enum([
  'note',
  'screening',
  'interview',
  'assessment',
  'communication',
  'status_change',
  'other',
]);
const recommendationStatusSchema = z.enum(['pending', 'accepted', 'dismissed', 'completed']);

const createCandidateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  roleTitle: z.string().trim().max(200).optional().nullable(),
  status: recruitingStatusSchema.optional(),
  source: z.string().trim().max(200).optional().nullable(),
  skills: z.array(z.string().trim().min(1).max(100)).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

const updateCandidateSchema = createCandidateSchema.partial();

const createActivitySchema = z.object({
  activityType: activityTypeSchema.optional(),
  subject: z.string().trim().max(500).optional().nullable(),
  body: z.string().trim().min(1).max(8000),
  occurredAt: z.string().datetime().optional(),
});

const createSkillSchema = z.object({
  userId: z.string().uuid(),
  skillKey: z.string().trim().min(1).max(100),
  skillName: z.string().trim().min(1).max(200),
  proficiency: z.string().trim().max(50).optional(),
  experienceYears: z.number().int().min(0).max(80).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const updateSkillSchema = createSkillSchema.omit({ userId: true }).partial();

const createCertificationSchema = z.object({
  userId: z.string().uuid(),
  certificationKey: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  issuer: z.string().trim().max(200).optional().nullable(),
  issuedAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const updateCertificationSchema = createCertificationSchema.omit({ userId: true }).partial();

const createTrainingSchema = z.object({
  userId: z.string().uuid(),
  trainingKey: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  status: z.string().trim().max(50).optional(),
  completedAt: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const updateTrainingSchema = createTrainingSchema.omit({ userId: true }).partial();

const updateRecommendationSchema = z.object({
  status: recommendationStatusSchema,
});

type WorkforceRouterDeps = {
  workforceService: WorkforceService;
  recruitingService: RecruitingService;
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

export function createWorkforceRouter({
  workforceService,
  recruitingService,
  teamService,
  jwtSecret,
  authService,
}: WorkforceRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'workforce:read',
    'workforce:write',
    'recruiting:read',
    'recruiting:write',
  );
  const requireWrite = requireAnyPermission('workforce:write', 'recruiting:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/stats', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await workforceService.getStats(companyId);
    res.json({ data: { stats } });
  });

  router.get('/insights', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const [staffingInsights, skillGaps, performance] = await Promise.all([
      workforceService.getStaffingInsights(companyId),
      workforceService.getSkillGaps(companyId),
      workforceService.getTechnicianPerformanceInsights(companyId),
    ]);
    res.json({ data: { staffingInsights, skillGaps, performance } });
  });

  router.get('/candidates/pipeline', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const pipeline = await workforceService.getCandidatePipeline(companyId);
    res.json({ data: { pipeline } });
  });

  router.get('/candidates', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const candidates = await recruitingService.listCandidates(companyId);
    res.json({ data: { candidates } });
  });

  router.post('/candidates', requireWrite, async (req, res) => {
    const parsed = createCandidateSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid candidate payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const candidate = await recruitingService.createCandidate(companyId, parsed.data);
      res.status(201).json({ data: { candidate } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  router.patch('/candidates/:id', requireWrite, async (req, res) => {
    const parsed = updateCandidateSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid candidate payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const candidate = await recruitingService.updateCandidate(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { candidate } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  router.get('/candidates/:id/activities', requireRead, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const activities = await workforceService.listCandidateActivities(
        companyId,
        getRouteParam(req.params.id),
      );
      res.json({ data: { activities } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  router.post('/candidates/:id/activities', requireWrite, async (req, res) => {
    const parsed = createActivitySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid activity payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const activity = await workforceService.addCandidateActivity(
        auth,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.status(201).json({ data: { activity } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  router.get('/skills', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const skills = await workforceService.listSkills(companyId);
    res.json({ data: { skills } });
  });

  router.post('/skills', requireWrite, async (req, res) => {
    const parsed = createSkillSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid skill payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const skill = await workforceService.createSkill(auth, parsed.data);
      res.status(201).json({ data: { skill } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  router.patch('/skills/:id', requireWrite, async (req, res) => {
    const parsed = updateSkillSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid skill payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const skill = await workforceService.updateSkill(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { skill } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  router.get('/skills/gaps', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const skillGaps = await workforceService.getSkillGaps(companyId);
    res.json({ data: { skillGaps } });
  });

  router.get('/training', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const training = await workforceService.listTraining(companyId);
    const certifications = await workforceService.listCertifications(companyId);
    res.json({ data: { training, certifications } });
  });

  router.post('/training', requireWrite, async (req, res) => {
    const parsed = createTrainingSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid training payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const record = await workforceService.createTraining(auth, parsed.data);
      res.status(201).json({ data: { record } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  router.patch('/training/:id', requireWrite, async (req, res) => {
    const parsed = updateTrainingSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid training payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const record = await workforceService.updateTraining(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { record } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  router.post('/certifications', requireWrite, async (req, res) => {
    const parsed = createCertificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid certification payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const certification = await workforceService.createCertification(auth, parsed.data);
      res.status(201).json({ data: { certification } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  router.patch('/certifications/:id', requireWrite, async (req, res) => {
    const parsed = updateCertificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid certification payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const certification = await workforceService.updateCertification(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { certification } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const recommendations = await workforceService.listRecommendations(companyId);
    res.json({ data: { recommendations } });
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const recommendations = await workforceService.generateRecommendations(companyId);
      res.status(201).json({ data: { recommendations } });
    } catch (error) {
      handleWorkforceError(res, error);
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
      const recommendation = await workforceService.updateRecommendation(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { recommendation } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  return router;
}

function handleWorkforceError(res: import('express').Response, error: unknown) {
  if (error instanceof WorkforceError || error instanceof RecruitingError) {
    res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}
