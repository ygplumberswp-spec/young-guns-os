import { Router } from 'express';
import type { ResendEmailService } from '../services/resend-email.service.js';
import { ResendEmailError } from '../services/resend-email.service.js';

type ResendWebhookRouterDeps = {
  resendEmailService: ResendEmailService;
};

export function createResendWebhookRouter({ resendEmailService }: ResendWebhookRouterDeps): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const rawBody =
        (req as { rawBody?: string }).rawBody ??
        (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));

      const result = await resendEmailService.handleWebhook({
        rawBody,
        headers: req.headers as Record<string, string | string[] | undefined>,
      });

      res.status(200).json({ data: result });
    } catch (error) {
      if (error instanceof ResendEmailError) {
        const status =
          error.code === 'FEATURE_DISABLED'
            ? 503
            : error.code === 'INVALID_SIGNATURE'
              ? 401
              : error.code === 'INVALID_PAYLOAD'
                ? 400
                : error.code === 'CONFIG_ERROR'
                  ? 503
                  : 400;
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
  });

  return router;
}
