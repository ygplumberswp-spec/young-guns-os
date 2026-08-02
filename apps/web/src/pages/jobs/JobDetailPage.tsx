import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { Button, Input, PageHeader, Panel } from '@titan/ui';
import type {
  InventoryItemSummary,
  InventoryLocationSummary,
  JobDetail,
  JobExecutionSummary,
  JobFinanceSummary,
  JobMaterialLineSummary,
  JobPriority,
  JobStatus,
  JobTimelineEventSummary,
  PurchaseOrderSummary,
} from '@titan/shared';
import { AI_NAME, JOB_PRIORITY_OPTIONS, JOB_STATUS_OPTIONS, formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  authorizeJobMaterialLine,
  fetchJob,
  fetchJobExecution,
  fetchJobMaterialLines,
  fetchJobTimeline,
  newJobsClientActionId,
  reopenJob,
  returnJobMaterialLine,
  updateJob,
} from '../../lib/jobs-api';
import { Job360Tabs } from '../../features/jobs/Job360Tabs';
import { fetchInventoryItems, fetchInventoryLocations } from '../../lib/inventory-api';
import { fetchJobFinanceSummary } from '../../lib/finance-api';
import { fetchPurchaseOrders } from '../../lib/procurement-api';
import { useAuth } from '../../lib/auth-context';
import { canManageJobs, formatJobStatus } from '../../features/jobs/JobList';
import { canAccessFinance } from '../../features/finance/utils';
import { canAccessProcurement, materialLineStatusPillClass } from '../../features/procurement/utils';
import { JobSchedulePanel } from '../../features/scheduling/JobSchedulePanel';
import { canAccessScheduling, canManageScheduling } from '../../features/scheduling/utils';

type StockSelection = {
  inventoryItemId: string;
  locationId: string;
};

function isStockSource(source: JobMaterialLineSummary['materialSource']) {
  return source === 'vehicle_stock' || source === 'warehouse_stock';
}

