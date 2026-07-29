import { useEffect, useState } from 'react';
import { Button, EmptyState, PageHeader, Panel } from '@titan/ui';
import type { MobileTimeEntrySummary } from '@titan/shared';
import {
  MobileApiClientError,
  createMobileTimeEntry,
  fetchMobileTimeEntries,
} from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';

export function MobileTimePage() {
  const { accessToken } = useAuth();
  const [entries, setEntries] = useState<MobileTimeEntrySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadEntries() {
    if (!accessToken) return;
    const data = await fetchMobileTimeEntries(accessToken);
    setEntries(data);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchMobileTimeEntries(accessToken);
        if (!cancelled) setEntries(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof MobileApiClientError ? err.message : 'Unable to load time entries');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleClock(action: 'clock_in' | 'clock_out') {
    if (!accessToken) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await createMobileTimeEntry(accessToken, { entryType: action });
      await loadEntries();
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Unable to record time entry');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading time entries…</p>;

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

      {error ? <p className="form-error">{error}</p> : null}

      <Panel title="Time entries">
        {entries.length === 0 ? (
          <EmptyState title="No time entries" description="Clock in to start recording time." />
        ) : (
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
        )}
      </Panel>
    </div>
  );
}
