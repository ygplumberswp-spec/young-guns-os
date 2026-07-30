import { useState } from 'react';
import { Button, PageHeader, Panel } from '@titan/ui';
import {
  MobileApiClientError,
  createMobileTimeEntry,
  fetchMobileTimeEntries,
} from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';

export function MobileTimePage() {
  const { accessToken } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const entriesQuery = useStaffCachedQuery({
    queryKey: 'mobile/time-entries',
    enabled: Boolean(accessToken),
    staleTimeMs: 20_000,
    fetcher: async () => fetchMobileTimeEntries(accessToken!),
  });

  const entries = entriesQuery.data ?? [];

  async function handleClock(action: 'clock_in' | 'clock_out') {
    if (!accessToken) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await createMobileTimeEntry(accessToken, { entryType: action });
      await entriesQuery.refetch();
    } catch (err) {
      setActionError(err instanceof MobileApiClientError ? err.message : 'Unable to record time entry');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="portal-page">
      <PageHeader title="Time & attendance" description="Clock in/out and view recorded time." />

      <Panel title="Quick actions">
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button disabled={isSubmitting} onClick={() => void handleClock('clock_in')}>
            Clock in
          </Button>
          <Button variant="secondary" disabled={isSubmitting} onClick={() => void handleClock('clock_out')}>
            Clock out
          </Button>
        </div>
      </Panel>

      {actionError ? <p className="form-error">{actionError}</p> : null}

      <AnalyticsTabPanel
        isLoading={entriesQuery.isLoading}
        error={entriesQuery.error}
        hasData={entriesQuery.data !== undefined}
        isEmpty={entriesQuery.data !== undefined && entries.length === 0}
        emptyTitle="No time entries"
        emptyDescription="Clock in to start recording time."
        loadingLabel="Loading time entries…"
        onRetry={() => void entriesQuery.refetch()}
      >
        {entries.length > 0 ? (
          <Panel title="Time entries">
            <ul className="portal-list">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.entryType.replace(/_/g, ' ')}</strong>
                  <span>
                    {new Date(entry.startedAt).toLocaleString()}
                    {entry.durationMinutes ? ` · ${entry.durationMinutes} min` : ''}
                    {entry.jobTitle ? ` · ${entry.jobTitle}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </AnalyticsTabPanel>
    </div>
  );
}