export function JobDetailPage() {
  const [, params] = useRoute('/jobs/:id');
  const jobId = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [execution, setExecution] = useState<JobExecutionSummary | null>(null);
  const [financeSummary, setFinanceSummary] = useState<JobFinanceSummary | null>(null);
  const [materialLines, setMaterialLines] = useState<JobMaterialLineSummary[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderSummary[]>([]);
  const [timeline, setTimeline] = useState<JobTimelineEventSummary[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemSummary[]>([]);
  const [inventoryLocations, setInventoryLocations] = useState<InventoryLocationSummary[]>([]);
  const [stockSelections, setStockSelections] = useState<Record<string, StockSelection>>({});
  const [materialBusyId, setMaterialBusyId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<JobStatus>('new');
  const [priority, setPriority] = useState<JobPriority>('normal');
  const [notes, setNotes] = useState('');
  const [customerVisibleNotes, setCustomerVisibleNotes] = useState('');
  const [accessInstructions, setAccessInstructions] = useState('');

  const canWrite = useMemo(() => (user ? canManageJobs(user.permissions) : false), [user]);
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
  const canViewProcurement = useMemo(
    () => (user ? canAccessProcurement(user.permissions) : false),
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
      setTimeline(await fetchJobTimeline(accessToken, jobId));
    } catch {
      setTimeline([]);
    }
    try {
      const lines = await fetchJobMaterialLines(accessToken, jobId);
      setMaterialLines(lines);
      setStockSelections((prev) => {
        const next = { ...prev };
        for (const line of lines) {
          if (next[line.id]) continue;
          next[line.id] = {
            inventoryItemId: line.inventoryItemId ?? '',
            locationId: line.locationId ?? '',
          };
        }
        return next;
      });
    } catch {
      setMaterialLines([]);
    }

    try {
      const [items, locations] = await Promise.all([
        fetchInventoryItems(accessToken),
        fetchInventoryLocations(accessToken),
      ]);
      setInventoryItems(items);
      setInventoryLocations(locations);
    } catch {
      setInventoryItems([]);
      setInventoryLocations([]);
    }
  }

  function updateStockSelection(lineId: string, patch: Partial<StockSelection>) {
    setStockSelections((prev) => ({
      ...prev,
      [lineId]: {
        inventoryItemId: prev[lineId]?.inventoryItemId ?? '',
        locationId: prev[lineId]?.locationId ?? '',
        ...patch,
      },
    }));
  }

  async function handleAuthorizeMaterial(
    line: JobMaterialLineSummary,
    decision: 'approve' | 'reject',
  ) {
    if (!accessToken || !jobId || materialBusyId) return;
    if (decision === 'reject' && !rejectReasons[line.id]?.trim()) {
      setError('A rejection reason is required');
      return;
    }

    const selection = stockSelections[line.id] ?? {
      inventoryItemId: line.inventoryItemId ?? '',
      locationId: line.locationId ?? '',
    };

    if (
      decision === 'approve' &&
      isStockSource(line.materialSource) &&
      (!selection.inventoryItemId || !selection.locationId)
    ) {
      setError('Select an inventory item and location before approving stock use');
      return;
    }

    setMaterialBusyId(line.id);
    setError(null);
    try {
      await authorizeJobMaterialLine(accessToken, jobId, line.id, {
        decision,
        reason: decision === 'reject' ? rejectReasons[line.id]?.trim() : null,
        clientActionId: newJobsClientActionId(decision),
        inventoryItemId: selection.inventoryItemId || null,
        locationId: selection.locationId || null,
      });
      setMaterialLines(await fetchJobMaterialLines(accessToken, jobId));
      setSuccess(
        decision === 'approve'
          ? 'Material approved — stock decremented when linked to inventory.'
          : 'Material rejected.',
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update material request');
    } finally {
      setMaterialBusyId(null);
    }
  }

  async function handleReturnMaterial(materialLineId: string, quantity: string) {
    if (!accessToken || !jobId || materialBusyId) return;
    const parsedQuantity = Number.parseFloat(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError('Enter a valid quantity to return');
      return;
    }
    setMaterialBusyId(materialLineId);
    setError(null);
    try {
      await returnJobMaterialLine(accessToken, jobId, materialLineId, {
        quantity: parsedQuantity,
        reason: 'Returned to stock from job',
        clientActionId: newJobsClientActionId('return'),
      });
      setMaterialLines(await fetchJobMaterialLines(accessToken, jobId));
      setSuccess('Material returned to stock.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to return material');
    } finally {
      setMaterialBusyId(null);
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

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !jobId || !canWrite) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const isCompletedJob = job?.status === 'completed';
      const updated = await updateJob(
        accessToken,
        jobId,
        isCompletedJob
          ? {
              notes: notes.trim() || null,
              customerVisibleNotes: customerVisibleNotes.trim() || null,
              accessInstructions: accessInstructions.trim() || null,
            }
          : {
              title,
              description: description.trim() || null,
              status,
              priority,
              notes: notes.trim() || null,
              customerVisibleNotes: customerVisibleNotes.trim() || null,
              accessInstructions: accessInstructions.trim() || null,
            },
      );

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
    return (
      <div className="jobs-page">
        <PageHeader title="Job" description="Job record" />
        <p className="page-muted">Loading job…</p>
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="jobs-page">
        <PageHeader title="Job" description="Job record" />
        <p className="form-error">{error}</p>
        <Link href="/jobs">
          <Button variant="secondary">Back to jobs</Button>
        </Link>
      </div>
    );
  }

  if (!job) {
    return null;
  }

  const priorityLabel =
    JOB_PRIORITY_OPTIONS.find((option) => option.value === job.priority)?.label ?? job.priority;
  const isCompletedJob = job.status === 'completed';

  return (
    <div className="jobs-page">
      <PageHeader
        title={job.jobNumber ? `${job.jobNumber} · ${job.title}` : job.title}
        description={`Job File 360 · ${job.customerName}`}
        actions={
          <div className="jobs-detail__actions">
            <Link href={`/aura?jobId=${job.id}`}>
              <Button variant="secondary">Ask {AI_NAME}</Button>
            </Link>
            <Link href="/jobs">
              <Button variant="ghost">Back to jobs</Button>
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
        timeline={timeline}
        canViewFinance={canViewFinance}
        canViewInternalNotes={canWrite}
        overviewPanel={
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
                <dt>Property / site</dt>
                <dd>
                  {job.propertyId ? (
                    <Link href={`/crm/${job.customerId}#properties`} className="jobs-link">
                      {job.address.display ?? 'Linked property'}
                    </Link>
                  ) : (
                    (job.address.display ?? '—')
                  )}
                </dd>
              </div>
              <div>
                <dt>Site contact</dt>
                <dd>
                  {job.siteContact.name ?? '—'}
                  {job.siteContact.differsFromCustomer ? ' (managing agent / site)' : ''}
                  <br />
                  {job.siteContact.mobile ?? '—'}
                  {job.siteContact.email ? (
                    <>
                      <br />
                      {job.siteContact.email}
                      {job.siteContact.emailIsPlaceholder ? ' · not customer-verified' : ''}
                    </>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt>Access instructions</dt>
                <dd>{job.accessInstructions ?? '—'}</dd>
              </div>
              <div>
                <dt>Schedule</dt>
                <dd>
                  {job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : '—'}
                  {job.scheduledEndAt
                    ? ` → ${new Date(job.scheduledEndAt).toLocaleString()}`
                    : ''}
                </dd>
              </div>
              <div>
                <dt>Assigned technician</dt>
                <dd>{job.assignedUserName ?? 'Unassigned'}</dd>
              </div>
              <div>
                <dt>Crew</dt>
                <dd>
                  {execution?.crew?.length
                    ? execution.crew
                        .map(
                          (m) =>
                            `${m.userName} (${m.crewRole.replace(/_/g, ' ')}${
                              m.isPrimary ? ', lead' : ''
                            })`,
                        )
                        .join(', ')
                    : 'No crew assigned'}
                </dd>
              </div>
              <div>
                <dt>Vehicle</dt>
                <dd>
                  {execution?.vehicle
                    ? `${execution.vehicle.vehicleName} (${execution.vehicle.licensePlate})`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{new Date(job.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>
                  {execution?.completionSnapshot
                    ? new Date(execution.completionSnapshot.createdAt).toLocaleString()
                    : isCompletedJob
                      ? 'Completed (no snapshot on record)'
                      : '—'}
                </dd>
              </div>
            </dl>
          </Panel>
        }
        schedulePanel={
          canViewSchedule && accessToken ? (
            <JobSchedulePanel
              accessToken={accessToken}
              job={job}
              canWrite={canWriteSchedule && !isCompletedJob}
              onUpdated={() => void loadJob()}
            />
          ) : (
            <Panel title="Schedule">
              <p className="page-muted">Scheduling unavailable for this role.</p>
            </Panel>
          )
        }
        jobCardPanel={
          <>
            <Panel title="Job details">
              {isEditing && canWrite ? (
                <form className="jobs-form" onSubmit={(event) => void handleSave(event)}>
                  {!isCompletedJob ? (
                    <>
                      <Input
                        label="Title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        required
                      />

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

                      <label className="titan-input-group">
                        <span className="titan-input-label">Priority</span>
                        <select
                          className="titan-input"
                          value={priority}
                          onChange={(event) => setPriority(event.target.value as JobPriority)}
                        >
                          {JOB_PRIORITY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  ) : (
                    <p className="page-muted">
                      Structural fields are locked on completed jobs. Only notes and access
                      instructions may be updated (audited as post-completion).
                    </p>
                  )}

                  <label className="titan-input-group">
                    <span className="titan-input-label">Access instructions</span>
                    <textarea
                      className="titan-input jobs-textarea"
                      rows={3}
                      value={accessInstructions}
                      onChange={(event) => setAccessInstructions(event.target.value)}
                    />
                  </label>

                  <label className="titan-input-group">
                    <span className="titan-input-label">Internal notes</span>
                    <textarea
                      className="titan-input jobs-textarea"
                      rows={3}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </label>

                  <label className="titan-input-group">
                    <span className="titan-input-label">Customer-visible notes</span>
                    <textarea
                      className="titan-input jobs-textarea"
                      rows={2}
                      value={customerVisibleNotes}
                      onChange={(event) => setCustomerVisibleNotes(event.target.value)}
                    />
                  </label>

                  <div className="jobs-form__actions">
                    <Button type="submit" disabled={isSaving || (!isCompletedJob && !title.trim())}>
                      {isSaving
                        ? 'Saving…'
                        : isCompletedJob
                          ? 'Save post-completion update'
                          : 'Save changes'}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <dl className="jobs-detail-list">
                  <div>
                    <dt>Description</dt>
                    <dd>{job.description ?? '—'}</dd>
                  </div>
                  {canWrite ? (
                    <div>
                      <dt>Internal notes</dt>
                      <dd>{job.notes ?? '—'}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Customer-visible notes</dt>
                    <dd>{job.customerVisibleNotes ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{new Date(job.createdAt).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{new Date(job.updatedAt).toLocaleString()}</dd>
                  </div>
                </dl>
              )}

              {canWrite && !isEditing ? (
                <div className="jobs-form__actions">
                  <Button type="button" onClick={() => setIsEditing(true)}>
                    {isCompletedJob ? 'Edit notes (post-completion)' : 'Edit job'}
                  </Button>
                </div>
              ) : null}
            </Panel>

            <Panel title="Field execution">
              {execution ? (
                <>
                  <dl className="jobs-meta-list">
                    <div>
                      <dt>Execution phase</dt>
                      <dd>{execution.executionPhase.replace(/_/g, ' ')}</dd>
                    </div>
                    <div>
                      <dt>Crew</dt>
                      <dd>
                        {execution.crew.length === 0
                          ? 'No crew assigned'
                          : execution.crew
                              .map(
                                (m) =>
                                  `${m.userName} (${m.crewRole.replace(/_/g, ' ')}${
                                    m.isPrimary ? ', lead' : ''
                                  })`,
                              )
                              .join(', ')}
                      </dd>
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
                      <dt>Pending variations</dt>
                      <dd>{execution.pendingVariations.length}</dd>
                    </div>
                    <div>
                      <dt>Completion readiness</dt>
                      <dd>
                        {execution.completionGate.canComplete
                          ? 'Ready'
                          : `Missing: ${execution.completionGate.missing.join(', ') || 'details'}`}
                      </dd>
                    </div>
                    <div>
                      <dt>Labour</dt>
                      <dd>
                        {execution.labour.entryCount} entries · {execution.labour.totalMinutes} min
                      </dd>
                    </div>
                  </dl>
                  {execution.pendingVariations.length > 0 ? (
                    <ul className="portal-list">
                      {execution.pendingVariations.map((v) => (
                        <li key={v.id}>
                          <strong>{v.title}</strong>
                          <span>{v.status}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {execution.evidence?.length ? (
                    <ul className="portal-list" style={{ marginTop: '0.75rem' }}>
                      {execution.evidence.map((doc) => (
                        <li key={doc.id}>
                          <strong>{doc.title}</strong>
                          <span>
                            {doc.documentationType}
                            {doc.evidencePhase ? ` · ${doc.evidencePhase}` : ''}
                            {doc.hasBinary ? ' · binary stored' : ' · metadata only'}
                            {doc.downloadPath && accessToken ? (
                              <>
                                {' · '}
                                <a
                                  href={doc.downloadPath}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    void (async () => {
                                      const res = await fetch(doc.downloadPath!, {
                                        headers: { Authorization: `Bearer ${accessToken}` },
                                      });
                                      if (!res.ok) {
                                        setError('Unable to open evidence');
                                        return;
                                      }
                                      const blob = await res.blob();
                                      const url = URL.createObjectURL(blob);
                                      window.open(url, '_blank', 'noopener,noreferrer');
                                    })();
                                  }}
                                >
                                  View
                                </a>
                              </>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="page-muted" style={{ marginTop: '0.75rem' }}>
                      No field evidence uploaded yet.
                    </p>
                  )}
                  {canWrite && isCompletedJob ? (
                    <div className="jobs-form__actions" style={{ marginTop: '0.75rem' }}>
                      <Input
                        label="Reopen reason"
                        value={reopenReason}
                        onChange={(e) => setReopenReason(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          if (!accessToken || !reopenReason.trim()) {
                            setError('Reopen requires a reason');
                            return;
                          }
                          void (async () => {
                            try {
                              await reopenJob(accessToken, job.id, reopenReason.trim());
                              setReopenReason('');
                              setSuccess('Job reopened with audit reason');
                              await loadJob();
                            } catch (err) {
                              setError(
                                err instanceof ApiClientError
                                  ? err.message
                                  : 'Unable to reopen job',
                              );
                            }
                          })();
                        }}
                      >
                        Reopen job
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="page-muted">Execution summary unavailable for this job.</p>
              )}
            </Panel>
          </>
        }
        materialsPanel={
          <>
            <Panel title="Materials" description="Parts requested, approved and used on this job.">
              {materialLines.length === 0 ? (
                <p className="page-muted">No materials recorded for this job yet.</p>
              ) : (
                <div className="inventory-table-wrap">
                  <table className="inventory-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Quantity</th>
                        <th>Source</th>
                        <th>Stock link</th>
                        {canViewFinance ? <th>Cost</th> : null}
                        <th>Status</th>
                        {canWrite ? <th>Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {materialLines.map((line) => {
                        const selection = stockSelections[line.id] ?? {
                          inventoryItemId: line.inventoryItemId ?? '',
                          locationId: line.locationId ?? '',
                        };
                        return (
                          <tr key={line.id}>
                            <td>
                              {line.description}
                              {line.inventoryItemName ? (
                                <span className="page-muted"> ({line.inventoryItemName})</span>
                              ) : null}
                            </td>
                            <td>
                              {line.quantity} {line.unit}
                              {line.fulfilledQuantity
                                ? ` · ${line.fulfilledQuantity} fulfilled`
                                : ''}
                            </td>
                            <td>{line.materialSource.replace(/_/g, ' ')}</td>
                            <td>
                              {line.status === 'requested' &&
                              isStockSource(line.materialSource) &&
                              canWrite ? (
                                <div className="jobs-form__actions">
                                  <label className="titan-input-group">
                                    <span className="titan-input-label">Item</span>
                                    <select
                                      className="titan-input"
                                      value={selection.inventoryItemId}
                                      onChange={(e) =>
                                        updateStockSelection(line.id, {
                                          inventoryItemId: e.target.value,
                                        })
                                      }
                                    >
                                      <option value="">Select item</option>
                                      {inventoryItems.map((item) => (
                                        <option key={item.id} value={item.id}>
                                          {item.sku} — {item.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="titan-input-group">
                                    <span className="titan-input-label">Location</span>
                                    <select
                                      className="titan-input"
                                      value={selection.locationId}
                                      onChange={(e) =>
                                        updateStockSelection(line.id, {
                                          locationId: e.target.value,
                                        })
                                      }
                                    >
                                      <option value="">Select location</option>
                                      {inventoryLocations.map((location) => (
                                        <option key={location.id} value={location.id}>
                                          {location.name} ({location.locationType})
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                              ) : line.locationName || line.inventoryItemName ? (
                                [line.inventoryItemName, line.locationName]
                                  .filter(Boolean)
                                  .join(' @ ')
                              ) : (
                                '—'
                              )}
                            </td>
                            {canViewFinance ? (
                              <td>
                                {line.lineTotalCents != null
                                  ? formatMoney(line.lineTotalCents)
                                  : '—'}
                              </td>
                            ) : null}
                            <td>
                              <span className={materialLineStatusPillClass(line.status)}>
                                {line.status.replace(/_/g, ' ')}
                              </span>
                            </td>
                            {canWrite ? (
                              <td>
                                {line.status === 'requested' ? (
                                  <div className="jobs-form__actions">
                                    <Button
                                      size="sm"
                                      disabled={materialBusyId === line.id}
                                      onClick={() => void handleAuthorizeMaterial(line, 'approve')}
                                    >
                                      Approve
                                    </Button>
                                    <Input
                                      label="Reject reason"
                                      value={rejectReasons[line.id] ?? ''}
                                      onChange={(e) =>
                                        setRejectReasons((prev) => ({
                                          ...prev,
                                          [line.id]: e.target.value,
                                        }))
                                      }
                                    />
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      disabled={materialBusyId === line.id}
                                      onClick={() => void handleAuthorizeMaterial(line, 'reject')}
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                ) : line.status === 'used' ||
                                  line.status === 'partially_fulfilled' ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={materialBusyId === line.id}
                                    onClick={() =>
                                      void handleReturnMaterial(
                                        line.id,
                                        line.fulfilledQuantity ?? line.quantity,
                                      )
                                    }
                                  >
                                    Return to stock
                                  </Button>
                                ) : (
                                  '—'
                                )}
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            {canViewProcurement && purchaseOrders.length > 0 ? (
              <Panel title="Purchase orders" description="Supplier orders linked to this job.">
                <ul className="portal-list">
                  {purchaseOrders.map((po) => (
                    <li key={po.id}>
                      <Link
                        href={`/procurement/purchase-orders/${po.id}`}
                        className="jobs-link"
                      >
                        {po.referenceNumber}
                      </Link>
                      <span>
                        {po.supplierName}
                        {canViewFinance ? ` · ${formatMoney(po.totalCostCents)}` : ''} ·{' '}
                        {po.status.replace(/_/g, ' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </>
        }
        financePanel={
          <Panel title="Finance">
            {financeSummary && financeSummary.chips.length > 0 ? (
              <div className="finance-chip-row">
                {financeSummary.chips.map((chip, index) =>
                  chip.href ? (
                    <Link key={`${chip.kind}-${index}`} href={chip.href} className="finance-chip">
                      <span>{chip.label}</span>
                      <strong>{chip.value}</strong>
                    </Link>
                  ) : (
                    <span key={`${chip.kind}-${index}`} className="finance-chip">
                      <span>{chip.label}</span>
                      <strong>{chip.value}</strong>
                    </span>
                  ),
                )}
              </div>
            ) : (
              <p className="page-muted">No quotes, invoices, or payments linked to this job yet.</p>
            )}
          </Panel>
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
                    </Link>{' '}
                    <span className="page-muted">({doc.fileName})</span>
                  </li>
                ))}
              </ul>
            )}
            {canWrite ? (
              <div className="jobs-form__actions">
                <Link href={`/documents/new?jobId=${job.id}`}>
                  <Button variant="secondary">Add document</Button>
                </Link>
              </div>
            ) : null}
          </Panel>
        }
        compliancePanel={
          <Panel title="COC & compliance">
            <p className="page-muted">
              COC-related and warranty records appear when captured as job documents or field
              evidence. Use Documents and Photos tabs for before/after packages.
            </p>
            {job.documents.filter((d) =>
              `${d.title} ${d.fileName}`.toLowerCase().match(/coc|warranty|compliance/),
            ).length > 0 ? (
              <ul className="jobs-doc-list">
                {job.documents
                  .filter((d) =>
                    `${d.title} ${d.fileName}`.toLowerCase().match(/coc|warranty|compliance/),
                  )
                  .map((doc) => (
                    <li key={doc.id}>
                      <Link href={`/documents/${doc.id}`} className="jobs-link">
                        {doc.title}
                      </Link>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="page-muted">No COC/warranty documents linked yet.</p>
            )}
          </Panel>
        }
      />
    </div>
  );
}
