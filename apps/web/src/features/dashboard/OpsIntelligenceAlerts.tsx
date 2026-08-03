import { Link } from 'wouter';
import type { OpsIntelligenceEvent, OpsSuggestedAction } from '@titan/shared';
import { formatOpsTravelSourceLabel } from '@titan/shared';
import { Button, EmptyState, Panel } from '@titan/ui';
import { StatusBadge } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { ackOpsReminder } from '../../lib/ops-intelligence-api-client';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta } from './DashboardSourceMeta';

type OpsIntelligenceAlertsProps = {
  events: OpsIntelligenceEvent[];
  generatedAt?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onDismissed?: () => void;
};

function severityTone(severity: OpsIntelligenceEvent['severity']): 'info' | 'warning' | 'danger' {
  if (severity === 'critical') return 'danger';
  if (severity === 'warning') return 'warning';
  return 'info';
}

function ActionButton({
  action,
  onDismiss,
}: {
  action: OpsSuggestedAction;
  onDismiss: () => void;
}) {
  if (action.type === 'dismiss') {
    return (
      <Button size="sm" variant="secondary" onClick={onDismiss}>
        {action.label}
      </Button>
    );
  }

  if (!action.href) {
    return (
      <Button size="sm" variant="secondary" disabled title={action.honestyNote ?? undefined}>
        {action.label}
      </Button>
    );
  }

  const external = action.href.startsWith('http');
  if (external) {
    return (
      <a href={action.href} target="_blank" rel="noreferrer">
        <Button size="sm" variant={action.requiresOwnerApproval ? 'secondary' : 'primary'}>
          {action.label}
        </Button>
      </a>
    );
  }

  return (
    <Link href={action.href}>
      <Button size="sm" variant={action.requiresOwnerApproval ? 'secondary' : 'primary'}>
        {action.label}
      </Button>
    </Link>
  );
}

export function OpsIntelligenceAlerts({
  events,
  generatedAt = null,
  isLoading = false,
  error = null,
  onRetry,
  onDismissed,
}: OpsIntelligenceAlertsProps) {
  const { accessToken } = useAuth();

  async function dismissEvent(event: OpsIntelligenceEvent) {
    if (!accessToken) return;
    await ackOpsReminder(accessToken, {
      dedupeKey: event.dedupeKey,
      status: 'dismissed',
    });
    onDismissed?.();
  }

  return (
    <Panel
      title="Operations Intelligence"
      description="Advisory only — never auto-messages customers or changes bookings"
    >
      {isLoading && events.length === 0 ? <DashboardSectionSkeleton rows={3} /> : null}
      {error && events.length === 0 ? (
        <EmptyState
          title="Unable To Load Ops Alerts"
          description={error}
          action={
            onRetry ? (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                Retry
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {!isLoading && !error && events.length === 0 ? (
        <EmptyState
          title="No Active Ops Alerts"
          description="Leave-now, late, arrival, and morning brief cards appear here from live schedule and GPS only."
        />
      ) : null}
      {events.length > 0 ? (
        <ul className="ops-intel-alerts">
          {events.map((event) => (
            <li key={event.dedupeKey} className={`ops-intel-alerts__card ops-intel-alerts__card--${event.severity}`}>
              <div className="ops-intel-alerts__head">
                <strong>{event.title}</strong>
                <StatusBadge
                  tone={severityTone(event.severity)}
                  label={event.reminderType.replace(/_/g, ' ')}
                />
              </div>
              <p className="ops-intel-alerts__body">{event.body}</p>
              {event.travel ? (
                <p className="page-muted ops-intel-alerts__travel">
                  Travel: {event.travel.minutes != null ? `${event.travel.minutes} min` : '—'} ·{' '}
                  {formatOpsTravelSourceLabel(event.travel.source)}
                  {event.travel.warning ? ` · ${event.travel.warning}` : ''}
                </p>
              ) : null}
              {event.suggestedActions.some((a) => a.requiresOwnerApproval) ? (
                <p className="page-muted ops-intel-alerts__approval">
                  Owner approval required for notify / move / reassign — TITAN will not auto-execute.
                </p>
              ) : null}
              <div className="ops-intel-alerts__actions">
                {event.suggestedActions.map((action) => (
                  <ActionButton
                    key={`${event.dedupeKey}-${action.type}`}
                    action={action}
                    onDismiss={() => void dismissEvent(event)}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <DashboardSourceMeta
        source="Schedule · GPS positions · Ops intelligence snapshot"
        updatedAt={generatedAt}
        state={error ? 'unavailable' : 'live'}
        href="/scheduling"
        linkLabel="Open scheduling"
      />
    </Panel>
  );
}
