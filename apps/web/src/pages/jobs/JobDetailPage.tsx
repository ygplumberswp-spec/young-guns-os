import { PageHeader } from '../../components/ux';
import { PropertyLocationPanel } from '../../features/properties/PropertyLocationPanel';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { Button, Input, Panel } from '@titan/ui';
import type {
  JobDetail,
  JobExecutionSummary,
  JobFinanceSummary,
  JobCostingSummary,
  JobMaterialLineSummary,
  JobPriority,
  JobStatus,
  PurchaseOrderSummary,
} from '@titan/shared';
import { AI_NAME, JOB_PRIORITY_OPTIONS, JOB_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchJob,
  fetchJobCostingSummary,
  fetchJobExecution,
  fetchJobMaterialLines,
  updateJob,
} from '../../lib/jobs-api';
import { fetchJobFinanceSummary } from '../../lib/finance-api';
import { fetchPurchaseOrders } from '../../lib/procurement-api';
import { useAuth } from '../../lib/auth-context';
import { Job360Tabs } from '../../features/jobs/Job360Tabs';
import { canManageJobs, formatJobStatus } from '../../features/jobs/JobList';
import { JobCompletionFinancePanel } from '../../features/finance/JobCompletionFinancePanel';
import { canAccessFinance, canManageFinance, canViewFinanceProfit, canViewJobCosting } from '../../features/finance/utils';
import { JobCostingPanel } from '../../features/jobs/JobCostingPanel';
import { JobCompliancePanel } from '../../features/jobs/JobCompliancePanel';
import { JobDocumentPackPanel } from '../../features/jobs/JobDocumentPackPanel';
import { canAccessProcurement } from '../../features/procurement/utils';
import { canAccessDocuments, canManageDocuments } from '../../features/documents/utils';
import { JobCrewAssignmentPanel } from '../../features/jobs/JobCrewAssignmentPanel';
import { JobSchedulePanel } from '../../features/scheduling/JobSchedulePanel';
import { canAccessScheduling, canManageScheduling } from '../../features/scheduling/utils';
import { useRecordRecentView } from '../../hooks/useRecordRecentView';

