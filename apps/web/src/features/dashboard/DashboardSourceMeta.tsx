import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
  DASHBOARD_STATE_LABELS,
  DASHBOARD_STATE_TONES,
  formatUpdatedLabel,
  type DashboardDataState,
} from './dashboard-honesty';

/**
 * Freshness stamp for endpoints that do not return a server-side `generatedAt`.
 * Records when this client last received a payload — never a guessed time.
 */
export function useReceivedAt(data: unknown): string | null {
  const [receivedAt, setReceivedAt] = useState<string | null>(null);

  useEffect(() => {
    if (data == null) return;
    setReceivedAt(new Date().toISOString());
  }, [data]);

  return receivedAt;
}

type DashboardSourceMetaProps = {
  /** Human-readable origin of the numbers, e.g. "Jobs · Scheduling". */
  source: string;
  /** Server-reported generation time. Null renders "Never" rather than a silent blank. */
  updatedAt?: string | null;
  state?: DashboardDataState;
  /** Supporting module the Owner can open to verify the value. */
  href?: string;
  linkLabel?: string;
  /** Extra honesty context, e.g. why the card is partial. */
  note?: string | null;
};

/**
 * Provenance footer shown under every Owner dashboard card so the value on screen
 * can always be traced to a data source, a freshness timestamp and its module.
 */
export function DashboardSourceMeta({
  source,
  updatedAt = null,
  state = 'live',
  href,
  linkLabel = 'Open module',
  note = null,
}: DashboardSourceMetaProps) {
  return (
    <p className="exec-source-meta">
      <span className={`exec-source-meta__state ${DASHBOARD_STATE_TONES[state]}`}>
        {DASHBOARD_STATE_LABELS[state]}
      </span>
      {' · '}
      <span>Source: {source}</span>
      {' · '}
      <span>Updated {formatUpdatedLabel(updatedAt)}</span>
      {href ? (
        <>
          {' · '}
          <Link href={href} className="exec-source-meta__link">
            {linkLabel}
          </Link>
        </>
      ) : null}
      {note ? <span className="exec-source-meta__note">{note}</span> : null}
    </p>
  );
}
