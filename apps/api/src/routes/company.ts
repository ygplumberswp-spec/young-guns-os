import { Router } from 'express';
import { z } from 'zod';
import { hasPermission, isCompanyOwnerRole } from '@titan/auth';
import { isGoogleReviewUrl } from '@titan/shared';
import { AI_TONE_OPTIONS } from '@titan/shared';
import type { CompanyService } from '../services/company.service.js';
import { CompanyError } from '../services/company.service.js';
import type { CompanyMediaService } from '../services/company-media.service.js';
import { CompanyMediaError } from '../services/company-media.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';

const preferencesSchema = z
  .object({
    timezone: z.string().trim().max(80).optional(),
    currency: z.string().trim().max(10).optional(),
    locale: z.string().trim().max(20).optional(),
    aiTone: z.enum(AI_TONE_OPTIONS).optional(),
    notes: z.string().trim().max(2000).optional(),
    tradingName: z.string().trim().max(160).optional(),
    ownerName: z.string().trim().max(120).optional(),
    ownerJobTitle: z.string().trim().max(120).optional(),
    companyTelephone: z.string().trim().max(40).optional(),
    companyEmail: z.string().trim().max(160).optional(),
    website: z.string().trim().max(200).optional(),
    physicalAddress: z.string().trim().max(500).optional(),
    postalAddress: z.string().trim().max(500).optional(),
    companyRegistrationNumber: z.string().trim().max(80).optional(),
    vatNumber: z.string().trim().max(80).optional(),
    primaryContactName: z.string().trim().max(120).optional(),
    primaryContactEmail: z.string().trim().max(160).optional(),
    primaryContactPhone: z.string().trim().max(40).optional(),
    businessDescription: z.string().trim().max(4000).optional(),
    servicesOffered: z.string().trim().max(4000).optional(),
    operatingHours: z.string().trim().max(500).optional(),
    emergencyContactName: z.string().trim().max(120).optional(),
    emergencyContactPhone: z.string().trim().max(40).optional(),
    brandPrimaryColor: z.string().trim().max(20).optional(),
    brandAccentColor: z.string().trim().max(20).optional(),
    logoFileId: z.string().uuid().nullable().optional(),
    profileImageFileId: z.string().uuid().nullable().optional(),
    /** UX-I / UX-035 — Cape Town service geography + COC defaults (JSON prefs). */
    serviceGeography: z
      .object({
        primaryCity: z.string().trim().min(1).max(120),
        primaryProvince: z.string().trim().min(1).max(120),
        serviceSuburbs: z.array(z.string().trim().min(1).max(120)).max(200),
        outsideAreaPolicy: z.enum(['quote_travel', 'decline', 'manual_review']),
        notes: z.string().trim().max(2000).nullable().optional(),
      })
      .optional(),
    cocSettings: z
      .object({
        defaultApplicability: z.enum([
          'not_applicable',
          'may_apply',
          'required_for_gas_work',
          'required_for_electrical_work',
          'pending_classification',
        ]),
        gasWorkRequiresCoc: z.boolean(),
        electricalWorkRequiresCoc: z.boolean(),
        sansReferenceNote: z.string().trim().max(4000),
        documentLabel: z.string().trim().min(1).max(200),
      })
      .optional(),
    googleReviewUrl: z.string().trim().max(2000).nullable().optional(),
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
  companyMediaService: CompanyMediaService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

const uploadMediaSchema = z.object({
  kind: z.enum(['logo', 'profile_image']),
  mimeType: z.string().trim().min(3).max(80),
  dataBase64: z.string().trim().min(1).max(3_000_000),
});

export function createCompanyRouter({
  companyService,
  companyMediaService,
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

    const reviewUrl = parsed.data.preferences?.googleReviewUrl;
    if (reviewUrl !== undefined) {
      if (!isCompanyOwnerRole({ roleName: auth.roleName, permissions: auth.permissions })) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Only the Company Owner may update the Google review URL',
          },
        });
        return;
      }
      if (reviewUrl && !isGoogleReviewUrl(reviewUrl)) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Google review URL must be a valid HTTPS Google review link',
          },
        });
        return;
      }
    }

    try {
      const profile = await companyService.updateProfile(auth.companyId, parsed.data, {
        updatedByUserId: auth.userId,
      });
      res.json({ data: { profile } });
    } catch (error) {
      handleCompanyError(res, error);
    }
  });

  router.get('/media/status', async (_req, res) => {
    res.json({
      data: {
        configured: companyMediaService.isConfigured(),
        requiredEnv: 'COMPANY_MEDIA_STORAGE_PATH',
      },
    });
  });

  router.get('/media/:fileId', async (req, res) => {
    const { companyId } = getAuth(req);
    const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;

    try {
      const { metadata, buffer } = await companyMediaService.getMedia(companyId, fileId);
      res.setHeader('Content-Type', metadata.mimeType);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('ETag', companyMediaService.createEtag(buffer));
      res.send(buffer);
    } catch (error) {
      handleMediaError(res, error);
    }
  });

  router.post('/media', async (req, res) => {
    const auth = getAuth(req);
    const parsed = uploadMediaSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid media upload payload' },
      });
      return;
    }

    if (!hasPermission(auth.permissions, 'company:manage')) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to upload company media' },
      });
      return;
    }

    try {
      const buffer = Buffer.from(parsed.data.dataBase64, 'base64');
      const stored = await companyMediaService.storeMedia({
        companyId: auth.companyId,
        kind: parsed.data.kind,
        mimeType: parsed.data.mimeType,
        buffer,
      });

      const preferenceKey = parsed.data.kind === 'logo' ? 'logoFileId' : 'profileImageFileId';
      const profile = await companyService.updateProfile(auth.companyId, {
        preferences: { [preferenceKey]: stored.id },
      });

      res.status(201).json({ data: { file: stored, profile } });
    } catch (error) {
      handleMediaError(res, error);
    }
  });

  router.delete('/media/:fileId', async (req, res) => {
    const auth = getAuth(req);
    const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;

    if (!hasPermission(auth.permissions, 'company:manage')) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to remove company media' },
      });
      return;
    }

    try {
      await companyMediaService.deleteMedia(auth.companyId, fileId);
      const profile = await companyService.getProfile(auth.companyId);
      const preferences: Record<string, null> = {};
      if (profile?.preferences.logoFileId === fileId) {
        preferences.logoFileId = null;
      }
      if (profile?.preferences.profileImageFileId === fileId) {
        preferences.profileImageFileId = null;
      }
      const updated =
        Object.keys(preferences).length > 0
          ? await companyService.updateProfile(auth.companyId, { preferences })
          : profile;
      res.json({ data: { success: true, profile: updated } });
    } catch (error) {
      handleMediaError(res, error);
    }
  });

  return router;
}

function handleMediaError(res: import('express').Response, error: unknown) {
  if (error instanceof CompanyMediaError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'STORAGE_NOT_CONFIGURED'
            ? 503
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  throw error;
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
