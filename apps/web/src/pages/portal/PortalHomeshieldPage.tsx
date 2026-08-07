import { useEffect, useState } from 'react';
import { EmptyState, Panel } from '@titan/ui';
import type { HsPortalMembershipView } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { usePortalAuth } from '../../lib/portal-auth-context';
import {
  fetchHsPortalMembership,
  HomeshieldExperienceApiClientError,
} from '../../lib/homeshield-experience-api-client';

export function PortalHomeshieldPage() {
  const { accessToken } = usePortalAuth();
  const [membership, setMembership] = useState<HsPortalMembershipView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void fetchHsPortalMembership(accessToken)
      .then((data) => {
        if (!cancelled) setMembership(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof HomeshieldExperienceApiClientError
              ? err.message
              : 'Unable to load HomeShield membership',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return (
    <div className="portal-page">
      <PageHeader
        title="HomeShield"
        description="Your membership, benefits, service reminders, and maintenance history."
      />
      {error ? <p className="form-error">{error}</p> : null}
      {isLoading ? <p className="text-sm">Loading your HomeShield membership…</p> : null}

      {!isLoading && membership ? (
        <>
          <Panel title="Membership">
            <p className="text-sm">{membership.rationale}</p>
            {membership.subscriptions.length === 0 ? (
              <EmptyState
                title="No membership yet"
                description="When you are enrolled in a HomeShield plan, it will appear here. Nothing is invented."
              />
            ) : (
              <ul className="portal-list">
                {membership.subscriptions.map((sub) => (
                  <li key={sub.id}>
                    <strong>{sub.planName ?? 'HomeShield plan'}</strong>
                    <span>{sub.status}</span>
                    {sub.renewsAt ? <span>Renews {sub.renewsAt.slice(0, 10)}</span> : null}
                    {sub.benefits.length > 0 ? (
                      <ul>
                        {sub.benefits.map((b, idx) => (
                          <li key={`${sub.id}-b-${idx}`}>
                            {b.title}
                            {b.description ? ` — ${b.description}` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Service reminders">
            {membership.reminders.length === 0 ? (
              <EmptyState
                title="No reminders"
                description="Service reminders for your membership will show here when scheduled."
              />
            ) : (
              <ul className="portal-list">
                {membership.reminders.map((r) => (
                  <li key={r.id}>
                    <strong>{r.title}</strong>
                    <span>
                      {r.status} · {r.remindAt.slice(0, 16)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Maintenance history">
            {membership.maintenanceHistory.length === 0 ? (
              <EmptyState
                title="No maintenance history"
                description="Completed HomeShield / recurring maintenance visits linked to your account appear here."
              />
            ) : (
              <ul className="portal-list">
                {membership.maintenanceHistory.map((h, idx) => (
                  <li key={`mh-${idx}`}>
                    <strong>{h.planName ?? 'Maintenance'}</strong>
                    <span>
                      {h.status}
                      {h.completedAt ? ` · ${h.completedAt.slice(0, 10)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
