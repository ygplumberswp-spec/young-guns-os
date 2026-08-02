import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';
import { hasAnyPermission } from '@titan/auth/browser';
import { AuraComposer } from '../aura/AuraComposer';
import { AuraMessageList } from '../aura/AuraMessageList';
import { useAuraChat } from '../aura/useAuraChat';
import { useAuth } from '../../lib/auth-context';
import { fetchSecurityDashboard } from '../../lib/enterprise-security-api-client';
import { fetchIntegrationHubDashboard } from '../../lib/integration-hub-api';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { useEffect, useState } from 'react';

type HealthPayload = {
  status?: string;
  database?: string;
  redis?: string;
};

function formatAuditTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function AskAuraRailPanel() {
  const {
    messages,
    isLoading,
    isSending,
    thinkingPhase,
    thinkingElapsedMs,
    hasPageContext,
    workingLabel,
    error,
    sendMessage,
    cancelSend,
  } = useAuraChat();

  return (
    <Panel title="Ask AURA" description="Live AURA chat for this company">
      <div className="exec-utility-ask-chat">
        {error ? <p className="form-error">{error}</p> : null}
        {isLoading ? (
          <p className="page-muted">Loading AURA conversations…</p>
        ) : (
          <AuraMessageList
            messages={messages}
            isSending={isSending}
            thinkingPhase={thinkingPhase}
            thinkingElapsedMs={thinkingElapsedMs}
            hasPageContext={hasPageContext}
          />
        )}
        <AuraComposer
          onSend={sendMessage}
          onCancel={cancelSend}
          disabled={isLoading}
          isWorking={isSending}
          workingLabel={workingLabel || 'Thinking…'}
          placeholder="Ask AURA about your business…"
        />
        <Link href="/aura" className="exec-utility-ask__link">
          Open full AURA chat
        </Link>
      </div>
    </Panel>
  );
}

function RecentActivityRailPanel() {
  const { accessToken, user } = useAuth();
  const canReadSecurity = Boolean(
    user &&
      hasAnyPermission(user.permissions, [
        'security:read',
        'security:write',
        'settings:manage',
        'agents:read',
        '*',
      ]),
  );

  const auditQuery = useStaffCachedQuery({
    queryKey: 'enterprise-security/dashboard-recent-audit',
    enabled: Boolean(accessToken && canReadSecurity),
    fetcher: async () => fetchSecurityDashboard(accessToken!),
  });

  const logs = auditQuery.data?.recentAuditLogs ?? [];

  return (
    <Panel title="Recent activity" description="Live security audit feed">
      {!canReadSecurity ? (
        <p className="exec-utility-empty">
          Audit activity requires security permissions. Ask an Owner to grant access — TITAN will
          not invent activity.
        </p>
      ) : auditQuery.isLoading && !auditQuery.data ? (
        <p className="page-muted">Loading audit activity…</p>
      ) : auditQuery.error ? (
        <div>
          <p className="form-error">{auditQuery.error}</p>
          <Button size="sm" variant="secondary" onClick={() => void auditQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : logs.length === 0 ? (
        <p className="exec-utility-empty">No audit events in the recent window.</p>
      ) : (
        <ul className="exec-utility-activity">
          {logs.slice(0, 8).map((log) => (
            <li key={log.id} className="exec-utility-activity__item exec-utility-activity__item--info">
              <strong>{log.action}</strong>
              <span>
                {log.category}
                {log.userName ? ` · ${log.userName}` : ''}
                {` · ${formatAuditTime(log.occurredAt)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canReadSecurity ? (
        <Link href="/security" className="exec-utility-ask__link">
          Open security centre
        </Link>
      ) : null}
    </Panel>
  );
}

function SystemStatusRailPanel() {
  const { accessToken } = useAuth();
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const hubQuery = useStaffCachedQuery({
    queryKey: 'integrations/hub/dashboard?simple=true',
    enabled: Boolean(accessToken),
    fetcher: async () => fetchIntegrationHubDashboard(accessToken!, { simple: true }),
  });

  useEffect(() => {
    let cancelled = false;
    async function loadHealth() {
      try {
        const res = await fetch('/api/v1/health/ready', {
          headers: { Accept: 'application/json' },
          signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
            ? AbortSignal.timeout(10_000)
            : undefined,
        });
        const json = (await res.json().catch(() => null)) as { data?: HealthPayload } | null;
        if (cancelled) return;
        if (!res.ok) {
          setHealthError('Health check unavailable');
          setHealth(null);
          return;
        }
        setHealth(json?.data ?? null);
        setHealthError(null);
      } catch {
        if (!cancelled) {
          setHealthError('Health check unavailable');
          setHealth(null);
        }
      }
    }
    void loadHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  const apiHealthy = !healthError && health?.status === 'ready';
  const dbConnected = !healthError && health?.database === 'connected';

  const focusProviders = (hubQuery.data?.providers ?? []).filter((provider) =>
    ['xero', 'cartrack'].includes(String(provider.provider)),
  );
  const allUsable =
    focusProviders.length > 0 &&
    focusProviders.every((provider) => provider.capabilityState === 'connected_usable');
  const needsAttention = focusProviders.some((provider) =>
    ['failed_degraded', 'temporarily_unavailable', 'configured_unverified'].includes(
      provider.capabilityState,
    ),
  );
  const integrationSummary = hubQuery.error
    ? 'Unavailable'
    : hubQuery.isLoading && !hubQuery.data
      ? 'Checking…'
      : focusProviders.length === 0
        ? 'No hub data'
        : allUsable
          ? 'Connected'
          : needsAttention
            ? 'Attention needed'
            : focusProviders.map((provider) => `${provider.name}: ${provider.capabilityLabel}`).join(' · ');

  const integrationTone =
    hubQuery.error || needsAttention || integrationSummary !== 'Connected' ? 'is-warn' : 'is-ok';

  return (
    <Panel title="System status" description="Live API, database, and integration health">
      <ul className="exec-utility-status">
        <li>
          <span className={`exec-utility-status__dot${apiHealthy ? ' is-ok' : ' is-warn'}`} />
          <span>API</span>
          <strong>{apiHealthy ? 'Healthy' : healthError ? 'Unavailable' : 'Checking…'}</strong>
        </li>
        <li>
          <span className={`exec-utility-status__dot${dbConnected ? ' is-ok' : ' is-warn'}`} />
          <span>Database</span>
          <strong>
            {dbConnected ? 'Connected' : healthError ? 'Unavailable' : health?.database ?? 'Checking…'}
          </strong>
        </li>
        <li>
          <span className={`exec-utility-status__dot ${integrationTone}`} />
          <span>Integrations</span>
          <strong>{integrationSummary}</strong>
        </li>
      </ul>
      {focusProviders.length > 0 ? (
        <ul className="exec-utility-integrations">
          {focusProviders.map((provider) => (
            <li key={String(provider.provider)}>
              <span>{provider.name}</span>
              <strong>{provider.capabilityLabel}</strong>
            </li>
          ))}
        </ul>
      ) : null}
      <Link href="/integrations" className="exec-utility-ask__link">
        Open integrations
      </Link>
    </Panel>
  );
}

export function DashboardUtilityRail() {
  return (
    <aside className="exec-dashboard-rail" aria-label="Dashboard utilities">
      <AskAuraRailPanel />
      <RecentActivityRailPanel />
      <SystemStatusRailPanel />
    </aside>
  );
}