export function JobDetailPage() {
  const [, params] = useRoute('/jobs/:id');
  const jobId = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [execution, setExecution] = useState<JobExecutionSummary | null>(null);
  const [financeSummary, setFinanceSummary] = useState<JobFinanceSummary | null>(null);
  const [jobCosting, setJobCosting] = useState<JobCostingSummary | null>(null);
  const [materialLines, setMaterialLines] = useState<JobMaterialLineSummary[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<JobStatus>('new');
  const [priority, setPriority] = useState<JobPriority>('normal');
  const [notes, setNotes] = useState('');
  const [customerVisibleNotes, setCustomerVisibleNotes] = useState('');
  const [accessInstructions, setAccessInstructions] = useState('');

  const canWrite = useMemo(() => (user ? canManageJobs(user.permissions) : false), [user]);

  useRecordRecentView(
    job
      ? {
          id: job.id,
          kind: 'job',
          title: job.title,
          href: `/jobs/${job.id}`,
        }
      : null,
  );

  const canViewSchedule = useMemo(
    () => (user ? canAccessScheduling(user.permissions) : false),
    [user],
  );
  const canWriteSchedule = useMemo(
    () => (user ? canManageScheduling(user.permissions) : false),
    [user],
  );
  const canViewFinance = useMemo(
    () => (user ? canAccessFinance(user.permissions) : false),
    [user],
  );
  const canWriteFinance = useMemo(
    () => (user ? canManageFinance(user.permissions) : false),
    [user],
  );
  const canViewProcurement = useMemo(
    () => (user ? canAccessProcurement(user.permissions) : false),
    [user],
  );
  const canViewCosting = useMemo(
    () => (user ? canViewJobCosting(user.permissions) : false),
    [user],
  );
  const canViewProfit = useMemo(
    () => (user ? canViewFinanceProfit(user.permissions, user.roleName) : false),
    [user],
  );
  const canViewDocuments = useMemo(
    () => (user ? canAccessDocuments(user.permissions) : false),
    [user],
  );
  const canWriteDocuments = useMemo(
    () => (user ? canManageDocuments(user.permissions) : false),
    [user],
  );

  async function loadJob() {
    if (!accessToken || !jobId) {
      return;
    }

    const data = await fetchJob(accessToken, jobId);
    setJob(data);
    setTitle(data.title);
    setDescription(data.description ?? '');
    setStatus(data.status);
    setPriority(data.priority);
    setNotes(data.notes ?? '');
    setCustomerVisibleNotes(data.customerVisibleNotes ?? '');
    setAccessInstructions(data.accessInstructions ?? '');
    try {
      setExecution(await fetchJobExecution(accessToken, jobId));
    } catch {
      setExecution(null);
    }
    try {
      setMaterialLines(await fetchJobMaterialLines(accessToken, jobId));
    } catch {
      setMaterialLines([]);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !jobId) {
        setIsLoading(false);
        return;
      }

      try {
        await loadJob();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load job');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [accessToken, jobId]);

  useEffect(() => {
    if (window.location.hash === '#edit' && canWrite && job) {
      setIsEditing(true);
    }
  }, [canWrite, job]);

  useEffect(() => {
    let cancelled = false;

    async function loadFinance() {
      if (!accessToken || !jobId || !canViewFinance) {
        setFinanceSummary(null);
        return;
      }

      try {
        const summary = await fetchJobFinanceSummary(accessToken, jobId);
        if (!cancelled) setFinanceSummary(summary);
      } catch {
        if (!cancelled) setFinanceSummary(null);
      }
    }

    void loadFinance();
    return () => {
      cancelled = true;
    };
  }, [accessToken, jobId, canViewFinance]);

  useEffect(() => {
    let cancelled = false;

    async function loadCosting() {
      if (!accessToken || !jobId || !canViewCosting) {
        setJobCosting(null);
        return;
      }

      try {
        const summary = await fetchJobCostingSummary(accessToken, jobId);
        if (!cancelled) setJobCosting(summary);
      } catch {
        if (!cancelled) setJobCosting(null);
      }
    }

    void loadCosting();
    return () => {
      cancelled = true;
    };
  }, [accessToken, jobId, canViewCosting]);

  useEffect(() => {
    let cancelled = false;

    async function loadProcurement() {
      if (!accessToken || !jobId || !canViewProcurement) {
        setPurchaseOrders([]);
        return;
      }

      try {
        const all = await fetchPurchaseOrders(accessToken);
        if (!cancelled) setPurchaseOrders(all.filter((po) => po.jobId === jobId));
      } catch {
        if (!cancelled) setPurchaseOrders([]);
      }
    }

    void loadProcurement();
    return () => {
      cancelled = true;
    };
  }, [accessToken, jobId, canViewProcurement]);

  useEffect(() => {
    if (window.location.hash === '#edit' && canWrite && job) {
      setIsEditing(true);
    }
  }, [canWrite, job]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !jobId || !canWrite) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateJob(accessToken, jobId, {
        title,
        description: description.trim() || null,
        status,
        priority,
        notes: notes.trim() || null,
        customerVisibleNotes: customerVisibleNotes.trim() || null,
        accessInstructions: accessInstructions.trim() || null,
      });

      setJob(updated);
      setIsEditing(false);
      setSuccess('Job updated.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update job');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p className="page-muted">Loading job…</p>;
  }

  if (error && !job) {
    return (
      <div className="jobs-page">
        <PageHeader title="Job" description="Job record" />
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!job) {
    return null;
  }

  const priorityLabel =
    JOB_PRIORITY_OPTIONS.find((option) => option.value === job.priority)?.label ?? job.priority;

  return (
    <div className="jobs-page">
      <PageHeader
        title={job.jobNumber ? `${job.jobNumber} · ${job.title}` : job.title}
        description={`Operational handoff for ${job.customerName}`}
        actions={
          <div className="jobs-detail__actions">
            <Link href={`/aura?jobId=${job.id}`}>
              <Button variant="secondary">Ask {AI_NAME}</Button>
            </Link>
          </div>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Job360Tabs
        job={job}
        execution={execution}
        financeSummary={financeSummary}
        materialLines={materialLines}
        purchaseOrders={purchaseOrders}
        canViewFinance={canViewFinance}
        overviewPanel={
          <>
          <Panel title="Operational snapshot">
            <dl className="jobs-detail-list">
              <div>
                <dt>Job number</dt>
                <dd>{job.jobNumber ?? '—'}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`jobs-status jobs-status--${job.status}`}>
                    {formatJobStatus(job.status)}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>
                  <span className={`jobs-priority jobs-priority--${job.priority}`}>
                    {priorityLabel}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Job type</dt>
                <dd>{job.jobType ?? '—'}</dd>
              </div>
              <div>
                <dt>Customer</dt>
                <dd>
                  <Link href={`/crm/${job.customerId}`} className="jobs-link">
                    {job.customerName}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>Site Address</dt>
                <dd>{job.address.display ?? '—'}</dd>
              </div>
              <div>
                <dt>Site contact</dt>
                <dd>
                  {job.siteContact.name ?? '—'}
                  {job.siteContact.differsFromCustomer ? ' (managing agent / site)' : ''}
                  <br />
                  {job.siteContact.mobile ?? '—'}
                </dd>
              </div>
              <div>
                <dt>Appointment</dt>
                <dd>{job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : '—'}</dd>
              </div>
              <div>
                <dt>Technician</dt>
                <dd>{job.assignedUserName ?? 'Unassigned'}</dd>
              </div>
            </dl>
          </Panel>
          <PropertyLocationPanel addressDisplay={job.address.display} className="jobs-location-panel" />
          </>
        }
        schedulePanel={
          canViewSchedule && accessToken ? (
            <JobSchedulePanel
              accessToken={accessToken}
              job={job}
              canWrite={canWriteSchedule}
              onUpdated={() => void loadJob()}
            />
          ) : (
            <Panel title="Schedule">
              <p className="page-muted">Scheduling unavailable.</p>
            </Panel>
          )
        }
        jobCardPanel={
          <Panel title="Field execution">
            {execution ? (
              <dl className="jobs-meta-list">
                <div>
                  <dt>Execution phase</dt>
                  <dd>{execution.executionPhase.replace(/_/g, ' ')}</dd>
                </div>
                <div>
                  <dt>Vehicle</dt>
                  <dd>
                    {execution.vehicle
                      ? `${execution.vehicle.vehicleName} (${execution.vehicle.licensePlate})`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Completion readiness</dt>
                  <dd>
                    {execution.completionGate.canComplete
                      ? 'Ready'
                      : `Missing: ${execution.completionGate.missing.join(', ') || 'details'}`}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="page-muted">Execution summary unavailable for this job.</p>
            )}
          </Panel>
        }
        materialsPanel={
          <Panel title="Materials" description="Parts requested, approved and used on this job.">
            {materialLines.length === 0 ? (
              <p className="page-muted">No materials recorded for this job yet.</p>
            ) : (
              <p className="page-muted">{materialLines.length} material line(s) on this job.</p>
            )}
          </Panel>
        }
        financePanel={
          canViewFinance && accessToken ? (
            <JobCompletionFinancePanel
              accessToken={accessToken}
              jobId={job.id}
              customerId={job.customerId}
              jobStatus={job.status}
              jobNumber={job.jobNumber}
              financeSummary={financeSummary}
              execution={execution}
              canManageFinance={canWriteFinance}
              onFinanceUpdated={async () => {
                if (!accessToken) return;
                const summary = await fetchJobFinanceSummary(accessToken, jobId);
                setFinanceSummary(summary);
              }}
            />
          ) : null
        }
        documentsPanel={
          <Panel title="Documents">
            {job.documents.length === 0 ? (
              <p className="page-muted">No documents linked to this job yet.</p>
            ) : (
              <ul className="jobs-doc-list">
                {job.documents.map((doc) => (
                  <li key={doc.id}>
                    <Link href={`/documents/${doc.id}`} className="jobs-link">
                      {doc.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        }
        compliancePanel={<JobCompliancePanel job={job} execution={execution} />}
        documentPackPanel={
          canViewDocuments && accessToken ? (
            <JobDocumentPackPanel
              accessToken={accessToken}
              jobId={job.id}
              jobTitle={job.title}
              canWrite={canWriteDocuments}
            />
          ) : null
        }
      />

      {canViewCosting ? (
        <JobCostingPanel jobId={job.id} costing={jobCosting} showProfit={canViewProfit} />
      ) : null}

      {canWrite && accessToken ? (
        <JobCrewAssignmentPanel
          accessToken={accessToken}
          jobId={job.id}
          assignedUserId={job.assignedUserId}
          execution={execution}
          onUpdated={() => void loadJob()}
        />
      ) : null}

      <Panel title="Edit job" id="edit">
        {isEditing && canWrite ? (
          <form className="jobs-form" onSubmit={(event) => void handleSave(event)}>
            <Input label="Title" value={title} onChange={(event) => setTitle(event.target.value)} required />
            <label className="titan-input-group">
              <span className="titan-input-label">Description</span>
              <textarea
                className="titan-input jobs-textarea"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <label className="titan-input-group">
              <span className="titan-input-label">Status</span>
              <select
                className="titan-input"
                value={status}
                onChange={(event) => setStatus(event.target.value as JobStatus)}
              >
                {JOB_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="jobs-form__actions">
              <Button type="submit" disabled={isSaving || !title.trim()}>
                {isSaving ? 'Saving…' : 'Save changes'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : canWrite ? (
          <Button type="button" onClick={() => setIsEditing(true)}>
            Edit job
          </Button>
        ) : (
          <p className="page-muted">You do not have permission to edit this job.</p>
        )}
      </Panel>
    </div>
  );
}
