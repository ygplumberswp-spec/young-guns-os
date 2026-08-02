import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'wouter';
import { Button, EmptyState, Input, PageHeader, Panel } from '@titan/ui';
import type {
  JobMaterialSource,
  JobWorkflowAction,
  MobileJobExecutionWorkspace,
  MobileWorkforceInventoryCentre,
} from '@titan/shared';
import { requiredChecklistForJobType } from '@titan/shared';
import {
  MobileApiClientError,
  completeMobileJobGated,
  createMobileJobVariation,
  createMobileTimeEntry,
  fetchMobileInventory,
  fetchMobileJobWorkspace,
  newClientActionId,
  recordMobileMaterialLine,
  transitionMobileJob,
  uploadMobileJobEvidence,
} from '../../lib/mobile-api-client';
import {
  cacheMobileWorkspaceSnapshot,
  enqueueOfflineAction,
  flushOfflineQueue,
  hasUnsyncedEvidence,
  listOfflineActions,
  newOfflineClientActionId,
  readCachedMobileWorkspace,
  type OfflineQueuedAction,
} from '../../lib/mobile-offline-queue';
import { SignaturePad } from '../../features/jobs/SignaturePad';
import { useAuth } from '../../lib/auth-context';

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

const ACTION_LABELS: Record<JobWorkflowAction, string> = {
  accept: 'Accept job',
  en_route: 'Start travel',
  arrive: 'Arrive on site',
  start_work: 'Start work',
  pause: 'Pause',
  resume: 'Resume',
  await_customer: 'Awaiting customer',
  await_parts: 'Awaiting parts',
  await_approval: 'Awaiting approval',
  ready_to_complete: 'Ready to complete',
  complete: 'Complete',
  reopen: 'Reopen',
};

