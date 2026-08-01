import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Panel } from '@titan/ui';
import type {
  N8nConnectionSummary,
  N8nExecutionSummary,
  N8nWorkflowRegistrationSummary,
} from '@titan/shared';
import { formatN8nExecutionStatus } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { AutomationNav } from '../../features/automation/AutomationNav';
import { canAccessAutomation, canManageAutomation } from '../../features/automation/utils';
import {
  approveN8nExecution,
  cancelN8nExecution,
  configureN8nConnection,
  disconnectN8nConnection,
  fetchN8nConnection,
  fetchN8nExecutions,
  fetchN8nWorkflows,
  registerN8nWorkflow,
  retryN8nExecution,
  verifyN8nConnection,
} from '../../lib/n8n-orchestration-api';

export function N8nOrchestrationPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(() => (user ? canAccessAutomation(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageAutomation(user.permissions) : false), [user]);
  const canConfigure = useMemo(() => {
    if (!user) return false;
    if (user.permissions.includes('*')) return true;
    const role = (user.roleName || '').toLowerCase();
    return role === 'company owner' || role === 'owner';
  }, [user]);

  const [connection, setConnection] = useState<N8nConnectionSummary | null>(null);
  const [workflows, setWorkflows] = useState<N8nWorkflowRegistrationSummary[]>([]);
  const [executions, setExecutions] = useState<N8nExecutionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:5678');
  const [apiKey, setApiKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [wfName, setWfName] = useState('');
  const [wfKey, setWfKey] = useState('');
  const [wfTrigger, setWfTrigger] = useState('job.completed');

  async function reload() {
    if (!accessToken || !canView) return;
    const [conn, wfs, exs] = await Promise.all([
      fetchN8nConnection(accessToken),
      fetchN8nWorkflows(accessToken),
      fetchN8nExecutions(accessToken),
    ]);
    setConnection(conn);
    setWorkflows(wfs);
    setExecutions(exs);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        await reload();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load n8n orchestration');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, canView]);

  async function onConfigure(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canConfigure) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const conn = await configureN8nConnection(accessToken, {
        baseUrl,
        apiKey,
        webhookSecret,
      });
      setConnection(conn);
      setApiKey('');
      setWebhookSecret('');
      setSuccess('Configuration saved as SETUP REQUIRED — verify before use.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Configure failed');
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    if (!accessToken || !canConfigure) return;
    setBusy(true);
    setError(null);
    try {
      const conn = await verifyN8nConnection(accessToken);
      setConnection(conn);
      setSuccess(
        conn.status === 'connected_usable'
          ? 'Verified — n8n is connected_usable for loopback orchestration.'
          : `Verification result: ${conn.capabilityLabel}`,
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Verify failed');
      try {
        await reload();
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    if (!accessToken || !canConfigure) return;
    setBusy(true);
    setError(null);
    try {
      const conn = await disconnectN8nConnection(accessToken);
      setConnection(conn);
      setSuccess('Disconnected — new external executions blocked; native workflows unchanged.');
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Disconnect failed');
    } finally {
      setBusy(false);
    }
  }

  async function onRegisterWorkflow(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canConfigure) return;
    setBusy(true);
    setError(null);
    try {
      await registerN8nWorkflow(accessToken, {
        name: wfName,
        externalWorkflowKey: wfKey,
        triggerEvent: wfTrigger,
        requiresApproval: true,
        status: 'active',
      });
      setWfName('');
      setWfKey('');
      setSuccess('n8n workflow registered (approval required for sensitive dispatch).');
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Register failed');
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader
          title="n8n orchestration"
          description="You do not have permission to view automation."
        />
      </div>
    );
  }

  return (
    <div className="automation-page">
      <PageHeader
        title="n8n orchestration"
        description="Hybrid external orchestration — TITAN owns rules, approvals and writes; n8n only runs approved outbound work."
      />
      <AutomationNav />

      {isLoading ? <p className="page-muted">Loading n8n status…</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {success ? <p className="page-muted" role="status">{success}</p> : null}

      <Panel title="Connector status">
        {connection ? (
          <div className="automation-n8n-status">
            <p>
              <strong>Capability:</strong> {connection.capabilityLabel}{' '}
              <span className="page-muted">({connection.status})</span>
            </p>
            <p className="page-muted">
              Host: {connection.baseUrlHost ?? '—'} · Credentials:{' '}
              {connection.hasCredentials ? 'stored (encrypted)' : 'none'} · Dispatch:{' '}
              {connection.dispatchEnabled ? 'enabled' : 'blocked'}
            </p>
            {connection.lastError ? <p className="form-error">{connection.lastError}</p> : null}
            {connection.lastVerifiedAt ? (
              <p className="page-muted">
                Last verified: {new Date(connection.lastVerifiedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="page-muted">No connection row yet — defaults to NOT CONFIGURED.</p>
        )}

        {canConfigure ? (
          <form className="form-stack" onSubmit={onConfigure} style={{ marginTop: '1rem' }}>
            <label>
              Loopback base URL
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                required
                autoComplete="off"
              />
            </label>
            <label>
              API key
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              Webhook signing secret
              <input
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                required
                minLength={16}
                autoComplete="new-password"
              />
            </label>
            <div className="button-row">
              <Button type="submit" disabled={busy}>
                Save configuration
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void onVerify()}>
                Verify loopback
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void onDisconnect()}
              >
                Disconnect
              </Button>
            </div>
            <p className="page-muted">
              Only 127.0.0.1 / localhost endpoints are accepted. Credentials never appear in API
              responses.
            </p>
          </form>
        ) : (
          <p className="page-muted">
            {canWrite
              ? 'Managers may view executions. Company Owner configures the connector.'
              : 'Read-only access.'}
          </p>
        )}
      </Panel>

      <Panel title="Registered n8n workflows">
        {canConfigure ? (
          <form className="form-stack" onSubmit={onRegisterWorkflow}>
            <label>
              Name
              <input value={wfName} onChange={(e) => setWfName(e.target.value)} required />
            </label>
            <label>
              External workflow key
              <input value={wfKey} onChange={(e) => setWfKey(e.target.value)} required />
            </label>
            <label>
              Trigger event
              <input value={wfTrigger} onChange={(e) => setWfTrigger(e.target.value)} required />
            </label>
            <Button type="submit" disabled={busy}>
              Register workflow
            </Button>
          </form>
        ) : null}

        {workflows.length === 0 ? (
          <EmptyState
            title="No n8n workflows registered"
            description="Register an external workflow key after the connector is configured."
          />
        ) : (
          <div className="automation-table-wrap">
            <table className="automation-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>Approval</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((wf) => (
                  <tr key={wf.id}>
                    <td>{wf.name}</td>
                    <td>{wf.externalWorkflowKey}</td>
                    <td>{wf.triggerEvent}</td>
                    <td>{wf.status}</td>
                    <td>{wf.version}</td>
                    <td>{wf.requiresApproval ? 'Required' : 'Not required'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="External executions">
        {executions.length === 0 ? (
          <EmptyState
            title="No external executions"
            description="Dispatched n8n runs appear here with correlation IDs, retries and outcomes."
          />
        ) : (
          <div className="automation-table-wrap">
            <table className="automation-table">
              <thead>
                <tr>
                  <th>Workflow</th>
                  <th>Status</th>
                  <th>Correlation</th>
                  <th>Attempts</th>
                  <th>Provider</th>
                  <th>Outcome</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((ex) => (
                  <tr key={ex.id}>
                    <td>{ex.workflowName ?? ex.workflowRegistrationId.slice(0, 8)}</td>
                    <td>{formatN8nExecutionStatus(ex.status)}</td>
                    <td>
                      <code>{ex.correlationId.slice(0, 8)}…</code>
                    </td>
                    <td>
                      {ex.attemptCount}/{ex.maxAttempts}
                    </td>
                    <td>{ex.providerAccepted ? 'Accepted' : 'Not accepted'}</td>
                    <td>
                      {ex.businessOutcome ?? '—'}
                      {ex.sanitizedError ? (
                        <span className="form-error"> {ex.sanitizedError}</span>
                      ) : null}
                    </td>
                    <td>
                      <div className="button-row">
                        {ex.status === 'awaiting_approval' && canConfigure ? (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void approveN8nExecution(accessToken!, ex.id).then(() => reload())
                            }
                          >
                            Approve
                          </Button>
                        ) : null}
                        {['failed', 'timed_out'].includes(ex.status) && canWrite ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              void retryN8nExecution(accessToken!, ex.id).then(() => reload())
                            }
                          >
                            Retry
                          </Button>
                        ) : null}
                        {!['succeeded', 'cancelled'].includes(ex.status) && canWrite ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              void cancelN8nExecution(accessToken!, ex.id).then(() => reload())
                            }
                          >
                            Cancel
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
