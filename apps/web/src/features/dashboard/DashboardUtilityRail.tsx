import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';
import type { ExecutiveDashboardSummary } from '@titan/shared';
import { AuraComposer } from '../aura/AuraComposer';
import { AuraMessageList } from '../aura/AuraMessageList';
import { useAuraChat } from '../aura/useAuraChat';
import { useAuth } from '../../lib/auth-context';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { fetchIntegrationHubDashboard } from '../../lib/integration-hub-api';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { useEffect, useState } from 'react';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';

type HealthPayload = {
  status?: string;
  database?: string;
  redis?: string;
};

type DashboardUtilityRailProps = {
  summary: ExecutiveDashboardSummary | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

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

function TodayAtAGlanceRailPanel({
  summary,
  isLoading = false,
  error = null,
  onRetry,
}: DashboardUtilityRailProps) {
  const { formatMoney } = useCompanyLocale();
  const glance = summary?.todayAtAGlance ?? null;
  const outstanding = summary?.outstandingInvoices ?? null;

  const jobsToday = glance
    ? glance.jobs.scheduled + glance.jobs.inProgress + glance.jobs.completed
    : null;
  const activeJobs = glance?.jobs.inProgress ?? null;
  const completedJobs = glance?.jobs.completed ?? null;
  const techniciansWorking = summary?.header.teamWorking ?? null;
  const outstandingCount = outstanding?.invoiceCount ?? null;
  const outstandingAmount =
    outstanding && outstanding.invoiceCount > 0
      ? formatMoney(outstanding.outstandingCents, outstanding.currency)
      : glance
        ? formatMoney(glance.money.outstandingCents, glance.money.currency)
        : null;

  return (
    <Panel title="Today At A Glance" description="Executive snapshot — live values only">
      {isLoading && !glance ? (
        <DashboardSectionSkeleton rows={5} />
      ) : error && !glance ? (
        <div>
          <p className="form-error">{error}</p>
          {onRetry ? (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : !glance ? (
        <p className="exec-utility-empty">Snapshot unavailable.</p>
      ) : (
        <ul className="exec-utility-glance">
          <li>
            <span>Jobs today</span>
            <strong>
              {jobsToday}
              <em>
                {glance.jobs.scheduled} scheduled
              </em>
            </strong>
          </li>
          <li>
            <span>Active jobs</span>
            <strong>
              {activeJobs}
              <em>{activeJobs === 0 ? 'None in progress' : 'In progress'}</em>
            </strong>
          </li>
          <li>
            <span>Completed today</span>
            <strong>{completedJobs}</strong>
          </li>
          <li>
            <span>Outstanding</span>
            <strong>
              {outstandingAmount ?? '—'}
              <em>
                {outstandingCount != null
                  ? `${outstandingCount} invoice${outstandingCount === 1 ? '' : 's'}`
                  : 'Open AR'}
              </em>
            </strong>
          </li>
          <li>
            <span>Technicians working</span>
            <strong>{techniciansWorking ?? 0}</strong>
          </li>
        </ul>
      )}
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
          signal:
            typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
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
            : focusProviders
                .map((provider) => `${provider.name}: ${provider.capabilityLabel}`)
                .join(' · ');

  const integrationTone =
    hubQuery.error || needsAttention || integrationSummary !== 'Connected' ? 'is-warn' : 'is-ok';

  return (
    <Panel title="System Status" description="Live API, database, and integration health">
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

export function DashboardUtilityRail({
  summary,
  isLoading = false,
  error = null,
  onRetry,
}: DashboardUtilityRailProps) {
  return (
    <aside className="exec-dashboard-rail" aria-label="Dashboard Utilities">
      <AskAuraRailPanel />
      <TodayAtAGlanceRailPanel
        summary={summary}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
      />
      <SystemStatusRailPanel />
    </aside>
  );
}
