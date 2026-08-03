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
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import {
  formatOwnerIntegrationHonesty,
  ownerHonestyCtaLabel,
  pickOwnerDashboardProviders,
  toOwnerIntegrationHonesty,
} from './integration-honesty';

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

function IntegrationConnectionsRailPanel() {
  const { accessToken } = useAuth();

  const hubQuery = useStaffCachedQuery({
    queryKey: 'integrations/hub/dashboard?simple=true',
    enabled: Boolean(accessToken),
    fetcher: async () => fetchIntegrationHubDashboard(accessToken!, { simple: true }),
  });

  const coreProviders = pickOwnerDashboardProviders(hubQuery.data?.providers ?? []);

  return (
    <Panel
      title="Connections"
      description="Gmail, Xero, Cartrack, Maps, WhatsApp, and Payments — live hub status"
    >
      {hubQuery.isLoading && !hubQuery.data ? (
        <DashboardSectionSkeleton rows={6} />
      ) : hubQuery.error && !hubQuery.data ? (
        <div>
          <p className="form-error">{hubQuery.error}</p>
          <Button size="sm" variant="secondary" onClick={() => void hubQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : coreProviders.length === 0 ? (
        <p className="exec-utility-empty">Connection status unavailable.</p>
      ) : (
        <ul className="exec-utility-connections">
          {coreProviders.map((provider) => {
            const honesty = toOwnerIntegrationHonesty(provider.capabilityState);
            const label = formatOwnerIntegrationHonesty(honesty);
            const href = provider.settingsPath || '/integrations';
            const cta = ownerHonestyCtaLabel(honesty, provider.canConnect);
            const tone =
              honesty === 'connected' ? 'is-ok' : honesty === 'attention' ? 'is-warn' : 'is-muted';

            const lastSyncHint =
              String(provider.provider) === 'xero' && honesty === 'connected'
                ? provider.lastSyncAt
                  ? `Synced ${new Date(provider.lastSyncAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}`
                  : 'Connected — awaiting first sync'
                : null;

            return (
              <li key={String(provider.provider)}>
                <span className={`exec-utility-status__dot ${tone}`} />
                <div className="exec-utility-connections__meta">
                  <span className="exec-utility-connections__name">{provider.name}</span>
                  <strong className={`exec-utility-connections__status ${tone}`}>{label}</strong>
                  {lastSyncHint ? (
                    <em className="exec-utility-connections__sync">{lastSyncHint}</em>
                  ) : null}
                </div>
                <Link href={href} className="exec-utility-connections__cta">
                  {cta}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
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
      <IntegrationConnectionsRailPanel />
    </aside>
  );
}
