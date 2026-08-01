import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Input, Panel } from '@titan/ui';
import { isCompanyOwnerRole } from '@titan/auth/browser';
import type {
  WhatsappConnectionSummary,
  WhatsappStats,
  WhatsappTemplateCategory,
  WhatsappTemplateSummary,
} from '@titan/shared';
import { WHATSAPP_TEMPLATE_CATEGORY_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  createWhatsappTemplate,
  deleteWhatsappTemplate,
  disconnectWhatsapp,
  fetchWhatsappIntegration,
  saveWhatsappConnection,
  sendWhatsappTestMessage,
  updateWhatsappTemplate,
} from '../../lib/whatsapp-api';
import { useAuth } from '../../lib/auth-context';
import { IntegrationsNav } from '../../features/integrations/IntegrationsNav';
import { IntegrationConnectionLock } from '../../features/integrations/IntegrationConnectionLock';
import { canAccessIntegrations, canManageIntegrations } from '../../features/integrations/utils';

export function WhatsappSettingsPage() {
  const { accessToken, user } = useAuth();
  const [connection, setConnection] = useState<WhatsappConnectionSummary | null>(null);
  const [stats, setStats] = useState<WhatsappStats | null>(null);
  const [templates, setTemplates] = useState<WhatsappTemplateSummary[]>([]);
  const [accessTokenField, setAccessTokenField] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
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
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
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
    const data = await fetchWhatsappIntegration(accessToken);
    setConnection(data.connection);
    setStats(data.stats);
    setTemplates(data.templates);
    if (data.connection.phoneNumberId) setPhoneNumberId(data.connection.phoneNumberId);
    if (data.connection.businessAccountId) setBusinessAccountId(data.connection.businessAccountId);
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
            err instanceof ApiClientError ? err.message : 'Unable to load WhatsApp settings',
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
        accessToken: formValues.accessToken || accessTokenField || undefined,
        phoneNumberId: formValues.phoneNumberId || phoneNumberId,
        businessAccountId: formValues.businessAccountId || businessAccountId,
        webhookVerifyToken: formValues.webhookVerifyToken.trim() || null,
      });
      setConnection(updated);
      setAccessTokenField('');
      setFormValues((current) => ({ ...current, accessToken: '', webhookVerifyToken: '' }));
      setSuccess('WhatsApp Business connected successfully.');
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to connect WhatsApp');
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
      setSuccess('WhatsApp disconnected.');
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to disconnect WhatsApp');
    } finally {
      setIsSaving(false);
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
    return <p className="page-muted">Loading WhatsApp settings…</p>;
  }

  return (
    <div className="integrations-page">
      <PageHeader
        title="WhatsApp Business"
        description="Connect WhatsApp Business API for customer messaging and notifications."
      />
      <IntegrationsNav />

      {connection ? (
        <IntegrationConnectionLock
          providerName="WhatsApp Business"
          status={connection.status}
          isConnected={connection.hasCredentials}
          canManage={canManage}
          isOwner={isOwner}
          isBusy={isSaving}
          error={error}
          success={success}
          statusRows={[
            {
              label: 'Phone number',
              value: connection.displayPhoneNumber ?? connection.phoneNumberId ?? '—',
            },
            { label: 'Business account ID', value: connection.businessAccountId ?? '—' },
            { label: 'Webhook URL', value: connection.webhookUrl },
            {
              label: 'Verify token',
              value: connection.webhookVerifyTokenHint ?? 'Generated on connect',
            },
          ]}
          connectFields={[
            {
              key: 'accessToken',
              label: 'Access token',
              type: 'password',
              autoComplete: 'new-password',
            },
            { key: 'phoneNumberId', label: 'Phone number ID', autoComplete: 'off' },
            { key: 'businessAccountId', label: 'Business account ID (WABA)', autoComplete: 'off' },
            {
              key: 'webhookVerifyToken',
              label: 'Webhook verify token (optional)',
              required: false,
              autoComplete: 'off',
            },
          ]}
          connectValues={formValues}
          onConnectValueChange={(key, value) =>
            setFormValues((current) => ({ ...current, [key]: value }))
          }
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onReplaceCredentials={handleConnect}
          connectHelpText="Messages sync in the background after connect. Sending templates or campaigns requires existing approval rules. Access tokens are never returned to the browser."
        />
      ) : null}

      <div className="integrations-grid">
        <Panel title="Message statistics">
          {stats ? (
            <dl className="integrations-detail-list">
              <div>
                <dt>Total messages</dt>
                <dd>{stats.totalMessages}</dd>
              </div>
              <div>
                <dt>Incoming</dt>
                <dd>{stats.incomingCount}</dd>
              </div>
              <div>
                <dt>Outgoing</dt>
                <dd>{stats.outgoingCount}</dd>
              </div>
              <div>
                <dt>Drafts awaiting approval</dt>
                <dd>{stats.draftCount}</dd>
              </div>
              <div>
                <dt>Pending replies</dt>
                <dd>{stats.pendingReplyCount}</dd>
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

      {canManage && connection?.status === 'connected' ? (
        <Panel title="Send test message">
          <form className="integrations-form" onSubmit={(event) => void handleTestMessage(event)}>
            <Input
              label="Recipient phone number"
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
              {isTesting ? 'Sending…' : 'Send test message'}
            </Button>
          </form>
        </Panel>
      ) : null}

      <Panel title="Template management">
        {canManage ? (
          <form
            className="integrations-form integrations-form--compact"
            onSubmit={(event) => void handleCreateTemplate(event)}
          >
            <Input
              label="Template name"
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
              {isCreatingTemplate ? 'Saving…' : 'Add template'}
            </Button>
          </form>
        ) : null}

        {templates.length === 0 ? (
          <p className="page-muted">No WhatsApp templates configured yet.</p>
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
                        Mark approved
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
    </div>
  );
}
