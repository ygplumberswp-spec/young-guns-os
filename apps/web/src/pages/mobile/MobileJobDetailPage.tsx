import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'wouter';
import { Button, EmptyState, Input, PageHeader, Panel } from '@titan/ui';
import type {
  CartrackArrivalPrompt,
  JobMaterialSource,
  JobRescheduleReason,
  JobVisitRollup,
  JobWorkflowAction,
  MobileJobExecutionWorkspace,
  MobileTimeEntrySummary,
  MobileWorkforceInventoryCentre,
  TechnicianCompletionChecklist,
  TechnicianInvoicePaymentStrip,
} from '@titan/shared';
import {
  evaluatePaperlessCompletionSequence,
  JOB_RESCHEDULE_REASON_LABELS,
  requiredChecklistForJobType,
} from '@titan/shared';
import {
  MobileApiClientError,
  completeMobileJobGated,
  createMobileDirectCost,
  createMobileJobVariation,
  fetchActiveMobileTimeEntries,
  fetchMobileArrivalPrompt,
  fetchMobileCaptureChecklist,
  fetchMobileJobVisits,
  fetchMobilePaymentStrip,
  pauseMobileTimeEntry,
  recordMobileOnSitePayment,
  requestMobileJobReschedule,
  resumeMobileTimeEntry,
  startMobileTimedEntry,
  stillBusyMobileJob,
  stopMobileTimeEntry,
  fetchMobileInventory,
  fetchMobileJobWorkspace,
  newClientActionId,
  recordMobileMaterialLine,
  returnMobileMaterialLine,
  transitionMobileJob,
  uploadMobileJobEvidence,
} from '../../lib/mobile-api-client';
import { PaperlessCompletionSequence } from '../../features/jobs/PaperlessCompletionSequence';
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
import { evaluateMobileCompletionSubmit } from '../../lib/mobile-offline-completion';
import { SignaturePad } from '../../features/jobs/SignaturePad';
import { useAuth } from '../../lib/auth-context';
import { ReportExportActions } from '../../features/reports/ReportExportActions';

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
  still_busy: 'Still busy — continue later',
  ready_to_complete: 'Ready to complete',
  complete: 'Complete',
  reopen: 'Reopen',
};

