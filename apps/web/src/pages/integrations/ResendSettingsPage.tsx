import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Panel } from '@titan/ui';
import { isCompanyOwnerRole } from '@titan/auth/browser';
import type { ResendConnectionSummary, ResendDeliverySummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  disconnectResend,
  fetchResendConnection,
  fetchResendDeliveries,
  saveResendConnection,
  syncResend,
} from '../../lib/integrations-api';
import { useAuth } from '../../lib/auth-context';
import { IntegrationsNav } from '../../features/integrations/IntegrationsNav';
import { IntegrationConnectionLock } from '../../features/integrations/IntegrationConnectionLock';
import { canAccessIntegrations, canManageIntegrations } from '../../features/integrations/utils';

export function ResendSettingsPage() {
  const { accessToken, user } = useAuth();
  const [connection, setConnection] = useState<ResendConnectionSummary | null>(null);
  const [deliveries, setDeliveries] = useState<ResendDeliverySummary[]>([]);
  const [formValues, setFormValues] = useState({
    apiKey: '',
    fromEmail: '',
    fromName: '',
    webhookSecret: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageIntegrations(user.permissions) : false), [user]);
  const isOwner = useMemo(
    () =>
      user
        ? isCompanyOwnerRole({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );

  async function loadPageData() {
    if (!accessToken || !canView) return;
    const [data, recent] = await Promise.all([
      fetchResendConnection(accessToken),
      fetchResendDeliveries(accessToken).catch(() => [] as ResendDeliverySummary[]),
    ]);
    setConnection(data);
    setDeliveries(recent);
    setFormValues((current) => ({
      apiKey: '',
      fromEmail: data.fromEmail ?? current.fromEmail,
      fromName: data.fromName ?? current.fromName,
      webhookSecret: '',
    }));
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        await loadPageData();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load Resend settings');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage) return;

    setIsBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await saveResendConnection(accessToken, {
        apiKey: formValues.apiKey.trim() || undefined,
        fromEmail: formValues.fromEmail,
        fromName: formValues.fromName.trim() || null,
        webhookSecret: formValues.webhookSecret.trim()
          ? formValues.webhookSecret.trim()
          : undefined,
      });
      setConnection(updated);
      setFormValues((current) => ({ ...current, apiKey: '', webhookSecret: '' }));
      setSuccess('Resend connected successfully.');
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to connect Resend');
      await loadPageData().catch(() => undefined);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReplaceCredentials(event: FormEvent<HTMLFormElement>) {
    await handleConnect(event);
  }

  async function handleDisconnect() {
    if (!accessToken || !canManage) return;
    setIsBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await disconnectResend(accessToken);
      setConnection(updated);
      setDeliveries([]);
      setFormValues({
        apiKey: '',
        fromEmail: '',
        fromName: '',
        webhookSecret: '',
      });
      setSuccess('Resend disconnected.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to disconnect Resend');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRecoverySync() {
    if (!accessToken || !canManage) return;
    setIsSyncing(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await syncResend(accessToken);
      setSuccess(
        `Resend verified for ${result.fromEmail} (${result.domainCount} domain${result.domainCount === 1 ? '' : 's'}).`,
      );
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to verify Resend connection');
    } finally {
      setIsSyncing(false);
    }
  }

  if (!canView) {
    return (
      <div className="integrations-page">
        <PageHeader title="Resend" description="You do not have permission to view integrations." />
      </div>
    );
  }

  const connectionLabel = connection?.connected
    ? 'Connected'
    : connection?.status === 'error'
      ? 'Error'
      : 'Not Connected';

  return (
    <div className="integrations-page">
      <PageHeader
        title="Resend"
        description="Transactional email via Resend API — quotes, invoices, receipts, reminders, and system notifications. Outbound business messages use approve → execute."
      />
      <IntegrationsNav />

      {isLoading ? <p className="page-muted">Loading Resend settings…</p> : null}

      {!isLoading && connection ? (
        <IntegrationConnectionLock
          providerName="Resend"
          status={connection.status}
          isConnected={connection.hasCredentials && connection.connected}
          canManage={canManage}
          isOwner={isOwner}
          isBusy={isBusy}
          error={error}
          success={success}
          statusRows={[
            { label: 'Status', value: connectionLabel },
            { label: 'From Email', value: connection.fromEmail ?? 'Not configured' },
            { label: 'API Key', value: connection.apiKeyHint ?? 'Not stored' },
            {
              label: 'Webhook Secret',
              value: connection.hasWebhookSecret ? 'Stored (encrypted)' : 'Not stored',
            },
            {
              label: 'Last Delivery',
              value: connection.lastDeliveryAt
                ? `${new Date(connection.lastDeliveryAt).toLocaleString()} (${connection.lastDeliveryStatus ?? 'unknown'})`
                : 'Never',
            },
            {
              label: 'Errors',
              value: connection.lastDeliveryError || connection.lastError || 'None',
            },
            {
              label: 'Email Sending Gate',
              value: connection.emailSendingEnabled
                ? 'Enabled (PROVIDERS_ENABLED + EMAIL_SENDING_ENABLED)'
                : 'Disabled — sends stay requested until both flags are true',
            },
            {
              label: 'Webhook URL',
              value: connection.webhookUrl ?? 'Configure API public URL to display',
            },
          ]}
          connectFields={[
            {
              key: 'apiKey',
              label: connection.hasCredentials ? 'API Key (leave blank to keep)' : 'API Key',
              type: 'password',
              autoComplete: 'new-password',
              required: !connection.hasCredentials,
            },
            { key: 'fromEmail', label: 'From Email', type: 'email', autoComplete: 'off' },
            { key: 'fromName', label: 'From Name', required: false, autoComplete: 'off' },
            {
              key: 'webhookSecret',
              label: 'Webhook Signing Secret (whsec_…)',
              type: 'password',
              autoComplete: 'new-password',
              required: false,
            },
          ]}
          connectValues={formValues}
          onConnectValueChange={(key, value) =>
            setFormValues((current) => ({ ...current, [key]: value }))
          }
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onReplaceCredentials={handleReplaceCredentials}
          connectHelpText="Resend API keys and webhook secrets are encrypted at rest with INTEGRATIONS_ENCRYPTION_KEY and never returned to the browser."
          recoveryContent={
            connection.status === 'connected' ? (
              <Button variant="ghost" disabled={isSyncing} onClick={() => void handleRecoverySync()}>
                {isSyncing ? 'Verifying…' : 'Run diagnostic Resend verify (recovery)'}
              </Button>
            ) : null
          }
        />
      ) : null}

      <Panel title="Recent Deliveries">
        {deliveries.length === 0 ? (
          <p className="page-muted">No Resend deliveries recorded for this company yet.</p>
        ) : (
          <ul className="integrations-delivery-list">
            {deliveries.slice(0, 10).map((delivery) => (
              <li key={delivery.id}>
                <strong>{delivery.status}</strong> · {delivery.purpose} · {delivery.toEmail} ·{' '}
                {delivery.subject}
                {delivery.failureReason ? ` — ${delivery.failureReason}` : ''}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Sending Rules">
        <p className="page-muted">
          SMTP verify stays on Email (SMTP). Resend is the transactional API path. Business outbound
          messages are created as requested, then Owner approve → execute. System notifications may
          send when EMAIL_SENDING_ENABLED is on and Resend is connected. Delivery webhooks update
          sent / delivered / failed.
        </p>
      </Panel>
    </div>
  );
}
