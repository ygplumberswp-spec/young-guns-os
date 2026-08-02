import { PageHeader } from '../../components/ux';
import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import { fetchMobileWorkforceDashboard } from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';
import type { MobileDashboardJobHighlight } from '@titan/shared';

function formatScheduleWindow(job: MobileDashboardJobHighlight): string {
  if (!job.scheduledAt) return 'No scheduled time';
  const start = new Date(job.scheduledAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (!job.scheduledEndAt) return start;
  const end = new Date(job.scheduledEndAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${start} – ${end}`;
}

function JobHighlightCard({ job, actionLabel }: { job: MobileDashboardJobHighlight; actionLabel?: string }) {
  return (
    <>
      <h2>{job.jobNumber ? `${job.jobNumber} · ${job.title}` : job.title}</h2>
      <p>{job.customerName}</p>
      <p className="page-muted">{formatScheduleWindow(job)}</p>
      <Link href={`/jobs/${job.id}`}>
        <Button variant="primary">{actionLabel ?? 'Open job'}</Button>
      </Link>
    </>
  );
}

export function MobileDashboardPage() {
  const { accessToken, user } = useAuth();

  const dashboardQuery = useStaffCachedQuery({
    queryKey: 'mobile/workforce-dashboard',
    enabled: Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: (signal) => fetchMobileWorkforceDashboard(accessToken!, { signal }),
  });

  const dashboard = dashboardQuery.data;

  return (
    <div className="portal-page mobile-dashboard-page">
      <PageHeader
        title={`Today, ${user?.firstName ?? 'Technician'}`}
        description={
          dashboard?.greeting.message ??
          'Your technician workspace loads assigned jobs, route and alerts here.'
        }
      />

      <nav className="mobile-view-switcher" aria-label="Job views">
        <Link href="/jobs" className="mobile-view-switcher__link">
          List
        </Link>
        <Link href="/schedule" className="mobile-view-switcher__link">
          Calendar
        </Link>
        <Link href="/route" className="mobile-view-switcher__link">
          Map / Route
        </Link>
      </nav>

      <AnalyticsTabPanel
        isLoading={dashboardQuery.isLoading}
        error={dashboardQuery.error}
        hasData={dashboard !== undefined}
        loadingLabel="Loading today…"
        onRetry={() => void dashboardQuery.refetch()}
      >
        {dashboard ? (
          <>
            <section className="mobile-schedule-page__highlights">
              <article className="mobile-schedule-page__highlight">
                <p className="mobile-schedule-page__label">Current job</p>
                {dashboard.currentJob ? (
                  <JobHighlightCard job={dashboard.currentJob} actionLabel="Continue job" />
                ) : (
                  <p className="page-muted">No job in progress right now.</p>
                )}
              </article>
              <article className="mobile-schedule-page__highlight">
                <p className="mobile-schedule-page__label">Next job</p>
                {dashboard.nextJob ? (
                  <JobHighlightCard job={dashboard.nextJob} />
                ) : (
                  <p className="page-muted">No upcoming jobs on today&apos;s schedule.</p>
                )}
              </article>
            </section>

            <Panel
              title="My schedule"
              description={`${dashboard.todaysSchedule.length} event(s) today · ${dashboard.upcomingSchedule.length} upcoming`}
            >
              {dashboard.todaysSchedule.length === 0 ? (
                <p className="page-muted">No scheduled events today.</p>
              ) : (
                <ul className="portal-list">
                  {dashboard.todaysSchedule.slice(0, 5).map((event) => (
                    <li key={event.id}>
                      <strong>{event.customerName}</strong>
                      <span>
                        {new Date(event.scheduledAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {event.displayStatus}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/schedule">Open calendar</Link>
            </Panel>

            <Panel
              title="Jobs requiring completion"
              description={`${dashboard.jobsRequiringCompletion.length} active job(s) in completion workflow`}
            >
              {dashboard.jobsRequiringCompletion.length === 0 ? (
                <p className="page-muted">No jobs awaiting completion actions.</p>
              ) : (
                <ul className="portal-list">
                  {dashboard.jobsRequiringCompletion.map((job) => (
                    <li key={job.id}>
                      <strong>{job.jobNumber ?? job.title}</strong>
                      <span>
                        {job.customerName} · {job.executionPhase?.replace(/_/g, ' ') ?? job.status}
                      </span>
                      <Link href={`/jobs/${job.id}`}>Open</Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title="Missing close-out items"
              description={`${dashboard.missingCloseOutItems.length} job(s) blocked on evidence or checklist`}
            >
              {dashboard.missingCloseOutItems.length === 0 ? (
                <p className="page-muted">All assigned jobs meet close-out requirements or are complete.</p>
              ) : (
                <ul className="portal-list">
                  {dashboard.missingCloseOutItems.map((item) => (
                    <li key={item.jobId}>
                      <strong>{item.jobNumber ?? item.title}</strong>
                      <span>Still needed: {item.missingItems.join(', ')}</span>
                      <Link href={`/jobs/${item.jobId}`}>Complete close-out</Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <div className="portal-grid">
              <Panel title="Assigned jobs" description={`${dashboard.assignedJobs.length} total`}>
                <Link href="/jobs">View jobs</Link>
              </Panel>
              <Panel
                title="Route"
                description={`${dashboard.routeSummary.stopCount} stops · next: ${dashboard.routeSummary.nextDestination?.title ?? 'None'}`}
              >
                <Link href="/route">View route</Link>
              </Panel>
              <Panel
                title="Inventory alerts"
                description={`${dashboard.inventoryAlerts.length} low-stock item(s)`}
              >
                <Link href="/inventory">View inventory</Link>
              </Panel>
              <Panel
                title="Outstanding tasks"
                description={`${dashboard.outstandingTaskCount} pending action(s)`}
              >
                <Link href="/sync">Offline sync</Link>
              </Panel>
              <Panel
                title="Notifications"
                description={`${dashboard.unreadNotificationCount} unread`}
              >
                <Link href="/notifications">Open notifications</Link>
              </Panel>
              <Panel
                title="Requests"
                description={`${dashboard.pendingRequestCount} pending approval`}
              >
                <Link href="/time">Time & requests</Link>
              </Panel>
            </div>

            {dashboard.safetyNotices.length > 0 ? (
              <Panel title="Safety notices">
                <ul className="portal-list">
                  {dashboard.safetyNotices.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <span>{item.body}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}

            {dashboard.companyAnnouncements.length > 0 ? (
              <Panel title="Company announcements">
                <ul className="portal-list">
                  {dashboard.companyAnnouncements.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <span>{item.body}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </>
        ) : null}
      </AnalyticsTabPanel>

      {!dashboardQuery.isLoading && dashboard === undefined && !dashboardQuery.error ? (
        <EmptyState title="No dashboard data" description="Your mobile dashboard is empty." />
      ) : null}
    </div>
  );
}