const RESCHEDULE_REASONS = Object.keys(JOB_RESCHEDULE_REASON_LABELS) as JobRescheduleReason[];

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
  const [stillBusyNotes, setStillBusyNotes] = useState('');
  const [stillBusyCompleted, setStillBusyCompleted] = useState('');
  const [stillBusyRemaining, setStillBusyRemaining] = useState('');
  const [stillBusyNextAt, setStillBusyNextAt] = useState('');
  const [showStillBusy, setShowStillBusy] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleReason, setRescheduleReason] =
    useState<JobRescheduleReason>('customer_unavailable');
  const [rescheduleNotes, setRescheduleNotes] = useState('');
  const [rescheduleProposedAt, setRescheduleProposedAt] = useState('');
  const [visitRollup, setVisitRollup] = useState<JobVisitRollup | null>(null);
  const [note] = useState('');
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
    workRequested: '',
    findings: '',
    workPerformedSummary: '',
    diagnosis: '',
    recommendation: '',
    clientFacingNotes: '',
    internalNotes: '',
    siteCondition: '',
    customerRepName: '',
    signerRole: 'customer_representative',
    signatureUnavailableReason: '',
    signatureAck: false,
    cocRequired: 'not_required' as 'required' | 'not_required' | 'pending_classification',
    technicianDeclaration: false,
    outstandingDefects: '',
    materialsNotRequired: false,
  });
  const [labourPaused, setLabourPaused] = useState(false);
  const [arrivalPrompt, setArrivalPrompt] = useState<CartrackArrivalPrompt | null>(null);
  const [paymentStrip, setPaymentStrip] = useState<TechnicianInvoicePaymentStrip | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureDocId, setSignatureDocId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [activeJobTimeId, setActiveJobTimeId] = useState<string | null>(null);
  const [captureChecklist, setCaptureChecklist] = useState<TechnicianCompletionChecklist | null>(null);
  const [expenseCategory, setExpenseCategory] = useState('consumables');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [returnQtyByLine, setReturnQtyByLine] = useState<Record<string, string>>({});
  const [returnReasonByLine, setReturnReasonByLine] = useState<Record<string, string>>({});
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
      const activeEntries = await fetchActiveMobileTimeEntries(accessToken).catch(
        (): MobileTimeEntrySummary[] => [],
      );
      const openForJob = activeEntries.find(
        (entry) => entry.entryType === 'job_time' && entry.jobId === jobId,
      );
      setActiveJobTimeId(openForJob?.id ?? null);
      const checklistData = await fetchMobileCaptureChecklist(accessToken, jobId).catch(() => null);
      setCaptureChecklist(checklistData);
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
      const strip = await fetchMobilePaymentStrip(accessToken, jobId).catch(() => null);
      setPaymentStrip(strip);
      // Arrival prompt never auto-starts labour — technician must confirm.
      const prompt = await fetchMobileArrivalPrompt(accessToken, jobId, {
        jobNumber: data.jobNumber,
      }).catch(() => null);
      setArrivalPrompt(prompt);
      const visitsPayload = await fetchMobileJobVisits(accessToken, jobId).catch(() => null);
      setVisitRollup(visitsPayload?.rollup ?? null);
      setCompleteForm((prev) =>
        prev.workRequested === '' && data.workInstructions
          ? { ...prev, workRequested: data.workInstructions ?? '' }
          : prev,
      );
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
    if (action === 'still_busy') {
      setShowStillBusy(true);
      setShowReschedule(false);
      return;
    }
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

  function toIsoOrNull(localValue: string): string | null {
    if (!localValue.trim()) return null;
    const parsed = new Date(localValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  async function submitStillBusy() {
    if (!accessToken || !jobId || busy) return;
    if (!stillBusyRemaining.trim()) {
      setError('Describe remaining work before marking Still Busy');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!navigator.onLine) {
        setError('Still Busy requires a connection so the visit closes cleanly on the server');
        return;
      }
      await stillBusyMobileJob(accessToken, jobId, {
        notes: stillBusyNotes.trim() || null,
        workCompletedSummary: stillBusyCompleted.trim() || null,
        remainingWorkSummary: stillBusyRemaining.trim(),
        proposedNextVisitAt: toIsoOrNull(stillBusyNextAt),
      });
      setShowStillBusy(false);
      setStillBusyNotes('');
      setStillBusyCompleted('');
      setStillBusyRemaining('');
      setStillBusyNextAt('');
      await reload();
      setMessage('Visit closed — job remains OPEN (not ready for invoicing)');
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Still Busy failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitRescheduleRequest() {
    if (!accessToken || !jobId || busy) return;
    if (!rescheduleNotes.trim()) {
      setError('Reschedule notes are required');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!navigator.onLine) {
        setError('Reschedule requests require a connection (schedule is never moved silently)');
        return;
      }
      await requestMobileJobReschedule(accessToken, jobId, {
        reason: rescheduleReason,
        notes: rescheduleNotes.trim(),
        proposedScheduledAt: toIsoOrNull(rescheduleProposedAt),
      });
      setShowReschedule(false);
      setRescheduleNotes('');
      setRescheduleProposedAt('');
      await reload();
      setMessage('Reschedule requested — office must confirm the new booking');
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Reschedule request failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleStartLabour() {
    if (!accessToken || !jobId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const clientActionId = newClientActionId('time-start');
      if (!navigator.onLine) {
        await enqueueOfflineAction({
          clientActionId,
          actionType: 'time_entry',
          jobId,
          payload: { entryType: 'job_time', notes: 'On-site labour', clientActionId, start: true },
        });
        await refreshOffline();
        setMessage('Labour start queued offline');
        return;
      }
      const entry = await startMobileTimedEntry(accessToken, {
        entryType: 'job_time',
        jobId,
        notes: 'On-site labour',
        clientActionId,
      });
      setActiveJobTimeId(entry.id);
      await reload();
      setMessage('Labour timer started');
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Unable to start labour');
    } finally {
      setBusy(false);
    }
  }

  async function handleStopLabour() {
    if (!accessToken || !activeJobTimeId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await stopMobileTimeEntry(accessToken, activeJobTimeId, {
        clientActionId: newClientActionId('time-stop'),
      });
      setActiveJobTimeId(null);
      setLabourPaused(false);
      await reload();
      setMessage('Labour timer stopped and locked');
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Unable to stop labour');
    } finally {
      setBusy(false);
    }
  }

  async function handlePauseLabour() {
    if (!accessToken || !activeJobTimeId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await pauseMobileTimeEntry(accessToken, activeJobTimeId);
      setLabourPaused(true);
      setMessage('Labour timer paused (server-persisted)');
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Unable to pause labour');
    } finally {
      setBusy(false);
    }
  }

  async function handleResumeLabour() {
    if (!accessToken || !activeJobTimeId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await resumeMobileTimeEntry(accessToken, activeJobTimeId);
      setLabourPaused(false);
      setMessage('Labour timer resumed');
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Unable to resume labour');
    } finally {
      setBusy(false);
    }
  }

  async function handleTakeCardPayment() {
    if (!accessToken || !jobId || !paymentStrip || !workspace || paymentBusy) return;
    if (!paymentReference.trim()) {
      setError('Payment reference required (never enter card PAN/CVV/PIN).');
      return;
    }
    setPaymentBusy(true);
    setError(null);
    try {
      await recordMobileOnSitePayment(accessToken, jobId, {
        invoiceId: paymentStrip.invoiceId,
        customerId: workspace.customer.id,
        amountCents: paymentStrip.amountDueCents,
        method: 'card_terminal',
        providerTerminal: 'company_terminal',
        paymentReference: paymentReference.trim(),
      });
      const refreshed = await fetchMobilePaymentStrip(accessToken, jobId);
      setPaymentStrip(refreshed);
      setPaymentReference('');
      setMessage('Card payment evidence recorded — invoice payment status updated');
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Unable to record payment');
    } finally {
      setPaymentBusy(false);
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

  async function handleExpense(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !jobId || busy) return;
    const description = expenseDesc.trim();
    if (!description) {
      setError('Expense description is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createMobileDirectCost(accessToken, jobId, {
        category: expenseCategory,
        description,
        amountCents: null,
        notes: expenseNotes.trim() || 'Cost pending finance review',
      });
      setExpenseDesc('');
      setExpenseNotes('');
      await reload();
      setMessage('Expense recorded — finance will confirm cost if needed');
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Unable to record expense');
    } finally {
      setBusy(false);
    }
  }

  async function handleExpenseReceipt(file: File | null) {
    if (!accessToken || !jobId || !file || busy) return;
    const description = expenseDesc.trim() || file.name;
    setBusy(true);
    setError(null);
    setUploadProgress(`Uploading receipt ${file.name}…`);
    try {
      const dataBase64 = await fileToBase64(file);
      const clientActionId = newClientActionId('expense-receipt');
      const documentation = await uploadMobileJobEvidence(accessToken, jobId, {
        documentationType: 'document',
        title: `Receipt — ${description}`,
        mimeType: file.type || 'application/pdf',
        dataBase64,
        fileName: file.name,
        evidencePhase: 'document',
        metadata: {
          kind: 'expense_receipt',
          capturedAt: new Date().toISOString(),
          originalName: file.name,
          sizeBytes: file.size,
        },
        clientActionId,
      });
      await createMobileDirectCost(accessToken, jobId, {
        category: expenseCategory,
        description,
        amountCents: null,
        receiptDocumentId: documentation.id,
        notes: expenseNotes.trim() || null,
        clientActionId: `${clientActionId}-cost`,
      });
      setExpenseDesc('');
      setExpenseNotes('');
      setUploadProgress(null);
      await reload();
      setMessage('Expense and receipt captured');
    } catch (err) {
      setUploadProgress(null);
      setError(err instanceof MobileApiClientError ? err.message : 'Unable to upload receipt');
    } finally {
      setBusy(false);
    }
  }

  async function handleMaterialReturn(materialLineId: string) {
    if (!accessToken || !jobId || busy) return;
    const quantity = Number(returnQtyByLine[materialLineId]);
    const reason = (returnReasonByLine[materialLineId] ?? '').trim();
    if (!quantity || quantity <= 0) {
      setError('Enter a valid return quantity');
      return;
    }
    if (!reason) {
      setError('Return reason is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await returnMobileMaterialLine(accessToken, jobId, materialLineId, { quantity, reason });
      setReturnQtyByLine((prev) => ({ ...prev, [materialLineId]: '' }));
      setReturnReasonByLine((prev) => ({ ...prev, [materialLineId]: '' }));
      await reload();
      setMessage('Material return recorded');
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Unable to return material');
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
    const gate = evaluateMobileCompletionSubmit({
      jobId,
      offlineActions,
      signatureDocId,
      signatureUnavailableReason: completeForm.signatureUnavailableReason,
      isOnline: navigator.onLine,
    });
    if (!gate.allowed) {
      if (gate.reason === 'unsynced_evidence') {
        setError(
          'Required evidence is still Offline/Pending/Failed. Sync must succeed before completion can appear successful.',
        );
      } else if (gate.reason === 'missing_signature') {
        setError('Capture a signature or provide a mandatory unavailable reason');
      } else {
        setError('Final completion requires a live connection after required evidence is synced');
      }
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await completeMobileJobGated(accessToken, jobId, {
        workPerformedSummary: completeForm.workPerformedSummary.trim(),
        checklist: {
          ...checklist,
          ...(completeForm.materialsNotRequired ? { materials_not_required: true } : {}),
        },
        measurements: completeForm.workRequested.trim() || null,
        diagnosis: completeForm.findings.trim() || completeForm.diagnosis.trim() || null,
        recommendation: completeForm.recommendation.trim() || null,
        siteCondition: completeForm.siteCondition.trim(),
        customerRepName: completeForm.customerRepName.trim(),
        signatureDocId: signatureDocId,
        signatureUnavailableReason: completeForm.signatureUnavailableReason.trim() || null,
        cocRequired: completeForm.cocRequired,
        technicianDeclaration: completeForm.technicianDeclaration,
        outstandingDefects: completeForm.outstandingDefects.trim() || null,
        followUpRequired: Boolean(completeForm.outstandingDefects.trim()),
        customerVisibleUpdate:
          completeForm.clientFacingNotes.trim() || note.trim() || null,
        safetyNotes: completeForm.internalNotes.trim() || null,
      });
      await reload();
      const strip = await fetchMobilePaymentStrip(accessToken, jobId).catch(() => null);
      setPaymentStrip(strip);
      if (result.paperless?.draftInvoice) {
        setMessage(
          result.paperless.ownerNotifyMessage ??
            'Job completed — draft invoice prepared for owner approval',
        );
      } else if (result.paperless?.issues?.length) {
        setMessage(
          `Job completed. AURA Finance notes: ${result.paperless.issues.map((i) => i.message).join('; ')}`,
        );
      } else {
        setMessage('Job completed with immutable snapshot');
      }
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
    return <EmptyState title="Job Not Found" description="This job is not assigned to you." />;
  }

  const primaryActions = workspace.availableActions.filter((a) =>
    ['accept', 'en_route', 'arrive', 'start_work', 'resume', 'ready_to_complete'].includes(a),
  );
  const waitActions = workspace.availableActions.filter((a) =>
    ['pause', 'await_customer', 'await_parts', 'await_approval', 'still_busy'].includes(a),
  );
  const canRequestReschedule = !['completed'].includes(workspace.executionPhase);
  const labourTotal = workspace.laborTimeEntries.reduce(
    (sum, entry) => sum + (entry.durationMinutes ?? 0),
    0,
  );

  const hasBeforePhoto = workspace.documentation.some((d) => d.evidencePhase === 'before');
  const hasAfterPhoto = workspace.documentation.some((d) => d.evidencePhase === 'after');
  const hasSlip = workspace.documentation.some(
    (d) => d.evidencePhase === 'document' || /slip|receipt/i.test(d.title),
  );
  const checklistKeys = requiredChecklistForJobType(workspace.jobType);
  const checklistComplete = checklistKeys.every((key) => Boolean(checklist[key]));
  const paperless = evaluatePaperlessCompletionSequence({
    workRequested: completeForm.workRequested || workspace.workInstructions,
    findings: completeForm.findings || completeForm.diagnosis,
    workPerformed: completeForm.workPerformedSummary,
    clientFacingNotes: completeForm.clientFacingNotes,
    internalNotes: completeForm.internalNotes,
    outstandingRecommended: completeForm.outstandingDefects,
    hasMaterialsOrExplicitNone:
      workspace.materialLines.length > 0 ||
      workspace.materialsUsed.length > 0 ||
      completeForm.materialsNotRequired,
    hasSlipOrExpenseEvidence: hasSlip,
    hasBeforePhoto,
    hasAfterPhoto,
    checklistComplete,
    hasSignature: Boolean(signatureDocId),
    signerName: completeForm.customerRepName,
    labourStopped: !activeJobTimeId,
    openLabourEntries: activeJobTimeId ? 1 : 0,
  });

  return (
    <div className="portal-page mobile-job-exec">
      <PageHeader
        title={workspace.jobNumber ? `${workspace.jobNumber}` : workspace.title}
        description={`${workspace.jobType ?? 'Job'} · ${workspace.priority} · ${workspace.executionPhase.replace(/_/g, ' ')}`}
      />

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="page-success">{message}</p> : null}

      <Panel title="Paperless sequence" description="Controlled STEP 1–6 — stop timer before final submit">
        <PaperlessCompletionSequence
          currentStep={paperless.currentStep}
          stepComplete={Object.fromEntries(paperless.steps.map((s) => [s.key, s.complete]))}
        />
      </Panel>

      {arrivalPrompt?.shouldPrompt ? (
        <div className="arrival-prompt">
          <p>{arrivalPrompt.message}</p>
          <p className="page-muted">Cartrack never auto-starts labour. Confirm to start your timer.</p>
          <Button type="button" disabled={busy || Boolean(activeJobTimeId)} onClick={() => void handleStartLabour()}>
            Start job timer
          </Button>
        </div>
      ) : null}

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
        {canRequestReschedule ? (
          <div style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="mobile-action-btn"
              disabled={busy}
              onClick={() => {
                setShowReschedule((v) => !v);
                setShowStillBusy(false);
              }}
            >
              Request reschedule
            </button>
          </div>
        ) : null}
      </Panel>

      {showStillBusy ? (
        <Panel
          title="Still busy — continue later"
          description="Ends this visit timer. Job stays OPEN. Does not invoice or complete."
        >
          <label className="titan-input-group">
            <span className="titan-input-label">Work completed so far</span>
            <textarea
              className="titan-input"
              rows={2}
              value={stillBusyCompleted}
              onChange={(e) => setStillBusyCompleted(e.target.value)}
            />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Remaining work *</span>
            <textarea
              className="titan-input"
              rows={2}
              value={stillBusyRemaining}
              onChange={(e) => setStillBusyRemaining(e.target.value)}
            />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Notes</span>
            <textarea
              className="titan-input"
              rows={2}
              value={stillBusyNotes}
              onChange={(e) => setStillBusyNotes(e.target.value)}
            />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Proposed next visit (optional)</span>
            <input
              className="titan-input"
              type="datetime-local"
              value={stillBusyNextAt}
              onChange={(e) => setStillBusyNextAt(e.target.value)}
            />
          </label>
          <div className="mobile-action-grid" style={{ marginTop: '0.75rem' }}>
            <Button type="button" disabled={busy} onClick={() => void submitStillBusy()}>
              Confirm still busy
            </Button>
            <button type="button" className="mobile-action-btn" disabled={busy} onClick={() => setShowStillBusy(false)}>
              Cancel
            </button>
          </div>
        </Panel>
      ) : null}

      {showReschedule ? (
        <Panel
          title="Request reschedule"
          description="Office / Manager confirms the new booking. Schedule is not moved silently."
        >
          <label className="titan-input-group">
            <span className="titan-input-label">Reason</span>
            <select
              className="titan-input"
              value={rescheduleReason}
              onChange={(e) => setRescheduleReason(e.target.value as JobRescheduleReason)}
            >
              {RESCHEDULE_REASONS.map((code) => (
                <option key={code} value={code}>
                  {JOB_RESCHEDULE_REASON_LABELS[code]}
                </option>
              ))}
            </select>
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Notes *</span>
            <textarea
              className="titan-input"
              rows={3}
              value={rescheduleNotes}
              onChange={(e) => setRescheduleNotes(e.target.value)}
              placeholder="Customer unavailable / parts / access…"
            />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Proposed date/time (optional)</span>
            <input
              className="titan-input"
              type="datetime-local"
              value={rescheduleProposedAt}
              onChange={(e) => setRescheduleProposedAt(e.target.value)}
            />
          </label>
          <div className="mobile-action-grid" style={{ marginTop: '0.75rem' }}>
            <Button type="button" disabled={busy} onClick={() => void submitRescheduleRequest()}>
              Submit request
            </Button>
            <button
              type="button"
              className="mobile-action-btn"
              disabled={busy}
              onClick={() => setShowReschedule(false)}
            >
              Cancel
            </button>
          </div>
        </Panel>
      ) : null}

      {visitRollup && visitRollup.visitCount > 0 ? (
        <Panel title="Visits" description="Same job — multi-day work sessions (not duplicate jobs)">
          <p className="page-muted">
            {visitRollup.visitCount} visit(s) · labour {visitRollup.totalLabourMinutes} min · travel{' '}
            {visitRollup.totalTravelMinutes} min
            {visitRollup.invoiceBlocked ? ' · invoicing blocked until final complete' : ''}
          </p>
          <ul className="mobile-visit-list">
            {visitRollup.visits.map((visit) => (
              <li key={visit.id}>
                Visit {visit.visitNumber} — {visit.status}
                {visit.closeReason ? ` (${visit.closeReason.replace(/_/g, ' ')})` : ''}
                {visit.labourMinutes ? ` · ${visit.labourMinutes} min labour` : ''}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

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

      <Panel title="Work Description">
        <p>{workspace.workInstructions ?? '—'}</p>
        {workspace.customerVisibleNotes ? (
          <p className="page-muted">Customer-visible: {workspace.customerVisibleNotes}</p>
        ) : null}
        {workspace.internalNotes ? <p className="page-muted">Internal: {workspace.internalNotes}</p> : null}
      </Panel>

      <Panel title="Crew & Vehicle">
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

      {accessToken && jobId ? (
        <Panel title="Job report">
          <ReportExportActions
            accessToken={accessToken}
            kind="job"
            resourceId={jobId}
            label="Assigned job report"
            reportNumber={workspace.jobNumber}
            disabled={busy}
          />
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

      <Panel title="Labour" description={`Crew total ${labourTotal} min · START / PAUSE / RESUME / STOP`}>
        <div className="mobile-action-grid">
          {!activeJobTimeId ? (
            <Button type="button" disabled={busy} onClick={() => void handleStartLabour()}>
              Start
            </Button>
          ) : (
            <>
              {!labourPaused ? (
                <Button type="button" disabled={busy} onClick={() => void handlePauseLabour()}>
                  Pause
                </Button>
              ) : (
                <Button type="button" disabled={busy} onClick={() => void handleResumeLabour()}>
                  Resume
                </Button>
              )}
              <Button type="button" disabled={busy} onClick={() => void handleStopLabour()}>
                Stop
              </Button>
            </>
          )}
        </div>
        <p className="page-muted" style={{ marginTop: '0.5rem' }}>
          Timer is server-persisted — refresh / lock will not lose it. Pause time is excluded from
          authoritative labour minutes.
        </p>
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
              <option value="supplier_purchase">Other material / supplier purchase</option>
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
              {['used', 'partially_fulfilled', 'approved'].includes(line.status) ? (
                <div className="jobs-form" style={{ marginTop: '0.5rem' }}>
                  <Input
                    label="Return qty"
                    value={returnQtyByLine[line.id] ?? ''}
                    onChange={(e) =>
                      setReturnQtyByLine((prev) => ({ ...prev, [line.id]: e.target.value }))
                    }
                  />
                  <Input
                    label="Return reason"
                    value={returnReasonByLine[line.id] ?? ''}
                    onChange={(e) =>
                      setReturnReasonByLine((prev) => ({ ...prev, [line.id]: e.target.value }))
                    }
                  />
                  <Button type="button" disabled={busy} onClick={() => void handleMaterialReturn(line.id)}>
                    Return material
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Variation (Pending Approval)">
        <form className="jobs-form" onSubmit={(e) => void handleVariation(e)}>
          <Input
            label="Title"
            value={variationTitle}
            onChange={(e) => setVariationTitle(e.target.value)}
            required
          />
          <Input
            label="Site Condition"
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

      <Panel title="Expenses / Receipts" description="Job-specific costs with optional receipt evidence">
        <form className="jobs-form" onSubmit={(e) => void handleExpense(e)}>
          <label className="titan-input-group">
            <span className="titan-input-label">Category</span>
            <select
              className="titan-input"
              value={expenseCategory}
              onChange={(e) => setExpenseCategory(e.target.value)}
            >
              <option value="consumables">Consumables</option>
              <option value="fuel">Fuel</option>
              <option value="parking">Parking</option>
              <option value="toll">Toll</option>
              <option value="delivery">Delivery</option>
              <option value="equipment_hire">Equipment hire</option>
              <option value="subcontractor">Subcontractor</option>
              <option value="other">Other</option>
            </select>
          </label>
          <Input
            label="Description"
            value={expenseDesc}
            onChange={(e) => setExpenseDesc(e.target.value)}
            required
          />
          <Input
            label="Notes (optional)"
            value={expenseNotes}
            onChange={(e) => setExpenseNotes(e.target.value)}
          />
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button type="submit" disabled={busy}>
              Add expense
            </Button>
            <label className="titan-button titan-button--secondary" style={{ cursor: busy ? 'not-allowed' : 'pointer' }}>
              Upload receipt
              <input
                type="file"
                accept="image/*,application/pdf"
                hidden
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.target.value = '';
                  void handleExpenseReceipt(file);
                }}
              />
            </label>
          </div>
        </form>
      </Panel>

      <Panel title="Financial capture checklist" description="Operational readiness before completion">
        {captureChecklist ? (
          <ul className="portal-list">
            {captureChecklist.items.map((item) => (
              <li key={item.key}>
                <strong>
                  {item.status === 'ok' ? '✓' : item.status === 'not_applicable' ? '—' : '⚠'} {item.label}
                </strong>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="page-muted">Loading capture status…</p>
        )}
        {captureChecklist && captureChecklist.warningCount > 0 ? (
          <p className="page-muted">
            {captureChecklist.warningCount} item(s) need attention — you can still complete the job.
          </p>
        ) : null}
      </Panel>

      <Panel title="Completion Gate">
        <p className="page-muted">
          {paperless.canSubmit && workspace.completionGate.canComplete
            ? 'Sequence + evidence ready — submit after Stop.'
            : `Still needed: ${[
                ...paperless.steps.flatMap((s) => s.blockers),
                ...workspace.completionGate.missing,
              ]
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(', ') || 'completion details'}`}
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
          <label className="mobile-check-row">
            <input
              type="checkbox"
              checked={completeForm.materialsNotRequired}
              onChange={(e) =>
                setCompleteForm((prev) => ({ ...prev, materialsNotRequired: e.target.checked }))
              }
            />
            <span>No materials used on this job</span>
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Work requested</span>
            <textarea
              className="titan-input jobs-textarea"
              rows={2}
              value={completeForm.workRequested}
              onChange={(e) =>
                setCompleteForm((prev) => ({ ...prev, workRequested: e.target.value }))
              }
              required
            />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Findings</span>
            <textarea
              className="titan-input jobs-textarea"
              rows={2}
              value={completeForm.findings}
              onChange={(e) => setCompleteForm((prev) => ({ ...prev, findings: e.target.value }))}
              required
            />
          </label>
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
          <label className="titan-input-group">
            <span className="titan-input-label">Client-facing notes</span>
            <textarea
              className="titan-input jobs-textarea"
              rows={2}
              value={completeForm.clientFacingNotes}
              onChange={(e) =>
                setCompleteForm((prev) => ({ ...prev, clientFacingNotes: e.target.value }))
              }
            />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Internal notes (never shown to client)</span>
            <textarea
              className="titan-input jobs-textarea"
              rows={2}
              value={completeForm.internalNotes}
              onChange={(e) =>
                setCompleteForm((prev) => ({ ...prev, internalNotes: e.target.value }))
              }
            />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Outstanding / recommended work</span>
            <textarea
              className="titan-input jobs-textarea"
              rows={2}
              value={completeForm.outstandingDefects}
              onChange={(e) =>
                setCompleteForm((prev) => ({ ...prev, outstandingDefects: e.target.value }))
              }
            />
          </label>
          <Input
            label="Site Condition"
            value={completeForm.siteCondition}
            onChange={(e) => setCompleteForm((prev) => ({ ...prev, siteCondition: e.target.value }))}
            required
          />
          <Input
            label="Customer / Site Representative"
            value={completeForm.customerRepName}
            onChange={(e) =>
              setCompleteForm((prev) => ({ ...prev, customerRepName: e.target.value }))
            }
            required
          />
          <Input
            label="Signer Role / Relationship"
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
            label="Signature Unavailable Reason (Mandatory If No Signature)"
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
          {activeJobTimeId ? (
            <p className="form-error">Stop the job timer (STEP 6) before final submission.</p>
          ) : null}
          <button
            type="submit"
            className="mobile-action-btn mobile-action-btn--primary"
            disabled={busy || Boolean(activeJobTimeId)}
          >
            Complete & submit signed job
          </button>
        </form>
      </Panel>

      {paymentStrip ? (
        <Panel
          title="JOB COMPLETE — On-site payment"
          description="Invoice # + amount due only. Never enter card PAN / CVV / PIN."
        >
          <p>
            <strong>Invoice #{paymentStrip.invoiceNumber ?? '—'}</strong>
          </p>
          <p>
            Amount due: R{(paymentStrip.amountDueCents / 100).toFixed(2)} · Status:{' '}
            {paymentStrip.paymentStatus.replace('_', ' ')}
          </p>
          {paymentStrip.paymentStatus !== 'paid' ? (
            <>
              <Input
                label="Payment reference (terminal / provider)"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
              <div className="mobile-action-grid">
                <Button
                  type="button"
                  disabled={paymentBusy}
                  onClick={() => void handleTakeCardPayment()}
                >
                  Take card payment
                </Button>
              </div>
              <p className="page-muted">
                Payment link / QR and other authorised evidence use the same reference capture —
                full card data is never stored.
              </p>
            </>
          ) : (
            <p className="page-success">Paid in full.</p>
          )}
        </Panel>
      ) : null}

      {workspace.propertyHistory.length > 0 ? (
        <Panel title="Property History">
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
