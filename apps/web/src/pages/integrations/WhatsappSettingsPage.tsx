import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Input, Panel } from '@titan/ui';
import type {
  WhatsappConnectionSummary,
  WhatsappStats,
  WhatsappTemplateCategory,
  WhatsappTemplateSummary,
} from '@titan/shared';
import { WHATSAPP_CONNECTION_STATUS_OPTIONS, WHATSAPP_TEMPLATE_CATEGORY_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  createWhatsappTemplate,
  deleteWhatsappTemplate,
  disconnectWhatsapp,
  fetchWhatsappIntegration,
  saveWhatsappConnection,
  sendWhatsappTestMessage,
  testWhatsappConnection,
  updateWhatsappTemplate,
} from '../../lib/whatsapp-api';
import { useAuth } from '../../lib/auth-context';
import { IntegrationsNav } from '../../features/integrations/IntegrationsNav';
import { canAccessIntegrations, canManageIntegrations } from '../../features/integrations/utils';

function formatWhatsappStatus(status: WhatsappConnectionSummary['status']): string {
  return WHATSAPP_CONNECTION_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function messageHealthLabel(
  connection: WhatsappConnectionSummary,
  stats: WhatsappStats | null,
): string {
  if (connection.status === 'error' || connection.lastError) {
    return 'Needs Attention';
  }
  if (connection.status === 'connected' && connection.hasCredentials) {
    if (stats && stats.pendingReplyCount > 0) {
      return 'Active — Pending Replies';
    }
    return 'Healthy';
  }
  if (connection.status === 'pending') {
    return 'Pending';
  }
  return 'Not Connected';
}

/** Map Test Connection API codes to Owner-safe banners (no raw secrets). */
function formatWhatsappTestConnectionError(err: unknown): string {
  if (!(err instanceof ApiClientError)) {
    return 'Connection verification failed';
  }
  switch (err.code) {
    case 'AUTH_EXPIRED':
      return 'Meta authentication expired — reconnect required';
    case 'FORBIDDEN':
      return 'Meta phone number or token is not authorised for this app';
    case 'RATE_LIMITED':
      return 'Meta rate limited — try again later';
    case 'TIMEOUT':
    case 'PROVIDER_ERROR':
      return 'Provider temporarily unavailable';
    case 'CREDENTIAL_UNAVAILABLE':
      return 'Stored credential unavailable';
    case 'NOT_CONNECTED':
      return err.message.includes('Phone Number ID')
        ? err.message
        : 'WhatsApp is not connected';
    case 'API_ERROR':
      return /not found|does not exist/i.test(err.message)
        ? 'Meta phone number not found'
        : err.message || 'Connection verification failed';
    case 'FEATURE_DISABLED':
      return err.message;
    default:
      return err.message || 'Connection verification failed';
  }
}

export function WhatsappSettingsPage() {
  const { accessToken, user } = useAuth();
  const [connection, setConnection] = useState<WhatsappConnectionSummary | null>(null);
  const [stats, setStats] = useState<WhatsappStats | null>(null);
  const [templates, setTemplates] = useState<WhatsappTemplateSummary[]>([]);
  const [formValues, setFormValues] = useState({
    accessToken: '',
    phoneNumberId: '',
    businessAccountId: '',
    webhookVerifyToken: '',
  });
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [templateCategory, setTemplateCategory] = useState<WhatsappTemplateCategory>('utility');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showManualSetup, setShowManualSetup] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [manageSection, setManageSection] = useState<
    null | 'webhook' | 'diagnostics' | 'permissions' | 'sync'
  >(null);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageIntegrations(user.permissions) : false), [user]);

  const isConnected = Boolean(
    connection && (connection.hasCredentials || connection.status === 'connected'),
  );

  async function loadPageData() {
    if (!accessToken || !canView) return;
    const data = await fetchWhatsappIntegration(accessToken);
    setConnection(data.connection);
    setStats(data.stats);
    setTemplates(data.templates);
    setFormValues((current) => ({
      accessToken: '',
      phoneNumberId: data.connection.phoneNumberId ?? current.phoneNumberId,
      businessAccountId: data.connection.businessAccountId ?? current.businessAccountId,
      webhookVerifyToken: '',
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
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load Business WhatsApp settings',
          );
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

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await saveWhatsappConnection(accessToken, {
        accessToken: formValues.accessToken || undefined,
        phoneNumberId: formValues.phoneNumberId,
        businessAccountId: formValues.businessAccountId,
        webhookVerifyToken: formValues.webhookVerifyToken.trim() || null,
      });
      setConnection(updated);
      setFormValues((current) => ({ ...current, accessToken: '', webhookVerifyToken: '' }));
      setShowManualSetup(false);
      setManageOpen(false);
      setSuccess('Business WhatsApp connected successfully.');
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to connect Business WhatsApp');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!accessToken || !canManage) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await disconnectWhatsapp(accessToken);
      setConnection(updated);
      setManageOpen(false);
      setConfirmDisconnect(false);
      setManageSection(null);
      setSuccess('Business WhatsApp disconnected.');
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to disconnect Business WhatsApp');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTestConnection() {
    if (!accessToken || !canManage) return;

    setIsTestingConnection(true);
    setError(null);
    setSuccess(null);

    try {
      const { result, connection: next } = await testWhatsappConnection(accessToken);
      setConnection(next);
      const identity =
        result.verifiedName || result.displayPhoneNumber || result.phoneNumberId || 'WhatsApp';
      setSuccess(
        `Connection verified for ${identity}. Read-only Meta check — no message sent.`,
      );
    } catch (err) {
      setError(formatWhatsappTestConnectionError(err));
      await loadPageData().catch(() => undefined);
    } finally {
      setIsTestingConnection(false);
    }
  }

  async function handleTestMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage) return;

    setIsTesting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await sendWhatsappTestMessage(accessToken, {
        phoneNumber: testPhoneNumber,
        messageContent: testMessage,
      });
      setSuccess(`Test message sent (ID: ${result.externalMessageId}).`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to send test message');
    } finally {
      setIsTesting(false);
    }
  }

  async function handleCreateTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage) return;

    setIsCreatingTemplate(true);
    setError(null);
    setSuccess(null);

    try {
      const template = await createWhatsappTemplate(accessToken, {
        name: templateName,
        body: templateBody,
        category: templateCategory,
        status: 'pending',
      });
      setTemplates((current) => [template, ...current]);
      setTemplateName('');
      setTemplateBody('');
      setSuccess('Template saved. Mark as approved once Meta approves it.');
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create template');
    } finally {
      setIsCreatingTemplate(false);
    }
  }

  async function handleApproveTemplate(templateId: string) {
    if (!accessToken || !canManage) return;

    try {
      const updated = await updateWhatsappTemplate(accessToken, templateId, { status: 'approved' });
      setTemplates((current) =>
        current.map((template) => (template.id === templateId ? updated : template)),
      );
      setSuccess('Template marked as approved.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update template');
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    if (!accessToken || !canManage) return;

    try {
      await deleteWhatsappTemplate(accessToken, templateId);
      setTemplates((current) => current.filter((template) => template.id !== templateId));
      setSuccess('Template deleted.');
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to delete template');
    }
  }

  if (!canView) {
    return <p className="page-muted">You do not have permission to view integrations.</p>;
  }

  if (isLoading) {
    return <p className="page-muted">Loading Business WhatsApp settings…</p>;
  }

  // Honest status: stored creds + error must not display as plain "Connected".
  const statusLabel = !connection
    ? 'Not Connected'
    : connection.status === 'connected'
      ? 'Connected'
      : connection.status === 'error' && connection.hasCredentials
        ? 'Connected (verification needed)'
        : formatWhatsappStatus(connection.status);

  return (
    <div className="integrations-page">
      <PageHeader
        title="Business WhatsApp"
        description="Connect your Meta WhatsApp Business account for customer messaging, notifications and AI communications."
      />
      <IntegrationsNav />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {connection ? (
        <Panel title="Business WhatsApp">
          {isConnected ? (
            <>
              <dl className="integrations-detail-list">
                <div>
                  <dt>Status</dt>
                  <dd>{statusLabel}</dd>
                </div>
                <div>
                  <dt>Connected Number</dt>
                  <dd>{connection.displayPhoneNumber ?? connection.phoneNumberId ?? '—'}</dd>
                </div>
                <div>
                  <dt>Business Name</dt>
                  <dd>Unavailable</dd>
                </div>
                <div>
                  <dt>Last Sync</dt>
                  <dd>{connection.connectedAt ?? 'Never'}</dd>
                </div>
                <div>
                  <dt>Message Health</dt>
                  <dd>{messageHealthLabel(connection, stats)}</dd>
                </div>
                <div>
                  <dt>Availability</dt>
                  <dd>
                    {connection.featureEnabled === false
                      ? 'Disabled'
                      : connection.webhooksEnabled === false ||
                          connection.outboundMessagesEnabled === false
                        ? 'Limited'
                        : 'Live'}
                  </dd>
                </div>
              </dl>
              {connection.runtimeNote ? (
                <p className="muted" style={{ marginTop: '0.5rem' }}>
                  {connection.runtimeNote}
                </p>
              ) : null}

              {canManage ? (
                <>
                  <div className="integration-actions" style={{ marginTop: '0.75rem' }}>
                    <Button
                      type="button"
                      disabled={isTestingConnection || isSaving}
                      onClick={() => void handleTestConnection()}
                    >
                      {isTestingConnection ? 'Testing…' : 'Test Connection'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setManageOpen((open) => !open);
                        setConfirmDisconnect(false);
                        setManageSection(null);
                      }}
                    >
                      {manageOpen ? 'Close' : 'Manage'}
                    </Button>
                  </div>
                  <p className="page-muted" style={{ marginTop: '0.5rem' }}>
                    Test Connection performs one read-only Meta check using the stored token. It does
                    not send a WhatsApp message.
                  </p>

                  {manageOpen ? (
                    <div className="page-header-actions" style={{ marginTop: '0.75rem' }}>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isSaving}
                        onClick={() => {
                          setShowManualSetup(true);
                          setManageSection(null);
                        }}
                      >
                        Reconnect
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isSaving}
                        onClick={() => {
                          if (!confirmDisconnect) {
                            setConfirmDisconnect(true);
                            return;
                          }
                          void handleDisconnect();
                        }}
                      >
                        {confirmDisconnect ? 'Confirm Disconnect' : 'Disconnect'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setManageSection((current) =>
                            current === 'permissions' ? null : 'permissions',
                          )
                        }
                      >
                        Permissions
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setManageSection((current) => (current === 'webhook' ? null : 'webhook'))
                        }
                      >
                        Webhook Status
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setManageSection((current) =>
                            current === 'diagnostics' ? null : 'diagnostics',
                          )
                        }
                      >
                        Diagnostics
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setManageSection((current) => (current === 'sync' ? null : 'sync'))
                        }
                      >
                        Sync History
                      </Button>
                    </div>
                  ) : null}

                  {manageOpen && manageSection === 'permissions' ? (
                    <p className="page-muted" style={{ marginTop: '0.75rem' }}>
                      Permissions detail view is not available yet. Business WhatsApp uses your Meta
                      Cloud API token scopes as configured in Meta Business Manager.
                    </p>
                  ) : null}
                  {manageOpen && manageSection === 'webhook' ? (
                    <dl className="integrations-detail-list" style={{ marginTop: '0.75rem' }}>
                      <div>
                        <dt>Webhook URL</dt>
                        <dd>{connection.webhookUrl}</dd>
                      </div>
                      <div>
                        <dt>Verify Token</dt>
                        <dd>{connection.webhookVerifyTokenHint ?? 'Generated on connect'}</dd>
                      </div>
                    </dl>
                  ) : null}
                  {manageOpen && manageSection === 'diagnostics' ? (
                    <p className="page-muted" style={{ marginTop: '0.75rem' }}>
                      {connection.lastError
                        ? `Last error: ${connection.lastError}`
                        : `Status ${formatWhatsappStatus(connection.status)}. No recent connection errors reported.`}
                    </p>
                  ) : null}
                  {manageOpen && manageSection === 'sync' ? (
                    <p className="page-muted" style={{ marginTop: '0.75rem' }}>
                      Sync history is not available yet. Background message sync runs when Business
                      WhatsApp is connected
                      {connection.connectedAt ? ` (connected ${connection.connectedAt})` : ''}.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="page-muted" style={{ marginTop: '0.75rem' }}>
                  Connection is managed by company owners and integration managers.
                </p>
              )}
            </>
          ) : (
            <>
              <dl className="integrations-detail-list">
                <div>
                  <dt>Status</dt>
                  <dd>Not Connected</dd>
                </div>
              </dl>
              <p style={{ marginTop: '0.75rem' }}>
                Connect your Meta WhatsApp Business account for customer messaging, notifications and
                AI communications.
              </p>
              {canManage && !showManualSetup ? (
                <div className="integration-actions" style={{ marginTop: '0.75rem' }}>
                  <Button
                    type="button"
                    onClick={() => setShowManualSetup(true)}
                    disabled={isSaving}
                  >
                    Connect
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowManualSetup(true)}
                    disabled={isSaving}
                  >
                    Manual Setup
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowManualSetup(true)}
                    disabled={isSaving}
                  >
                    Advanced
                  </Button>
                </div>
              ) : null}
              {!canManage ? (
                <p className="page-muted" style={{ marginTop: '0.75rem' }}>
                  Not connected. Ask an owner to connect Business WhatsApp.
                </p>
              ) : null}
            </>
          )}
        </Panel>
      ) : null}

      {canManage && connection && showManualSetup ? (
        <Panel title={isConnected ? 'Reconnect Business WhatsApp' : 'Manual Setup'}>
          <p className="page-muted">
            Enter Meta Cloud API credentials. Access tokens are never returned to the browser.
            Sending templates or campaigns still requires existing approval rules.
          </p>
          <form
            className="settings-form"
            onSubmit={(event) => void handleConnect(event)}
            autoComplete="off"
          >
            <Input
              label="Access Token"
              type="password"
              value={formValues.accessToken}
              onChange={(event) =>
                setFormValues((current) => ({ ...current, accessToken: event.target.value }))
              }
              autoComplete="new-password"
              required={!isConnected}
            />
            <Input
              label="Phone Number ID"
              value={formValues.phoneNumberId}
              onChange={(event) =>
                setFormValues((current) => ({ ...current, phoneNumberId: event.target.value }))
              }
              autoComplete="off"
              required
            />
            <Input
              label="Business Account ID (WABA)"
              value={formValues.businessAccountId}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  businessAccountId: event.target.value,
                }))
              }
              autoComplete="off"
              required
            />
            <Input
              label="Webhook Verify Token"
              value={formValues.webhookVerifyToken}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  webhookVerifyToken: event.target.value,
                }))
              }
              autoComplete="off"
              required={false}
            />
            <div className="integration-actions">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Connecting…' : isConnected ? 'Validate & Reconnect' : 'Connect'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isSaving}
                onClick={() => setShowManualSetup(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {isConnected ? (
        <div className="integrations-grid">
          <Panel title="Message Statistics">
            {stats ? (
              <dl className="integrations-detail-list">
                <div>
                  <dt>Messages Today</dt>
                  <dd>{stats.totalMessages}</dd>
                </div>
                <div>
                  <dt>Incoming Messages</dt>
                  <dd>{stats.incomingCount}</dd>
                </div>
                <div>
                  <dt>Outgoing Messages</dt>
                  <dd>{stats.outgoingCount}</dd>
                </div>
                <div>
                  <dt>Pending Approval</dt>
                  <dd>{stats.pendingReplyCount}</dd>
                </div>
                <div>
                  <dt>Draft Messages</dt>
                  <dd>{stats.draftCount}</dd>
                </div>
                <div>
                  <dt>Templates</dt>
                  <dd>
                    {stats.approvedTemplateCount} / {stats.templateCount} approved
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="page-muted">No message activity yet.</p>
            )}
          </Panel>
        </div>
      ) : null}

      {canManage && connection?.status === 'connected' ? (
        <Panel title="Send Test Message">
          <form className="integrations-form" onSubmit={(event) => void handleTestMessage(event)}>
            <Input
              label="Recipient Phone Number"
              value={testPhoneNumber}
              onChange={(event) => setTestPhoneNumber(event.target.value)}
              placeholder="+27..."
              required
            />
            <label className="titan-input-group">
              <span className="titan-input-label">Message</span>
              <textarea
                className="titan-input crm-textarea"
                rows={3}
                value={testMessage}
                onChange={(event) => setTestMessage(event.target.value)}
                required
              />
            </label>
            <Button type="submit" disabled={isTesting}>
              {isTesting ? 'Sending…' : 'Send Test Message'}
            </Button>
          </form>
        </Panel>
      ) : null}

      {isConnected ? (
        <Panel title="Template Management">
          {canManage ? (
            <form
              className="integrations-form integrations-form--compact"
              onSubmit={(event) => void handleCreateTemplate(event)}
            >
              <Input
                label="Template Name"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                required
              />
              <label className="titan-input-group">
                <span className="titan-input-label">Category</span>
                <select
                  className="titan-input"
                  value={templateCategory}
                  onChange={(event) =>
                    setTemplateCategory(event.target.value as WhatsappTemplateCategory)
                  }
                >
                  {WHATSAPP_TEMPLATE_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="titan-input-group">
                <span className="titan-input-label">Body</span>
                <textarea
                  className="titan-input crm-textarea"
                  rows={3}
                  value={templateBody}
                  onChange={(event) => setTemplateBody(event.target.value)}
                  placeholder="Hi {{customer_name}}, your job is confirmed."
                  required
                />
              </label>
              <Button type="submit" disabled={isCreatingTemplate}>
                {isCreatingTemplate ? 'Saving…' : 'Add Template'}
              </Button>
            </form>
          ) : null}

          {templates.length === 0 ? (
            <p className="page-muted">No Business WhatsApp templates configured yet.</p>
          ) : (
            <ul className="integrations-template-list">
              {templates.map((template) => (
                <li key={template.id} className="integrations-template-item">
                  <div>
                    <strong>{template.name}</strong>
                    <span className="integrations-template-item__meta">
                      {template.category} · {template.status} · {template.language}
                    </span>
                    <p>{template.body}</p>
                  </div>
                  {canManage ? (
                    <div className="integrations-form__actions">
                      {template.status !== 'approved' ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void handleApproveTemplate(template.id)}
                        >
                          Mark Approved
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void handleDeleteTemplate(template.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
