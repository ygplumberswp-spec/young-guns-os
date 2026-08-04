import { Router } from 'express';
import { verifyAccessToken } from '@titan/auth';
import type { AuthService } from '../services/auth.service.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { liveUpdatesManager } from '../lib/live-updates.js';

type LiveUpdatesRouterDeps = {
  jwtSecret: string;
  authService: AuthService;
};

export function createLiveUpdatesRouter({ jwtSecret, authService }: LiveUpdatesRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.get('/stream', requireAuth, async (req, res) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (!token) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    try {
      const payload = verifyAccessToken(token, jwtSecret);
      const sessionValid = await authService.validateSession(payload.sessionId, payload.sub);
      if (!sessionValid) {
        res.status(401).json({ error: { code: 'SESSION_INVALID', message: 'Session expired or revoked' } });
        return;
      }

      liveUpdatesManager.subscribe(payload.companyId, res);
    } catch {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid access token' } });
    }
  });

  router.get('/status', requireAuth, (req, res) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (!token) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }
    try {
      const payload = verifyAccessToken(token, jwtSecret);
      res.json({ data: { connectionCount: liveUpdatesManager.getConnectionCount(payload.companyId) } });
    } catch {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid access token' } });
    }
  });

  return router;
}
