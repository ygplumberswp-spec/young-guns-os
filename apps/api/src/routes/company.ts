import { Router } from 'express';
import { z } from 'zod';
import { hasPermission } from '@titan/auth';
import { AI_TONE_OPTIONS } from '@titan/shared';
import type { CompanyService } from '../services/company.service.js';
import { CompanyError } from '../services/company.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';

const preferencesSchema = z
  .object({
    timezone: z.string().trim().max(80).optional(),
    currency: z.string().trim().max(10).optional(),
    locale: z.string().trim().max(20).optional(),
    aiTone: z.enum(AI_TONE_OPTIONS).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    industry: z.string().trim().max(120).nullable().optional(),
    businessType: z.string().trim().max(120).nullable().optional(),
    preferences: preferencesSchema.optional(),
  })
  .strict();

type CompanyRouterDeps = {
  companyService: CompanyService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createCompanyRouter({
  companyService,
  jwtSecret,
  authService,
}: CompanyRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);

  router.get('/profile', async (req, res) => {
    const { companyId } = getAuth(req);
    const profile = await companyService.getProfile(companyId);

    if (!profile) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Company not found' },
      });
      return;
    }

    res.json({ data: { profile } });
  });

  router.patch('/profile', async (req, res) => {
    const auth = getAuth(req);
    const parsed = updateProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid company profile payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    if (!hasPermission(auth.permissions, 'company:manage')) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to update company settings',
        },
      });
      return;
    }

    try {
      const profile = await companyService.updateProfile(auth.companyId, parsed.data);
      res.json({ data: { profile } });
    } catch (error) {
      handleCompanyError(res, error);
    }
  });

  return router;
}

function handleCompanyError(res: import('express').Response, error: unknown) {
  if (error instanceof CompanyError) {
    const status = error.code === 'NOT_FOUND' ? 404 : 400;
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
