import { Router } from 'express';
import { eq } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import { whatsappConnections } from '@titan/db';
import type { WhatsappWebhookPayload } from '../lib/whatsapp.client.js';
import type { WhatsappService } from '../services/whatsapp.service.js';
import { WhatsappServiceError } from '../services/whatsapp.service.js';

type WhatsappWebhookRouterDeps = {
  whatsappService: WhatsappService;
  db: DatabaseClient;
};

export function createWhatsappWebhookRouter({
  whatsappService,
  db,
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
      const result = await whatsappService.handleWebhook(req.body as WhatsappWebhookPayload);
      res.json({ data: result });
    } catch (error) {
      if (error instanceof WhatsappServiceError) {
        res.status(400).json({
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
