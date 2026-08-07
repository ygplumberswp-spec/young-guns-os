import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';
import type {
  CustomerDuplicateCandidateSummary,
  CustomerMergeDecision,
  CustomerMergeFieldKey,
  CustomerMergeFieldSelection,
  CustomerMergePreview,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  decideCustomerDuplicate,
  fetchCustomerDuplicateCandidates,
  previewCustomerDuplicateMerge,
  scanCustomerDuplicates,
} from '../../lib/crm-api';

type Props = {
  accessToken: string;
  isOwner: boolean;
  canReview: boolean;
  /** Optional preselect from customer list deep-link. */
  initialLeftCustomerId?: string | null;
  initialRightCustomerId?: string | null;
};

const FIELD_LABELS: Record<CustomerMergeFieldKey, string> = {
  name: 'Name',
  contactPerson: 'Contact person',
  email: 'Email',
  phone: 'Phone',
  notes: 'Notes',
  status: 'Status',
  doNotContact: 'Do not contact',
  isSupplierOnly: 'Supplier only',
};

function formatLinks(preview: CustomerMergePreview['left']): string {
  const c = preview.linkCounts;
  return [
    `${c.jobs} jobs`,
    `${c.quotes} quotes`,
    `${c.invoices} invoices`,
    `${c.payments} payments`,
    `${c.properties} properties`,
    `${c.documents} docs`,
    `${c.communications} comms`,
    `${c.xeroMappings} Xero`,
  ].join(' · ');
}

