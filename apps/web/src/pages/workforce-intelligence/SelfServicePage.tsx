import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import type { WiSelfServiceSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchSelfService } from '../../lib/enterprise-workforce-intelligence-api-client';
import { useAuth } from '../../lib/auth-context';
import { canAccessWorkforceIntelligence } from '../../features/workforce-intelligence/utils';

export function SelfServicePage() {
  const { accessToken, user } = useAuth();
  const [selfService, setSelfService] = useState<WiSelfServiceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(
    () => (user ? canAccessWorkforceIntelligence(user.permissions) : false),
    [user],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        const data = (await fetchSelfService(accessToken)) as WiSelfServiceSummary;
        if (!cancelled) setSelfService(data);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load self-service workspace',
          );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader
          title="Employee Self-Service"
          description="You do not have permission to access self-service."
        />
      </div>
    );
  }

  return (
    <div className="automation-page">
      <PageHeader
        title="Employee Self-Service"
        description="View your profile, timesheets, leave, certifications, and training."
        actions={
          <Link href="/workforce-intelligence">
            <Button variant="secondary">Workforce Intelligence</Button>
          </Link>
        }
      />

      {isLoading ? <p>Loading self-service...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {selfService ? (
        <>
          <Panel title="My Profile">
            {selfService.profile ? (
              <ul className="simple-list">
                <li>Job title: {selfService.profile.jobTitle ?? 'Not set'}</li>
                <li>Department: {selfService.profile.department ?? 'Not set'}</li>
                <li>Status: {selfService.profile.lifecycleStage}</li>
              </ul>
            ) : (
              <EmptyState
                title="No workforce profile"
                description="Your HR profile has not been created yet."
              />
            )}
          </Panel>

          <Panel title="My Timesheets">
            {selfService.timesheets.length === 0 ? (
              <EmptyState
                title="No timesheets"
                description="Submit timesheets through this workspace or mobile."
              />
            ) : (
              <ul className="simple-list">
                {selfService.timesheets.map((ts) => (
                  <li key={ts.id}>
                    {ts.periodStart} – {ts.periodEnd}: {ts.status} ({ts.standardHours}h)
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="My Leave">
            {selfService.leaveApplications.length === 0 ? (
              <EmptyState
                title="No leave applications"
                description="Request leave when leave categories are configured."
              />
            ) : (
              <ul className="simple-list">
                {selfService.leaveApplications.map((leave) => (
                  <li key={leave.id}>
                    {leave.categoryName}: {leave.startDate} – {leave.endDate} ({leave.status})
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Certifications & Training">
            {selfService.certifications.length === 0 && selfService.training.length === 0 ? (
              <EmptyState
                title="No records"
                description="Certifications and training records appear when configured by HR."
              />
            ) : (
              <>
                {selfService.certifications.length > 0 ? (
                  <ul className="simple-list">
                    {selfService.certifications.map((cert) => (
                      <li key={cert.id}>
                        {cert.name}
                        {cert.expiresAt ? ` — expires ${cert.expiresAt}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {selfService.training.length > 0 ? (
                  <ul className="simple-list">
                    {selfService.training.map((tr) => (
                      <li key={tr.id}>
                        {tr.title} ({tr.status})
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
