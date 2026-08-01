import { Link } from 'wouter';
import { Button, EmptyState, LoadingState } from '@titan/ui';
import { buildDashboardSummaryLine } from '@titan/shared';
import { buildGreetingSalutation, fetchDashboardSummary } from '../../lib/intelligence-api';
import { useCachedQuery } from '../../lib/use-cached-query';
import { AuraQuickMemoryInput } from './AuraQuickMemoryInput';
import { useAuth } from '../../lib/auth-context';

type AuraBusinessDashboardProps = {
  accessToken: string;
  canWriteMemory: boolean;
};

export function AuraBusinessDashboard({
  accessToken,
  canWriteMemory,
}: AuraBusinessDashboardProps) {
  const { user } = useAuth();

  const summaryQuery = useCachedQuery({
    queryKey: 'intelligence/dashboard-summary',
    accessToken,
    enabled: Boolean(accessToken),
    staleTimeMs: 60_000,
    fetcher: async () => fetchDashboardSummary(accessToken),
  });

  const summary = summaryQuery.data ?? null;
  const isLoading = summaryQuery.isLoading && !summary;
  const loadError = summaryQuery.error;

  if (isLoading) {
    return <LoadingState label="Loading business intelligence…" />;
  }

  if (loadError) {
    const providerMissing =
      loadError.toLowerCase().includes('provider') ||
      loadError.toLowerCase().includes('openai') ||
      loadError.toLowerCase().includes('not configured');

    if (providerMissing) {
      return (
        <EmptyState
          title="AI provider not configured"
          description="Connect an AI provider in Integration Settings before using AURA business intelligence."
          action={
            <Link href="/integrations">
              <Button>Open Integration Settings</Button>
            </Link>
          }
        />
      );
    }

    return (
      <EmptyState
        title="Business intelligence unavailable"
        description={loadError}
        action={
          <Link href="/integrations">
            <Button variant="secondary">Review integrations</Button>
          </Link>
        }
      />
    );
  }

  if (!summary) {
    return (
      <EmptyState
        title="No business intelligence yet"
        description="Insights will appear here once your workspace has operational data."
        action={
          <Link href="/aura/todays-plan">
            <Button variant="secondary">Open Today&apos;s Plan</Button>
          </Link>
        }
      />
    );
  }

  const greeting = buildGreetingSalutation(user?.firstName);
  const summaryLine = buildDashboardSummaryLine(summary);

  return (
    <div className="aura-business-dashboard aura-intelligence">
      <div className="aura-intelligence__summary">
        <p className="aura-intelligence__greeting">{greeting}</p>
        <p className="aura-intelligence__counts page-muted">{summaryLine}</p>
        <Link href="/aura/todays-plan">
          <Button className="aura-intelligence__plan-link">Open Today&apos;s Plan</Button>
        </Link>
      </div>

      {summary.urgentItems.length > 0 ? (
        <ul className="aura-intelligence__urgent-list">
          {summary.urgentItems.map((item) => (
            <li key={item.id} className="aura-intelligence__urgent-card">
              <div className="aura-intelligence__urgent-head">
                <strong>{item.title}</strong>
                <span
                  className={`status-pill status-pill--${item.priority === 'blocked' ? 'critical' : 'warning'}`}
                >
                  {item.priority === 'blocked' ? 'Blocked' : 'Urgent'}
                </span>
              </div>
              <p className="page-muted">{item.description}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {canWriteMemory ? <AuraQuickMemoryInput accessToken={accessToken} /> : null}
    </div>
  );
}