export function MobileJobDetailPage() {
  const { accessToken } = useAuth();
  // Nested under `<Route path="/mobile" nest>` — match nest-relative `/jobs/:jobId` via params.
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const [workspace, setWorkspace] = useState<MobileJobExecutionWorkspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pauseReason, setPauseReason] = useState('');
  const [note, setNote] = useState('');
  const [materialDesc, setMaterialDesc] = useState('');
  const [materialQty, setMaterialQty] = useState('1');
  const [materialItemId, setMaterialItemId] = useState('');
  const [materialLocationId, setMaterialLocationId] = useState('');
  const [materialSource, setMaterialSource] = useState<JobMaterialSource>('vehicle_stock');
  const [inventoryCentre, setInventoryCentre] = useState<MobileWorkforceInventoryCentre | null>(null);
  const [variationTitle, setVariationTitle] = useState('');
  const [variationCondition, setVariationCondition] = useState('');
  const [variationExplanation, setVariationExplanation] = useState('');
  const [completeForm, setCompleteForm] = useState({
    workPerformedSummary: '',
    siteCondition: '',
    customerRepName: '',
    signerRole: 'customer_representative',
    signatureUnavailableReason: '',
    signatureAck: false,
    cocRequired: 'not_required' as 'required' | 'not_required' | 'pending_classification',
    technicianDeclaration: false,
    outstandingDefects: '',
  });
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureDocId, setSignatureDocId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [offlineActions, setOfflineActions] = useState<OfflineQueuedAction[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingPhaseRef = useRef<'before' | 'during' | 'after' | 'document'>('before');

  const refreshOffline = useCallback(async () => {
    if (!jobId) return;
    setOfflineActions(await listOfflineActions(jobId));
  }, [jobId]);

  const reload = useCallback(async () => {
    if (!accessToken || !jobId) return;
    try {
      const [data, inventory] = await Promise.all([
        fetchMobileJobWorkspace(accessToken, jobId),
        fetchMobileInventory(accessToken).catch(() => null),
      ]);
      setWorkspace(data);
      if (inventory) setInventoryCentre(inventory);
      await cacheMobileWorkspaceSnapshot(jobId, data as unknown as Record<string, unknown>);
      const keys = requiredChecklistForJobType(data.jobType);
      setChecklist((prev) => {
        const next = { ...prev };
        for (const key of keys) {
          if (next[key] === undefined) next[key] = Boolean(data.checklist[key]);
        }
        return next;
      });
      const existingSig = data.documentation.find(
        (d) => d.documentationType === 'customer_signature' && d.hasBinary,
      );
      if (existingSig) setSignatureDocId(existingSig.id);
    } catch (err) {
      if (!navigator.onLine) {
        const cached = await readCachedMobileWorkspace(jobId);
        if (cached?.workspace) {
          setWorkspace(cached.workspace as unknown as MobileJobExecutionWorkspace);
          setMessage('Showing cached job workspace (offline)');
          await refreshOffline();
          return;
        }
      }
      throw err;
    }
    await refreshOffline();
  }, [accessToken, jobId, refreshOffline]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !jobId) {
        setIsLoading(false);
        return;
      }
      try {
        await reload();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof MobileApiClientError ? err.message : 'Unable to load job workspace',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, jobId, reload]);

  useEffect(() => {
    function onOnline() {
      setIsOnline(true);
      if (!accessToken) return;
      void flushOfflineQueue(accessToken).then(async (result) => {
        await refreshOffline();
        if (result.synced > 0 || result.duplicate > 0) {
          setMessage(
            `Synced ${result.synced} action(s)${result.failed ? `, ${result.failed} failed` : ''}`,
          );
          await reload();
        }
      });
    }
    function onOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [accessToken, reload, refreshOffline]);

  async function runAction(action: JobWorkflowAction) {
    if (!accessToken || !jobId || busy) return;
    if (action === 'pause' && !pauseReason.trim()) {
      setError('Pause requires a reason');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!navigator.onLine) {
        await enqueueOfflineAction({
          clientActionId: newOfflineClientActionId(action),
          actionType: 'transition',
          jobId,
          payload: {
            action,
            reason: action === 'pause' ? pauseReason.trim() : undefined,
          },
        });
        await refreshOffline();
        setMessage(`${ACTION_LABELS[action]} queued offline`);
        setPauseReason('');
        return;
      }
      await transitionMobileJob(
        accessToken,
        jobId,
        action,
        action === 'pause' ? pauseReason.trim() : undefined,
      );
      await reload();
      setMessage(`${ACTION_LABELS[action]} recorded`);
      setPauseReason('');
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleStartLabour() {
    if (!accessToken || !jobId || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!navigator.onLine) {
        await enqueueOfflineAction({
          clientActionId: newOfflineClientActionId('time'),
          actionType: 'time_entry',
          jobId,
          payload: { entryType: 'job_time', notes: 'On-site labour' },
        });
        await refreshOffline();
        setMessage('Labour entry queued offline');
        return;
      }
      await createMobileTimeEntry(accessToken, { entryType: 'job_time', jobId, notes: 'On-site labour' });
      await reload();
      setMessage('Labour timer started');
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Unable to start labour');
    } finally {
      setBusy(false);
    }
  }

  function pickEvidence(phase: 'before' | 'during' | 'after' | 'document') {
    pendingPhaseRef.current = phase;
    fileInputRef.current?.click();
  }

  async function handleEvidenceSelected(file: File | null) {
    if (!accessToken || !jobId || !file || busy) return;
    const phase = pendingPhaseRef.current;
    const isDocument = phase === 'document';
    setBusy(true);
    setError(null);
    setUploadProgress(`Reading ${file.name}…`);
    try {
      const dataBase64 = await fileToBase64(file);
      const clientActionId = newClientActionId(`evidence-${phase}`);
      const payload = {
        documentationType: isDocument ? ('document' as const) : ('photo' as const),
        title: isDocument ? file.name : `${phase} photo`,
        mimeType: file.type || (isDocument ? 'application/pdf' : 'image/jpeg'),
        dataBase64,
        fileName: file.name,
        evidencePhase: isDocument ? ('document' as const) : phase,
        metadata: {
          phase,
          capturedAt: new Date().toISOString(),
          originalName: file.name,
          sizeBytes: file.size,
        },
        clientActionId,
      };

      if (!navigator.onLine) {
        await enqueueOfflineAction({
          clientActionId,
          actionType: 'evidence_upload',
          jobId,
          payload,
        });
        await refreshOffline();
        setUploadProgress(null);
        setMessage(`${phase} evidence queued offline — will sync when online`);
        return;
      }

      setUploadProgress(`Uploading ${file.name}…`);
      await uploadMobileJobEvidence(accessToken, jobId, payload);
      await reload();
      setUploadProgress(null);
      setMessage(`${phase} evidence uploaded`);
    } catch (err) {
      setUploadProgress(null);
      setError(err instanceof MobileApiClientError ? err.message : 'Upload failed — evidence retained for retry');
      // Keep failure visible; enqueue for retry so evidence is never silently discarded.
      try {
        const dataBase64 = await fileToBase64(file);
        const clientActionId = newClientActionId(`evidence-retry-${phase}`);
        await enqueueOfflineAction({
          clientActionId,
          actionType: 'evidence_upload',
          jobId,
          payload: {
            documentationType: phase === 'document' ? 'document' : 'photo',
            title: phase === 'document' ? file.name : `${phase} photo`,
            mimeType: file.type || 'image/jpeg',
            dataBase64,
            fileName: file.name,
            evidencePhase: phase === 'document' ? 'document' : phase,
            metadata: { phase, capturedAt: new Date().toISOString(), failedUpload: true },
            clientActionId,
          },
        });
        await refreshOffline();
      } catch {
        // already surfaced primary error
      }
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSaveSignature() {
    if (!accessToken || !jobId || busy) return;
    if (!signatureDataUrl) {
      setError('Draw a signature first, or provide an unavailable reason at completion');
      return;
    }
    if (!completeForm.customerRepName.trim() || !completeForm.signatureAck) {
      setError('Signer name and acknowledgement are required before saving the signature');
      return;
    }
    setBusy(true);
    setError(null);
    setUploadProgress('Saving signature…');
    try {
      const clientActionId = newClientActionId('signature');
      const payload = {
        documentationType: 'customer_signature' as const,
        title: `Customer signature — ${completeForm.customerRepName.trim()}`,
        mimeType: 'image/png',
        dataBase64: dataUrlToBase64(signatureDataUrl),
        fileName: `signature-${Date.now()}.png`,
        evidencePhase: 'signature' as const,
        signerName: completeForm.customerRepName.trim(),
        signerRole: completeForm.signerRole.trim() || 'customer_representative',
        acknowledgement: true,
        metadata: {
          signedAt: new Date().toISOString(),
          signerName: completeForm.customerRepName.trim(),
          signerRole: completeForm.signerRole.trim() || 'customer_representative',
        },
        clientActionId,
      };
      if (!navigator.onLine) {
        await enqueueOfflineAction({
          clientActionId,
          actionType: 'evidence_upload',
          jobId,
          payload,
        });
        await refreshOffline();
        setUploadProgress(null);
        setMessage('Signature queued offline — completion blocked until synced');
        return;
      }
      const doc = await uploadMobileJobEvidence(accessToken, jobId, payload);
      setSignatureDocId(doc.id);
      await reload();
      setUploadProgress(null);
      setMessage('Signature stored as completion evidence');
    } catch (err) {
      setUploadProgress(null);
      setError(err instanceof MobileApiClientError ? err.message : 'Unable to save signature');
    } finally {
      setBusy(false);
    }
  }

  async function handleMaterial(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !jobId || busy) return;

    const needsStock = materialSource === 'vehicle_stock' || materialSource === 'warehouse_stock';
    if (needsStock && (!materialItemId || !materialLocationId)) {
      setError('Select an inventory item and stock location for vehicle/warehouse use');
      return;
    }

    const payload = {
      description: materialDesc.trim(),
      quantity: Number(materialQty) || 1,
      unit: 'ea',
      materialSource,
      inventoryItemId: materialItemId || null,
      locationId: materialLocationId || null,
      requestOnly: true,
    };

    setBusy(true);
    setError(null);
    try {
      if (!navigator.onLine) {
        await enqueueOfflineAction({
          clientActionId: newOfflineClientActionId('material'),
          actionType: 'material_line',
          jobId,
          payload,
        });
        setMaterialDesc('');
        setMaterialItemId('');
        setMaterialLocationId('');
        await refreshOffline();
        setMessage('Material requested offline — pending sync and office approval');
        return;
      }
      await recordMobileMaterialLine(accessToken, jobId, payload);
      setMaterialDesc('');
      setMaterialItemId('');
      setMaterialLocationId('');
      await reload();
      setMessage('Material requested — stock decrements when office approves');
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Unable to record material');
    } finally {
      setBusy(false);
    }
  }

  async function handleVariation(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !jobId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createMobileJobVariation(accessToken, jobId, {
        title: variationTitle.trim(),
        siteCondition: variationCondition.trim(),
        explanation: variationExplanation.trim(),
      });
      setVariationTitle('');
      setVariationCondition('');
      setVariationExplanation('');
      await reload();
      setMessage('Variation submitted for approval');
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Unable to create variation');
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !jobId || busy || !workspace) return;
    if (hasUnsyncedEvidence(offlineActions, jobId)) {
      setError(
        'Required evidence is still Offline/Pending/Failed. Sync must succeed before completion can appear successful.',
      );
      return;
    }
    if (!signatureDocId && !completeForm.signatureUnavailableReason.trim()) {
      setError('Capture a signature or provide a mandatory unavailable reason');
      return;
    }
    if (!navigator.onLine) {
      setError('Final completion requires a live connection after required evidence is synced');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await completeMobileJobGated(accessToken, jobId, {
        workPerformedSummary: completeForm.workPerformedSummary.trim(),
        checklist,
        siteCondition: completeForm.siteCondition.trim(),
        customerRepName: completeForm.customerRepName.trim(),
        signatureDocId: signatureDocId,
        signatureUnavailableReason: completeForm.signatureUnavailableReason.trim() || null,
        cocRequired: completeForm.cocRequired,
        technicianDeclaration: completeForm.technicianDeclaration,
        outstandingDefects: completeForm.outstandingDefects.trim() || null,
        followUpRequired: Boolean(completeForm.outstandingDefects.trim()),
        customerVisibleUpdate: note.trim() || null,
      });
      await reload();
      setMessage('Job completed with immutable snapshot');
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Completion blocked');
    } finally {
      setBusy(false);
    }
  }

  async function handleManualSync() {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const result = await flushOfflineQueue(accessToken);
      await refreshOffline();
      await reload();
      setMessage(
        `Manual sync: ${result.synced} synced, ${result.duplicate} duplicate, ${result.failed} failed`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Manual sync failed');
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading job workspace…</p>;
  if (error && !workspace) return <p className="form-error">{error}</p>;
  if (!workspace) {
    return <EmptyState title="Job not found" description="This job is not assigned to you." />;
  }

  const primaryActions = workspace.availableActions.filter((a) =>
    ['accept', 'en_route', 'arrive', 'start_work', 'resume', 'ready_to_complete'].includes(a),
  );
  const waitActions = workspace.availableActions.filter((a) =>
    ['pause', 'await_customer', 'await_parts', 'await_approval'].includes(a),
  );
  const labourTotal = workspace.laborTimeEntries.reduce(
    (sum, entry) => sum + (entry.durationMinutes ?? 0),
    0,
  );

  return (
    <div className="portal-page mobile-job-exec">
      <PageHeader
        title={workspace.jobNumber ? `${workspace.jobNumber}` : workspace.title}
        description={`${workspace.jobType ?? 'Job'} · ${workspace.priority} · ${workspace.executionPhase.replace(/_/g, ' ')}`}
      />

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="page-success">{message}</p> : null}

      <Panel title="Workflow">
        <div className="mobile-action-grid">
          {primaryActions.map((action) => (
            <button
              key={action}
              type="button"
              className="mobile-action-btn mobile-action-btn--primary"
              disabled={busy}
              onClick={() => void runAction(action)}
            >
              {ACTION_LABELS[action]}
            </button>
          ))}
          {waitActions.map((action) => (
            <button
              key={action}
              type="button"
              className="mobile-action-btn"
              disabled={busy}
              onClick={() => void runAction(action)}
            >
              {ACTION_LABELS[action]}
            </button>
          ))}
        </div>
        {workspace.availableActions.includes('pause') ? (
          <label className="titan-input-group" style={{ marginTop: '0.75rem' }}>
            <span className="titan-input-label">Pause reason</span>
            <input
              className="titan-input"
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              placeholder="Why is work paused?"
            />
          </label>
        ) : null}
      </Panel>

      <Panel title="Assignment">
        <dl className="jobs-meta-list">
          <div>
            <dt>Customer</dt>
            <dd>{workspace.customer.name}</dd>
          </div>
          <div>
            <dt>Site contact</dt>
            <dd>
              {workspace.siteContact.name ?? '—'}
              <br />
              {workspace.siteContact.mobile ?? '—'}
            </dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>{workspace.address.display ?? '—'}</dd>
          </div>
          <div>
            <dt>Access</dt>
            <dd>{workspace.accessInstructions ?? '—'}</dd>
          </div>
          <div>
            <dt>Appointment</dt>
            <dd>
              {workspace.scheduledAt ? new Date(workspace.scheduledAt).toLocaleString() : '—'}
              {workspace.scheduledEndAt
                ? ` → ${new Date(workspace.scheduledEndAt).toLocaleTimeString()}`
                : ''}
            </dd>
          </div>
        </dl>
        {workspace.navigationUrl ? (
          <a className="mobile-action-btn mobile-action-btn--primary" href={workspace.navigationUrl} target="_blank" rel="noreferrer">
            Navigate
          </a>
        ) : null}
      </Panel>

      <Panel title="Work description">
        <p>{workspace.workInstructions ?? '—'}</p>
        {workspace.customerVisibleNotes ? (
          <p className="page-muted">Customer-visible: {workspace.customerVisibleNotes}</p>
        ) : null}
        {workspace.internalNotes ? <p className="page-muted">Internal: {workspace.internalNotes}</p> : null}
      </Panel>

      <Panel title="Crew & vehicle">
        <ul className="portal-list">
          {workspace.crew.map((member) => (
            <li key={member.id}>
              <strong>{member.userName}</strong>
              <span>
                {member.crewRole.replace(/_/g, ' ')}
                {member.isPrimary ? ' · lead' : ''}
              </span>
            </li>
          ))}
        </ul>
        {workspace.vehicle ? (
          <p>
            Vehicle: {workspace.vehicle.vehicleName} ({workspace.vehicle.licensePlate})
          </p>
        ) : (
          <p className="page-muted">No vehicle linked for this assignment.</p>
        )}
        <p className="page-muted">
          Vehicle GPS is never treated as proof that every crew member was present.
        </p>
      </Panel>

      {workspace.exceptions.length > 0 ? (
        <Panel title="Exceptions">
          <ul className="portal-list">
            {workspace.exceptions.map((item) => (
              <li key={item}>{item.replace(/_/g, ' ')}</li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel
        title="Evidence"
        description={
          isOnline
            ? 'Camera, gallery or files — binary upload with progress and retry'
            : 'Offline: evidence is queued locally until sync succeeds'
        }
      >
        <p className="page-muted" style={{ marginBottom: '0.5rem' }}>
          Sync: {isOnline ? 'Online' : 'Offline'}
          {offlineActions.length > 0
            ? ` · ${offlineActions.filter((a) => a.status !== 'synced').length} pending/failed`
            : ''}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => void handleEvidenceSelected(e.target.files?.[0] ?? null)}
        />
        <div className="mobile-action-grid">
          <button type="button" className="mobile-action-btn" disabled={busy} onClick={() => pickEvidence('before')}>
            Before photo
          </button>
          <button type="button" className="mobile-action-btn" disabled={busy} onClick={() => pickEvidence('during')}>
            During photo
          </button>
          <button type="button" className="mobile-action-btn" disabled={busy} onClick={() => pickEvidence('after')}>
            After photo
          </button>
          <button type="button" className="mobile-action-btn" disabled={busy} onClick={() => pickEvidence('document')}>
            Document
          </button>
          <button
            type="button"
            className="mobile-action-btn"
            disabled={busy || offlineActions.every((a) => a.status === 'synced')}
            onClick={() => void handleManualSync()}
          >
            Retry sync
          </button>
        </div>
        {uploadProgress ? <p className="page-muted">{uploadProgress}</p> : null}
        <ul className="portal-list" style={{ marginTop: '0.75rem' }}>
          {workspace.documentation.map((doc) => (
            <li key={doc.id}>
              <strong>{doc.title}</strong>
              <span>
                {doc.documentationType}
                {doc.evidencePhase ? ` · ${doc.evidencePhase}` : ''}
                {doc.hasBinary ? ' · stored' : ' · metadata only'}
                {doc.sizeBytes != null ? ` · ${Math.round(doc.sizeBytes / 1024)} KB` : ''}
              </span>
            </li>
          ))}
        </ul>
        {offlineActions.filter((a) => a.status !== 'synced').length > 0 ? (
          <ul className="portal-list">
            {offlineActions
              .filter((a) => a.status !== 'synced')
              .map((action) => (
                <li key={action.id}>
                  <strong>{action.actionType}</strong>
                  <span>
                    {action.status}
                    {action.errorMessage ? ` · ${action.errorMessage}` : ''}
                  </span>
                </li>
              ))}
          </ul>
        ) : null}
      </Panel>

      <Panel title="Labour" description={`Crew total ${labourTotal} min`}>
        <Button type="button" disabled={busy} onClick={() => void handleStartLabour()}>
          Start my labour
        </Button>
        <ul className="portal-list" style={{ marginTop: '0.75rem' }}>
          {workspace.laborTimeEntries.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.userName ?? 'Crew'}</strong>
              <span>
                {entry.entryType}
                {entry.durationMinutes != null ? ` · ${entry.durationMinutes} min` : ' · open'}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Materials">
        <form className="jobs-form" onSubmit={(e) => void handleMaterial(e)}>
          <Input
            label="Description"
            value={materialDesc}
            onChange={(e) => setMaterialDesc(e.target.value)}
            required
          />
          <Input
            label="Quantity"
            value={materialQty}
            onChange={(e) => setMaterialQty(e.target.value)}
            required
          />
          <label className="titan-input-group">
            <span className="titan-input-label">Source</span>
            <select
              className="titan-input"
              value={materialSource}
              onChange={(e) => setMaterialSource(e.target.value as JobMaterialSource)}
            >
              <option value="vehicle_stock">Vehicle stock</option>
              <option value="warehouse_stock">Warehouse stock</option>
              <option value="supplier_purchase">Supplier purchase</option>
              <option value="customer_supplied">Customer supplied</option>
            </select>
          </label>
          {materialSource === 'vehicle_stock' || materialSource === 'warehouse_stock' ? (
            <>
              <label className="titan-input-group">
                <span className="titan-input-label">Inventory item</span>
                <select
                  className="titan-input"
                  value={materialItemId}
                  onChange={(e) => setMaterialItemId(e.target.value)}
                  required
                >
                  <option value="">Select item</option>
                  {(inventoryCentre?.catalogItems ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku ? `${item.sku} — ` : ''}
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="titan-input-group">
                <span className="titan-input-label">Stock location</span>
                <select
                  className="titan-input"
                  value={materialLocationId}
                  onChange={(e) => setMaterialLocationId(e.target.value)}
                  required
                >
                  <option value="">Select location</option>
                  {(inventoryCentre?.locations ?? []).map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} ({location.locationType})
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          <Button type="submit" disabled={busy}>
            Request material use
          </Button>
        </form>
        <ul className="portal-list">
          {workspace.materialLines.map((line) => (
            <li key={line.id}>
              <strong>{line.description}</strong>
              <span>
                {line.quantity} {line.unit} · {line.materialSource.replace(/_/g, ' ')} ·{' '}
                {line.status.replace(/_/g, ' ')}
                {line.inventoryItemName ? ` · ${line.inventoryItemName}` : ''}
                {line.locationName ? ` @ ${line.locationName}` : ''}
                {line.rejectionReason ? ` · ${line.rejectionReason}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Variation (pending approval)">
        <form className="jobs-form" onSubmit={(e) => void handleVariation(e)}>
          <Input
            label="Title"
            value={variationTitle}
            onChange={(e) => setVariationTitle(e.target.value)}
            required
          />
          <Input
            label="Site condition"
            value={variationCondition}
            onChange={(e) => setVariationCondition(e.target.value)}
            required
          />
          <label className="titan-input-group">
            <span className="titan-input-label">Explanation</span>
            <textarea
              className="titan-input jobs-textarea"
              rows={3}
              value={variationExplanation}
              onChange={(e) => setVariationExplanation(e.target.value)}
              required
            />
          </label>
          <Button type="submit" disabled={busy}>
            Submit variation
          </Button>
        </form>
        <ul className="portal-list">
          {workspace.variations.map((v) => (
            <li key={v.id}>
              <strong>{v.title}</strong>
              <span>{v.status}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Completion gate">
        <p className="page-muted">
          {workspace.completionGate.canComplete
            ? 'Evidence looks ready — fill declaration to complete.'
            : `Still needed: ${workspace.completionGate.missing.join(', ') || 'completion details'}`}
        </p>
        <form className="jobs-form" onSubmit={(e) => void handleComplete(e)}>
          {requiredChecklistForJobType(workspace.jobType).map((key) => (
            <label key={key} className="mobile-check-row">
              <input
                type="checkbox"
                checked={Boolean(checklist[key])}
                onChange={(e) => setChecklist((prev) => ({ ...prev, [key]: e.target.checked }))}
              />
              <span>{key.replace(/_/g, ' ')}</span>
            </label>
          ))}
          <label className="titan-input-group">
            <span className="titan-input-label">Work performed</span>
            <textarea
              className="titan-input jobs-textarea"
              rows={3}
              value={completeForm.workPerformedSummary}
              onChange={(e) =>
                setCompleteForm((prev) => ({ ...prev, workPerformedSummary: e.target.value }))
              }
              required
            />
          </label>
          <Input
            label="Site condition"
            value={completeForm.siteCondition}
            onChange={(e) => setCompleteForm((prev) => ({ ...prev, siteCondition: e.target.value }))}
            required
          />
          <Input
            label="Customer / site representative"
            value={completeForm.customerRepName}
            onChange={(e) =>
              setCompleteForm((prev) => ({ ...prev, customerRepName: e.target.value }))
            }
            required
          />
          <Input
            label="Signer role / relationship"
            value={completeForm.signerRole}
            onChange={(e) => setCompleteForm((prev) => ({ ...prev, signerRole: e.target.value }))}
          />
          <label className="titan-input-group">
            <span className="titan-input-label">Customer signature</span>
            <SignaturePad disabled={busy || Boolean(signatureDocId)} onChange={setSignatureDataUrl} />
          </label>
          <label className="mobile-check-row">
            <input
              type="checkbox"
              checked={completeForm.signatureAck}
              disabled={busy || Boolean(signatureDocId)}
              onChange={(e) =>
                setCompleteForm((prev) => ({ ...prev, signatureAck: e.target.checked }))
              }
            />
            <span>Signer acknowledges work completion evidence</span>
          </label>
          <Button type="button" disabled={busy || Boolean(signatureDocId)} onClick={() => void handleSaveSignature()}>
            {signatureDocId ? 'Signature stored' : 'Save signature evidence'}
          </Button>
          <Input
            label="Signature unavailable reason (mandatory if no signature)"
            value={completeForm.signatureUnavailableReason}
            onChange={(e) =>
              setCompleteForm((prev) => ({
                ...prev,
                signatureUnavailableReason: e.target.value,
              }))
            }
            disabled={Boolean(signatureDocId)}
          />
          {hasUnsyncedEvidence(offlineActions, jobId ?? '') ? (
            <p className="form-error">
              Completion blocked while required evidence is Offline, Pending, or Failed.
            </p>
          ) : null}
          <label className="titan-input-group">
            <span className="titan-input-label">COC / compliance</span>
            <select
              className="titan-input"
              value={completeForm.cocRequired}
              onChange={(e) =>
                setCompleteForm((prev) => ({
                  ...prev,
                  cocRequired: e.target.value as typeof prev.cocRequired,
                }))
              }
            >
              <option value="not_required">Not required</option>
              <option value="required">Required</option>
              <option value="pending_classification">Pending classification</option>
            </select>
            <p className="page-muted">
              Company COC defaults (UX-035) classify gas/geyser and electrical work as requiring a
              Certificate of Compliance where configured. This control records job classification —
              it does not issue a COC or mark compliance complete.
            </p>
          </label>
          <Input
            label="Outstanding defect / follow-up"
            value={completeForm.outstandingDefects}
            onChange={(e) =>
              setCompleteForm((prev) => ({ ...prev, outstandingDefects: e.target.value }))
            }
          />
          <label className="titan-input-group">
            <span className="titan-input-label">Customer-visible update</span>
            <textarea
              className="titan-input jobs-textarea"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="mobile-check-row">
            <input
              type="checkbox"
              checked={completeForm.technicianDeclaration}
              onChange={(e) =>
                setCompleteForm((prev) => ({
                  ...prev,
                  technicianDeclaration: e.target.checked,
                }))
              }
            />
            <span>I declare the work and evidence recorded are accurate</span>
          </label>
          <button type="submit" className="mobile-action-btn mobile-action-btn--primary" disabled={busy}>
            Complete job
          </button>
        </form>
      </Panel>

      {workspace.propertyHistory.length > 0 ? (
        <Panel title="Property history">
          <ul className="portal-list">
            {workspace.propertyHistory.map((item) => (
              <li key={item.id}>
                <strong>{item.jobNumber ?? item.title}</strong>
                <span>
                  {item.status}
                  {item.completedAt ? ` · ${new Date(item.completedAt).toLocaleDateString()}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