export function CustomerDuplicateMergePanel({
  accessToken,
  isOwner,
  canReview,
  initialLeftCustomerId,
  initialRightCustomerId,
}: Props) {
  const [candidates, setCandidates] = useState<CustomerDuplicateCandidateSummary[]>([]);
  const [preview, setPreview] = useState<CustomerMergePreview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmConflicts, setConfirmConflicts] = useState(false);
  const [keepXeroContactId, setKeepXeroContactId] = useState<string>('');
  const [fieldSelection, setFieldSelection] = useState<CustomerMergeFieldSelection>({});
  const [notes, setNotes] = useState('');
  const [selectiveMode, setSelectiveMode] = useState(false);
  const [survivorSide, setSurvivorSide] = useState<'left' | 'right'>('left');

  const load = useCallback(async () => {
    const next = await fetchCustomerDuplicateCandidates(accessToken);
    setCandidates(next);
  }, [accessToken]);

  useEffect(() => {
    if (!canReview) return;
    let cancelled = false;
    void (async () => {
      try {
        setError(null);
        await load();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load duplicate queue');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canReview, load]);

  const openPreview = useCallback(
    async (leftCustomerId: string, rightCustomerId: string, candidateId?: string | null) => {
      setBusy(true);
      setError(null);
      setConfirmConflicts(false);
      setFieldSelection({});
      setSelectiveMode(false);
      setNotes('');
      try {
        const next = await previewCustomerDuplicateMerge(accessToken, {
          leftCustomerId,
          rightCustomerId,
          candidateId,
        });
        setPreview(next);
        setSelectedId(candidateId ?? null);
        setSurvivorSide(
          next.olderCustomerId === next.left.id ? 'left' : 'right',
        );
        const xeroIds = Array.from(
          new Set([...next.left.xeroContactIds, ...next.right.xeroContactIds]),
        );
        setKeepXeroContactId(xeroIds[0] ?? '');
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Unable to preview merge');
      } finally {
        setBusy(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    if (!initialLeftCustomerId || !initialRightCustomerId) return;
    void openPreview(initialLeftCustomerId, initialRightCustomerId, null);
  }, [initialLeftCustomerId, initialRightCustomerId, openPreview]);

  const xeroOptions = useMemo(() => {
    if (!preview) return [];
    return Array.from(new Set([...preview.left.xeroContactIds, ...preview.right.xeroContactIds]));
  }, [preview]);

  async function handleScan() {
    setBusy(true);
    setError(null);
    try {
      const next = await scanCustomerDuplicates(accessToken);
      setCandidates(next);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Scan failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitDecision(decision: CustomerMergeDecision) {
    if (!preview || !isOwner) return;
    setBusy(true);
    setError(null);
    try {
      await decideCustomerDuplicate(accessToken, {
        leftCustomerId: preview.left.id,
        rightCustomerId: preview.right.id,
        decision,
        confirmConflicts: preview.conflicts.length > 0 ? confirmConflicts : undefined,
        fieldSelection: selectiveMode || decision === 'selective_fields' ? fieldSelection : undefined,
        survivorCustomerId:
          decision === 'selective_fields'
            ? survivorSide === 'left'
              ? preview.left.id
              : preview.right.id
            : undefined,
        keepXeroContactId: xeroOptions.length > 1 ? keepXeroContactId || null : undefined,
        notes: notes.trim() || null,
        candidateId: selectedId,
      });
      setPreview(null);
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Decision failed');
    } finally {
      setBusy(false);
    }
  }

  if (!canReview) {
    return <p>You do not have permission to review customer duplicates.</p>;
  }

  return (
    <div className="customer-duplicate-merge">
      <Panel
        title="Duplicate Review Queue"
        description="Candidates are evidence-based only. Merges never run automatically — Owner approval is required."
      >
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void handleScan()}>
            Scan for duplicates
          </Button>
          <Link href="/crm">
            <Button variant="secondary" size="sm">
              Back to customers
            </Button>
          </Link>
        </div>

        {error ? <p role="alert">{error}</p> : null}

        {candidates.length === 0 ? (
          <p>No pending duplicate candidates. Run a scan to refresh evidence-based matches.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {candidates.map((candidate) => (
              <li
                key={candidate.id}
                style={{
                  borderTop: '1px solid var(--border-subtle, #ddd)',
                  padding: '0.85rem 0',
                  display: 'grid',
                  gap: '0.35rem',
                }}
              >
                <strong>
                  {candidate.leftName} ↔ {candidate.rightName}
                </strong>
                <span>
                  Confidence {candidate.confidence}% · Reasons:{' '}
                  {candidate.matchReasons.map((reason) => reason.reason).join(', ')}
                </span>
                <span>
                  Older:{' '}
                  {new Date(candidate.leftCreatedAt) <= new Date(candidate.rightCreatedAt)
                    ? candidate.leftName
                    : candidate.rightName}
                </span>
                <div>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void openPreview(
                        candidate.leftCustomerId,
                        candidate.rightCustomerId,
                        candidate.id,
                      )
                    }
                  >
                    Review side-by-side
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {preview ? (
        <Panel
          title="Side-By-Side Merge Review"
          description="Choose the surviving record. Linked jobs, quotes, invoices, payments, properties, documents, and communications are repointed — never deleted."
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
            }}
          >
            {([preview.left, preview.right] as const).map((side, index) => {
              const label = index === 0 ? 'Left' : 'Right';
              const isOlder = preview.olderCustomerId === side.id;
              return (
                <div key={side.id} style={{ border: '1px solid var(--border-subtle, #ddd)', padding: '0.85rem' }}>
                  <h3>
                    {label}: {side.name} {isOlder ? '(older)' : '(newer)'}
                  </h3>
                  <p>
                    <Link href={`/crm/${side.id}`}>Open record</Link>
                  </p>
                  <dl style={{ display: 'grid', gap: '0.35rem', margin: 0 }}>
                    <div>
                      <dt>Contact</dt>
                      <dd>{side.contactPerson ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{side.email ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Phone</dt>
                      <dd>{side.phone ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Address</dt>
                      <dd>{side.primaryAddressDisplay ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{side.status}</dd>
                    </div>
                    <div>
                      <dt>Xero</dt>
                      <dd>{side.xeroContactIds.join(', ') || '—'}</dd>
                    </div>
                    <div>
                      <dt>Links</dt>
                      <dd>{formatLinks(side)}</dd>
                    </div>
                    <div>
                      <dt>Active jobs / unpaid invoices</dt>
                      <dd>
                        {side.hasActiveJobs ? 'Active jobs' : 'No active jobs'} ·{' '}
                        {side.hasUnpaidInvoices ? 'Unpaid invoices' : 'No unpaid invoices'}
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '1rem' }}>
            <p>
              Match confidence {preview.confidence}% ·{' '}
              {preview.matchReasons.map((reason) => reason.detail).join('; ') || 'No reasons'}
            </p>
            {preview.conflicts.length > 0 ? (
              <div role="alert">
                <strong>Conflicts requiring Owner confirmation</strong>
                <ul>
                  {preview.conflicts.map((conflict) => (
                    <li key={conflict.code}>{conflict.message}</li>
                  ))}
                </ul>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmConflicts}
                    onChange={(event) => setConfirmConflicts(event.target.checked)}
                    disabled={!isOwner || busy}
                  />{' '}
                  I confirm these conflicts and want to proceed with merge
                </label>
              </div>
            ) : null}

            {xeroOptions.length > 1 ? (
              <label style={{ display: 'block', marginTop: '0.75rem' }}>
                Keep Xero contact mapping
                <select
                  value={keepXeroContactId}
                  onChange={(event) => setKeepXeroContactId(event.target.value)}
                  disabled={!isOwner || busy}
                >
                  {xeroOptions.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label style={{ display: 'block', marginTop: '0.75rem' }}>
              <input
                type="checkbox"
                checked={selectiveMode}
                onChange={(event) => setSelectiveMode(event.target.checked)}
                disabled={!isOwner || busy}
              />{' '}
              Selectively keep fields
            </label>

            {selectiveMode ? (
              <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                <label>
                  Structural survivor
                  <select
                    value={survivorSide}
                    onChange={(event) => setSurvivorSide(event.target.value as 'left' | 'right')}
                    disabled={!isOwner || busy}
                  >
                    <option value="left">Keep left shell</option>
                    <option value="right">Keep right shell</option>
                  </select>
                </label>
                {(Object.keys(FIELD_LABELS) as CustomerMergeFieldKey[]).map((field) => (
                  <label key={field}>
                    {FIELD_LABELS[field]}
                    <select
                      value={fieldSelection[field] ?? survivorSide}
                      onChange={(event) =>
                        setFieldSelection((prev) => ({
                          ...prev,
                          [field]: event.target.value as 'left' | 'right',
                        }))
                      }
                      disabled={!isOwner || busy}
                    >
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                ))}
              </div>
            ) : null}

            <label style={{ display: 'block', marginTop: '0.75rem' }}>
              Decision notes
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                disabled={!isOwner || busy}
              />
            </label>
          </div>

          {!isOwner ? (
            <p>Office may review candidates. Only Company Owner can dismiss or execute a merge.</p>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              <Button
                disabled={busy || (preview.conflicts.length > 0 && !confirmConflicts)}
                onClick={() => void submitDecision(selectiveMode ? 'selective_fields' : 'keep_left')}
              >
                {selectiveMode ? 'Merge with selected fields' : 'Keep left & merge'}
              </Button>
              {!selectiveMode ? (
                <Button
                  variant="secondary"
                  disabled={busy || (preview.conflicts.length > 0 && !confirmConflicts)}
                  onClick={() => void submitDecision('keep_right')}
                >
                  Keep right & merge
                </Button>
              ) : null}
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void submitDecision('dismiss_not_duplicate')}
              >
                Not a duplicate
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setPreview(null);
                  setSelectedId(null);
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
