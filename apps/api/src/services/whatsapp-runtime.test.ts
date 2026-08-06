import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WhatsappService, WhatsappServiceError } from './whatsapp.service.js';

function createDisabledService(flags: {
  whatsappEnabled?: boolean;
  webhooksEnabled?: boolean;
  outboundMessagesEnabled?: boolean;
}) {
  return WhatsappService.create({
    db: {} as never,
    apiPublicUrl: 'http://localhost:3000',
    runtime: {
      whatsappEnabled: flags.whatsappEnabled ?? false,
      webhooksEnabled: flags.webhooksEnabled ?? false,
      outboundMessagesEnabled: flags.outboundMessagesEnabled ?? false,
    },
  });
}

describe('WhatsappService runtime feature gates', () => {
  it('blocks connect when WHATSAPP_ENABLED is off', async () => {
    const service = createDisabledService({ whatsappEnabled: false });
    await assert.rejects(
      () =>
        service.saveConnection('00000000-0000-0000-0000-000000000001', {
          phoneNumberId: 'pn',
          businessAccountId: 'ba',
          accessToken: 'token',
        }),
      (err: unknown) =>
        err instanceof WhatsappServiceError && err.code === 'FEATURE_DISABLED',
    );
  });

  it('blocks webhook processing when webhooks or whatsapp flags are off', async () => {
    const service = createDisabledService({
      whatsappEnabled: true,
      webhooksEnabled: false,
      outboundMessagesEnabled: true,
    });
    await assert.rejects(
      () => service.handleWebhook({ object: 'whatsapp_business_account', entry: [] }),
      (err: unknown) =>
        err instanceof WhatsappServiceError && err.code === 'FEATURE_DISABLED',
    );
  });

  it('exposes honest runtime flags on connection summary helpers', () => {
    const service = createDisabledService({
      whatsappEnabled: false,
      webhooksEnabled: false,
      outboundMessagesEnabled: false,
    });
    const flags = service.getRuntimeFlags();
    assert.equal(flags.whatsappEnabled, false);
    assert.equal(flags.webhooksEnabled, false);
    assert.equal(flags.outboundMessagesEnabled, false);
  });
});
