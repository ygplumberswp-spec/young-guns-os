import { Router } from 'express';
import { eq } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import { whatsappConnections } from '@titan/db';
import type { WhatsappWebhookPayload } from '../lib/whatsapp.client.js';
import { verifyWhatsappWebhookSignature } from '../lib/whatsapp-signing.js';
import type { WhatsappService } from '../services/whatsapp.service.js';
import { WhatsappServiceError } from '../services/whatsapp.service.js';

type WhatsappWebhookRouterDeps = {
  whatsappService: WhatsappService;
  db: DatabaseClient;
  /** Meta App Secret — when set, X-Hub-Signature-256 is enforced. */
  appSecret?: string;
};

export function createWhatsappWebhookRouter({
  whatsappService,
  db,
  appSecret,
}: WhatsappWebhookRouterDeps): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const mode = typeof req.query['hub.mode'] === 'string' ? req.query['hub.mode'] : undefined;
    const token =
      typeof req.query['hub.verify_token'] === 'string' ? req.query['hub.verify_token'] : undefined;
    const challenge =
      typeof req.query['hub.challenge'] === 'string' ? req.query['hub.challenge'] : undefined;

    if (!token) {
      res.status(403).send('Forbidden');
      return;
    }

    const connection = await db.query.whatsappConnections.findFirst({
      where: eq(whatsappConnections.webhookVerifyToken, token),
    });

    const verified = whatsappService.verifyWebhookChallenge(
      mode,
      token,
      challenge,
      connection?.webhookVerifyToken,
    );

    if (verified) {
      res.status(200).send(verified);
      return;
    }

    res.status(403).send('Forbidden');
  });

  router.post('/', async (req, res) => {
    try {
      const flags = whatsappService.getRuntimeFlags();
      if (!flags.whatsappEnabled || !flags.webhooksEnabled) {
        res.status(503).json({
          error: {
            code: 'FEATURE_DISABLED',
            message: !flags.whatsappEnabled
              ? 'WhatsApp is disabled (WHATSAPP_ENABLED / PROVIDERS_ENABLED)'
              : 'WhatsApp webhooks are disabled (WEBHOOKS_ENABLED)',
          },
        });
        return;
      }

      const rawBody =
        (req as { rawBody?: string }).rawBody ??
        (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));
      const signatureHeader =
        typeof req.headers['x-hub-signature-256'] === 'string'
          ? req.headers['x-hub-signature-256']
          : Array.isArray(req.headers['x-hub-signature-256'])
            ? req.headers['x-hub-signature-256'][0]
            : undefined;

      const signature = verifyWhatsappWebhookSignature({
        appSecret,
        rawBody,
        signatureHeader,
        // SEC-001: production must not accept unsigned WhatsApp webhooks.
        failClosedWithoutSecret: process.env.NODE_ENV === 'production',
      });

      if (!signature.ok) {
        res.status(401).json({
          error: {
            code: 'INVALID_SIGNATURE',
            message: `WhatsApp webhook signature rejected (${signature.reason})`,
          },
        });
        return;
      }

      const result = await whatsappService.handleWebhook(req.body as WhatsappWebhookPayload);
      res.json({
        data: {
          ...result,
          signatureMode: signature.mode,
        },
      });
    } catch (error) {
      if (error instanceof WhatsappServiceError) {
        const status = error.code === 'FEATURE_DISABLED' ? 503 : 400;
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
