import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Input, PageHeader, Panel } from '@titan/ui';
import type {
  IntegrationWebhookEndpointSummary,
  IntegrationWebhookEventSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  createIntegrationWebhookEndpoint,
  deleteIntegrationWebhookEndpoint,
  fetchIntegrationWebhookEndpoints,
  fetchIntegrationWebhookEvents,
  updateIntegrationWebhookEndpoint,
} from '../../lib/integration-hub-api';
import { useAuth } from '../../lib/auth-context';
import { IntegrationsNav } from '../../features/integrations/IntegrationsNav';
import {
  canAccessIntegrations,
  canManageIntegrations,
} from '../../features/integrations/utils';
import { formatWebhookEventStatus } from '../../features/integrations/formatters';

export function WebhookFoundationPage() {
  const { accessToken, user } = useAuth();
  const [endpoints, setEndpoints] = useState<IntegrationWebhookEndpointSummary[]>([]);
  const [events, setEvents] = useState<IntegrationWebhookEventSummary[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageIntegrations(user.permissions) : false), [user]);

  async function loadPageData() {
    if (!accessToken || !canView) {
      return;
    }

    const [endpointData, eventData] = await Promise.all([
      fetchIntegrationWebhookEndpoints(accessToken),
      fetchIntegrationWebhookEvents(accessToken),
    ]);

    setEndpoints(endpointData);
    setEvents(eventData);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        await loadPageData();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load webhook foundation');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  async function handleCreateEndpoint(event: FormEvent) {
    event.preventDefault();

    if (!accessToken || !canManage) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);
    setCreatedSecret(null);

    try {
      const endpoint = await createIntegrationWebhookEndpoint(accessToken, {
        name,
        description: description.trim() || null,
      });

      setCreatedSecret(endpoint.secret ?? null);
      setName('');
      setDescription('');
      setSuccess(`Webhook endpoint "${endpoint.name}" created. Copy the secret now — it will not be shown again.`);
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create webhook endpoint');
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleEndpoint(endpoint: IntegrationWebhookEndpointSummary) {
    if (!accessToken || !canManage) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      await updateIntegrationWebhookEndpoint(accessToken, endpoint.id, {
        isActive: !endpoint.isActive,
      });
      setSuccess(`Webhook endpoint "${endpoint.name}" updated.`);
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update webhook endpoint');
    }
  }

  async function removeEndpoint(endpoint: IntegrationWebhookEndpointSummary) {
    if (!accessToken || !canManage) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      await deleteIntegrationWebhookEndpoint(accessToken, endpoint.id);
      setSuccess(`Webhook endpoint "${endpoint.name}" deleted.`);
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to delete webhook endpoint');
    }
  }

  if (!canView) {
    return (
      <div className="integrations-page">
        <PageHeader title="Webhooks" description="You do not have permission to view webhooks." />
      </div>
    );
  }

  return (
    <div className="integrations-page">
      <PageHeader
        title="Webhooks"
        description="Foundation for inbound webhook endpoints and event logging. Full webhook automation is not connected yet."
      />
      <IntegrationsNav />

      {isLoading ? <p className="page-muted">Loading webhook foundation…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}
      {createdSecret ? (
        <Panel title="Endpoint secret">
          <p className="page-muted">Store this secret securely. It cannot be retrieved again.</p>
          <code className="integrations-secret">{createdSecret}</code>
        </Panel>
      ) : null}

      {!isLoading ? (
        <>
          {canManage ? (
            <Panel title="Create webhook endpoint">
              <form className="integrations-form" onSubmit={(event) => void handleCreateEndpoint(event)}>
                <label>
                  Name
                  <Input value={name} onChange={(event) => setName(event.target.value)} required />
                </label>
                <label>
                  Description
                  <Input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Optional description"
                  />
                </label>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Creating…' : 'Create endpoint'}
                </Button>
              </form>
            </Panel>
          ) : null}

          <section className="integrations-section integrations-section--split">
            <Panel title="Webhook endpoints">
              {endpoints.length === 0 ? (
                <EmptyState
                  title="No webhook endpoints"
                  description="Create an endpoint to prepare for inbound webhook delivery."
                />
              ) : (
                <ul className="integrations-endpoint-list">
                  {endpoints.map((endpoint) => (
                    <li key={endpoint.id} className="integrations-endpoint-item">
                      <div>
                        <strong>{endpoint.name}</strong>
                        <p className="page-muted">{endpoint.description ?? 'No description'}</p>
                        <p className="page-muted">
                          {endpoint.isActive ? 'Active' : 'Inactive'} · Updated{' '}
                          {new Date(endpoint.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      {canManage ? (
                        <div className="integrations-endpoint-item__actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void toggleEndpoint(endpoint)}
                          >
                            {endpoint.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void removeEndpoint(endpoint)}
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

            <Panel title="Webhook event log">
              {events.length === 0 ? (
                <EmptyState
                  title="No webhook events"
                  description="Inbound webhook events will appear here once received."
                />
              ) : (
                <div className="integrations-table-wrap">
                  <table className="integrations-table">
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Endpoint</th>
                        <th>Status</th>
                        <th>Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => (
                        <tr key={event.id}>
                          <td>{event.eventType}</td>
                          <td>{event.endpointName ?? '—'}</td>
                          <td>{formatWebhookEventStatus(event.status)}</td>
                          <td>{new Date(event.receivedAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </section>
        </>
      ) : null}
    </div>
  );
}
