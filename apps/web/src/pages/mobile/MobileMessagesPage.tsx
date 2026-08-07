import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';
import type { JobSummary, MobileWorkforceRequestType } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import {
  MobileApiClientError,
  createMobileRequest,
  fetchMobileRequests,
  fetchMobileWorkforceJobs,
} from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';

const OFFICE_REQUEST_TYPES: Array<{ value: MobileWorkforceRequestType; label: string }> = [
  { value: 'general_request', label: 'Office / dispatch' },
  { value: 'schedule_change', label: 'Schedule change' },
  { value: 'inventory_request', label: 'Parts request' },
];

function jobLabel(job: JobSummary): string {
  return job.jobNumber ? `${job.jobNumber} · ${job.title}` : job.title;
}

/**
 * Technician Messages — assigned jobs, dispatch/office requests, and job-card
 * site communication entry points. Not Notifications. Not company CRM inbox.
 */
export function MobileMessagesPage() {
  const { accessToken } = useAuth();
  const [requestType, setRequestType] = useState<MobileWorkforceRequestType>('general_request');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [linkedJobId, setLinkedJobId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const jobsQuery = useStaffCachedQuery({
    queryKey: 'mobile/workforce-jobs',
    enabled: Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: async () => fetchMobileWorkforceJobs(accessToken!),
  });

  const requestsQuery = useStaffCachedQuery({
    queryKey: 'mobile/workforce-requests',
    enabled: Boolean(accessToken),
    staleTimeMs: 20_000,
    fetcher: async () => fetchMobileRequests(accessToken!),
  });

  const jobs = jobsQuery.data?.jobs ?? [];
  const requests = requestsQuery.data ?? [];
  const assignedJobs = useMemo(
    () => jobs.filter((job) => job.status !== 'cancelled'),
    [jobs],
  );

  async function handleSendOfficeRequest() {
    if (!accessToken) return;
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();
    if (!trimmedSubject || !trimmedMessage) {
      setActionError('Subject and message are required.');
      return;
    }
    setIsSubmitting(true);
    setActionError(null);
    setActionOk(null);
    try {
      await createMobileRequest(accessToken, {
        requestType,
        subject: trimmedSubject,
        message: trimmedMessage,
        entityType: linkedJobId ? 'job' : undefined,
        entityId: linkedJobId || undefined,
      });
      setSubject('');
      setMessage('');
      setActionOk('Message sent to office / dispatch.');
      await requestsQuery.refetch();
    } catch (err) {
      setActionError(
        err instanceof MobileApiClientError ? err.message : 'Unable to send message.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const isLoading = jobsQuery.isLoading || requestsQuery.isLoading;
  const error = jobsQuery.error ?? requestsQuery.error ?? actionError;

  return (
    <div className="portal-page">
      <PageHeader
        title="Messages"
        description="Assigned jobs, dispatch/office, and authorised site updates via your job cards. Alerts live under Notifications."
      />

      {actionOk ? <p className="portal-brand-sub">{actionOk}</p> : null}
      {actionError ? <p className="form-error">{actionError}</p> : null}

      <AnalyticsTabPanel
        isLoading={isLoading}
        error={error}
        hasData={jobsQuery.data !== undefined || requestsQuery.data !== undefined}
        isEmpty={false}
        emptyTitle="No messages"
        emptyDescription="Job threads and office requests will appear here."
        loadingLabel="Loading messages…"
        onRetry={() => {
          void jobsQuery.refetch();
          void requestsQuery.refetch();
        }}
      >
        <div className="space-y-4">
          <Panel title="Dispatch / office">
            <p className="portal-brand-sub" style={{ marginBottom: '0.75rem' }}>
              Send an authorised request to the office. Linked only to your assigned jobs.
            </p>
            <div className="space-y-2">
              <label className="portal-brand-sub">
                Type
                <select
                  className="titan-input"
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value as MobileWorkforceRequestType)}
                >
                  {OFFICE_REQUEST_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="portal-brand-sub">
                Related assigned job (optional)
                <select
                  className="titan-input"
                  value={linkedJobId}
                  onChange={(e) => setLinkedJobId(e.target.value)}
                >
                  <option value="">No job link</option>
                  {assignedJobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {jobLabel(job)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="portal-brand-sub">
                Subject
                <input
                  className="titan-input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                />
              </label>
              <label className="portal-brand-sub">
                Message
                <textarea
                  className="titan-input"
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={2000}
                />
              </label>
              <Button
                type="button"
                size="sm"
                disabled={isSubmitting}
                onClick={() => void handleSendOfficeRequest()}
              >
                {isSubmitting ? 'Sending…' : 'Send to office'}
              </Button>
            </div>
          </Panel>

          <Panel title="Office / dispatch threads">
            {requests.length === 0 ? (
              <p className="portal-brand-sub">No office requests yet.</p>
            ) : (
              <ul className="portal-list">
                {requests.map((item) => (
                  <li key={item.id}>
                    <strong>{item.subject}</strong>
                    <span>
                      {item.requestType.replaceAll('_', ' ')} · {item.status.replaceAll('_', ' ')} ·{' '}
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                    <span>{item.message}</span>
                    {item.entityType === 'job' && item.entityId ? (
                      <span>
                        <Link href={`/jobs/${item.entityId}`}>Open linked job card</Link>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Assigned job threads">
            <p className="portal-brand-sub" style={{ marginBottom: '0.75rem' }}>
              Customer/site communication stays on the job card for that assignment only.
            </p>
            {assignedJobs.length === 0 ? (
              <p className="portal-brand-sub">No assigned jobs.</p>
            ) : (
              <ul className="portal-list">
                {assignedJobs.map((job) => (
                  <li key={job.id}>
                    <strong>{jobLabel(job)}</strong>
                    <span>
                      {job.customerName ?? 'Site'} · {job.status.replaceAll('_', ' ')}
                    </span>
                    <span>
                      <Link href={`/jobs/${job.id}`}>Open job card messages / notes</Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Alerts">
            <p className="portal-brand-sub">
              System alerts and unread counts are under{' '}
              <Link href="/notifications">Notifications</Link> — not this Messages inbox.
            </p>
          </Panel>
        </div>
      </AnalyticsTabPanel>
    </div>
  );
}
