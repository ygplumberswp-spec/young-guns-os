import { Router } from 'express';
import { z } from 'zod';
import type { TeamService } from '../services/team.service.js';
import {
  GoogleMapsService,
  mapGoogleMapsError,
} from '../services/google-maps.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { invalidateIntegrationReadCaches } from '../services/api-read-cache.js';

const servicesSchema = z
  .object({
    places: z.boolean().optional(),
    geocoding: z.boolean().optional(),
    directions: z.boolean().optional(),
    distanceMatrix: z.boolean().optional(),
    mapsJavascript: z.boolean().optional(),
  })
  .optional();

const saveSchema = z.object({
  /** Omit or leave empty to keep the stored encrypted server key. */
  apiKey: z.string().trim().max(500).optional().nullable(),
  browserApiKey: z.string().trim().max(500).optional().nullable(),
  services: servicesSchema,
});

const autocompleteSchema = z.object({
  query: z.string().trim().min(1).max(300),
  sessionToken: z.string().trim().max(200).optional(),
});

const geocodeSchema = z.object({
  address: z.string().trim().min(1).max(500),
});

const placeDetailsSchema = z.object({
  placeId: z.string().trim().min(1).max(300),
});

const latLngSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const routeSchema = z.object({
  origin: latLngSchema,
  destination: latLngSchema,
});

type GoogleMapsRouterDeps = {
  googleMapsService: GoogleMapsService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: AuthenticatedRequest) {
  return { companyId: req.auth!.companyId, userId: req.auth!.userId };
}

export function createGoogleMapsRouter(deps: GoogleMapsRouterDeps): Router {
  const router = Router();
  const auth = createAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    authService: deps.authService,
  });

  router.use(auth);

  router.get(
    '/google-maps',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req as AuthenticatedRequest);
      const connection = await deps.googleMapsService.getConnection(companyId);
      res.json({ data: { connection } });
    },
  );

  router.get(
    '/google-maps/browser-config',
    requireAnyPermission(
      'integrations:read',
      'integrations:manage',
      'customers:read',
      'customers:write',
      'jobs:read',
      'jobs:write',
      'dispatch:read',
      '*',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req as AuthenticatedRequest);
      const config = await deps.googleMapsService.getBrowserConfig(companyId);
      res.json({ data: { config } });
    },
  );

  router.post(
    '/google-maps/credentials/validate',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const parsed = saveSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid Google Maps credential payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }
      const result = await deps.googleMapsService.validateCredentials(parsed.data);
      res.json({ data: { result } });
    },
  );

  router.put('/google-maps', requireAnyPermission('integrations:manage'), async (req, res) => {
    const authCtx = getAuth(req as AuthenticatedRequest);
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid Google Maps connection payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const connection = await deps.googleMapsService.saveConnection(authCtx.companyId, parsed.data);
      invalidateIntegrationReadCaches(authCtx.companyId);
      res.json({ data: { connection } });
    } catch (error) {
      const mapped = mapGoogleMapsError(error);
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  router.post(
    '/google-maps/test',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req as AuthenticatedRequest);
      try {
        const result = await deps.googleMapsService.testStoredConnection(companyId);
        res.json({ data: { result } });
      } catch (error) {
        const mapped = mapGoogleMapsError(error);
        res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
      }
    },
  );

  router.delete('/google-maps', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req as AuthenticatedRequest);
    const connection = await deps.googleMapsService.disconnect(companyId);
    invalidateIntegrationReadCaches(companyId);
    res.json({ data: { connection } });
  });

  router.post(
    '/google-maps/places/autocomplete',
    requireAnyPermission('customers:read', 'customers:write', 'jobs:write', 'dispatch:read', '*'),
    async (req, res) => {
      const { companyId } = getAuth(req as AuthenticatedRequest);
      const parsed = autocompleteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid autocomplete payload' },
        });
        return;
      }
      try {
        const predictions = await deps.googleMapsService.autocomplete(
          companyId,
          parsed.data.query,
          parsed.data.sessionToken,
        );
        res.json({ data: { predictions } });
      } catch (error) {
        const mapped = mapGoogleMapsError(error);
        res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
      }
    },
  );

  router.post(
    '/google-maps/geocode',
    requireAnyPermission('customers:write', 'jobs:write', 'integrations:manage', '*'),
    async (req, res) => {
      const { companyId } = getAuth(req as AuthenticatedRequest);
      const parsed = geocodeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid geocode payload' },
        });
        return;
      }
      try {
        const result = await deps.googleMapsService.geocode(companyId, parsed.data.address);
        res.json({ data: { result } });
      } catch (error) {
        const mapped = mapGoogleMapsError(error);
        res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
      }
    },
  );

  router.post(
    '/google-maps/places/details',
    requireAnyPermission('customers:write', 'jobs:write', 'integrations:manage', '*'),
    async (req, res) => {
      const { companyId } = getAuth(req as AuthenticatedRequest);
      const parsed = placeDetailsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid place details payload' },
        });
        return;
      }
      try {
        const result = await deps.googleMapsService.placeDetails(companyId, parsed.data.placeId);
        res.json({ data: { result } });
      } catch (error) {
        const mapped = mapGoogleMapsError(error);
        res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
      }
    },
  );

  router.post(
    '/google-maps/route',
    requireAnyPermission('jobs:read', 'dispatch:read', 'integrations:read', '*'),
    async (req, res) => {
      const { companyId } = getAuth(req as AuthenticatedRequest);
      const parsed = routeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid route payload' },
        });
        return;
      }
      try {
        const result = await deps.googleMapsService.estimateRoute(
          companyId,
          parsed.data.origin,
          parsed.data.destination,
        );
        res.json({ data: { result } });
      } catch (error) {
        const mapped = mapGoogleMapsError(error);
        res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
      }
    },
  );

  return router;
}
