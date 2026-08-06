import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResendEmailError, ResendEmailService } from './resend-email.service.js';

describe('ResendEmailService gates', () => {
  it('reports emailSendingEnabled from deps', () => {
    const disabled = ResendEmailService.create({
      db: {} as never,
      emailSendingEnabled: false,
      webhooksEnabled: false,
    });
    assert.equal(disabled.isEmailSendingEnabled(), false);

    const enabled = ResendEmailService.create({
      db: {} as never,
      emailSendingEnabled: true,
      webhooksEnabled: true,
    });
    assert.equal(enabled.isEmailSendingEnabled(), true);
  });

  it('requires approval for business purposes but not system notifications', () => {
    const service = ResendEmailService.create({
      db: {} as never,
      emailSendingEnabled: true,
      webhooksEnabled: true,
    });
    assert.equal(service.requiresApproval('customer_quote'), true);
    assert.equal(service.requiresApproval('invoice'), true);
    assert.equal(service.requiresApproval('system_notification'), false);
  });

  it('blocks send when EMAIL_SENDING_ENABLED is false', async () => {
    const service = ResendEmailService.create({
      db: {} as never,
      emailSendingEnabled: false,
      webhooksEnabled: true,
      encryptionKey: 'test-encryption-key-at-least-32-chars!!',
    });

    await assert.rejects(
      () =>
        service.sendTransactionalEmail({
          companyId: '00000000-0000-0000-0000-000000000001',
          purpose: 'system_notification',
          toEmail: 'a@example.com',
          subject: 'Hi',
          text: 'Hello',
        }),
      (error: unknown) => {
        assert.ok(error instanceof ResendEmailError);
        assert.equal(error.code, 'FEATURE_DISABLED');
        return true;
      },
    );
  });

  it('blocks webhooks when WEBHOOKS_ENABLED is false', async () => {
    const service = ResendEmailService.create({
      db: {} as never,
      emailSendingEnabled: true,
      webhooksEnabled: false,
      encryptionKey: 'test-encryption-key-at-least-32-chars!!',
    });

    await assert.rejects(
      () => service.handleWebhook({ rawBody: '{}', headers: {} }),
      (error: unknown) => {
        assert.ok(error instanceof ResendEmailError);
        assert.equal(error.code, 'FEATURE_DISABLED');
        return true;
      },
    );
  });
});
