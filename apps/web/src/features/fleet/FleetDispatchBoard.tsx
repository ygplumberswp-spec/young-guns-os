import { Link } from 'wouter';
import { Button, EmptyState, LoadingState, Panel } from '@titan/ui';
import { buildAddressMapsDeepLink } from '@titan/shared';
import { fetchTodaysJobs } from '../../lib/jobs-api';
import { fetchVehicles } from '../../lib/fleet-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';

/**
 * UX-024 — operational dispatch surface from stored job/vehicle data.
 * Registry and planned times only — live GPS is on Fleet → Live Map.
 */
export function FleetDispatchBoard() {
  const { accessToken } = useAuth();

  const jobsQuery = useStaffCachedQuery({
    queryKey: 'fleet/dispatch-today-jobs',
    enabled: Boolean(accessToken),
    fetcher: async () => fetchTodaysJobs(accessToken!),
  });
  const vehiclesQuery = useStaffCachedQuery({
    queryKey: 'fleet/dispatch-vehicles',
    enabled: Boolean(accessToken),
    fetcher: async () => fetchVehicles(accessToken!),
  });

  const jobs = jobsQuery.data ?? [];
  const vehicles = vehiclesQuery.data ?? [];
  const loading =
    (jobsQuery.isLoading && !jobsQuery.data) || (vehiclesQuery.isLoading && !vehiclesQuery.data);

  return (
    <Panel
      title="Today's dispatch board"
      description="Assigned vehicles and today's jobs from TITAN records — not live GPS (see Live Map tab)."
    >
      <p className="page-muted" style={{ marginTop: '0.25rem' }}>
        Turn-by-turn routing and provider ETA are not on this page. Planned times and stored
        addresses are shown below.
      </p>

      {loading ? <LoadingState label="Loading today's dispatch…" /> : null}

      {jobsQuery.error || vehiclesQuery.error ? (
        <EmptyState
          title="Unable to load dispatch board"
          description={jobsQuery.error || vehiclesQuery.error || 'Retry to reload.'}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void jobsQuery.refetch();
                void vehiclesQuery.refetch();
              }}
            >
              Retry
            </Button>
          }
        />
      ) : null}

      {!loading && !jobsQuery.error ? (
        <>
          <h3 className="page-section-title" style={{ marginTop: '1rem' }}>
            Vehicles
          </h3>
          {vehicles.length === 0 ? (
            <p className="page-muted">No vehicles on file.</p>
          ) : (
            <ul className="portal-list">
              {vehicles.slice(0, 12).map((vehicle) => (
                <li key={vehicle.id}>
                  <strong>
                    {vehicle.name} · {vehicle.licensePlate}
                  </strong>
                  <span className="page-muted">
                    {' · '}
                    {vehicle.status.replace(/_/g, ' ')}
                    {vehicle.assignedUserName ? ` · ${vehicle.assignedUserName}` : ' · unassigned'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="page-section-title" style={{ marginTop: '1rem' }}>
            Today's jobs
          </h3>
          {jobs.length === 0 ? (
            <EmptyState
              title="No jobs scheduled today"
              description="When jobs are scheduled for today with site addresses, they appear here for dispatch."
              action={
                <Link href="/jobs/new">
                  <Button size="sm" variant="secondary">
                    Schedule job
                  </Button>
                </Link>
              }
            />
          ) : (
            <ul className="portal-list">
              {jobs.map((job) => {
                const deepLink = buildAddressMapsDeepLink(job.addressDisplay);
                return (
                  <li key={job.id}>
                    <Link href={`/jobs/${job.id}`}>
                      <strong>
                        {job.jobNumber ? `${job.jobNumber} · ` : ''}
                        {job.title}
                      </strong>
                    </Link>
                    <span>
                      {job.customerName}
                      {job.assignedUserName ? ` · tech ${job.assignedUserName}` : ' · unassigned'}
                      {job.scheduledAt
                        ? ` · planned ${new Date(job.scheduledAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`
                        : ''}
                    </span>
                    <span>
                      {job.addressDisplay
                        ? `Site: ${job.addressDisplay}`
                        : 'Site address missing on job snapshot'}
                    </span>
                    {deepLink ? (
                      <a href={deepLink} target="_blank" rel="noreferrer">
                        Open address in Maps (deep-link — TITAN does not call Google)
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </Panel>
  );
}
