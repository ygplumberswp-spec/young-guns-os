import { Router, type Request } from 'express';
import type { XeroRealtimeIntersyncService } from '../services/xero-realtime-intersync.service.js';

export function createXeroWebhookRouter(deps: {
  xeroRealtimeIntersyncService: XeroRealtimeIntersyncService;
}): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const rawBody = (req as Request & { rawBody?: string }).rawBody ?? '';

      const result = await deps.xeroRealtimeIntersyncService.handleWebhook({
        rawBody,
        headers: req.headers as Record<string, string | string[] | undefined>,
      });

      res.status(result.status).json(result.body);
    } catch {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    }
  });

  return router;
}
