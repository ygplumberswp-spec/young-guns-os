import { FormEvent, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, Panel } from '@titan/ui';
import type {
  QuickIntakePrepareResult,
  QuickJobIntakeSource,
  QuickJobUrgency,
} from '@titan/shared';
import { PERSONAL_CALL_INTAKE_PRIVACY } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { prepareOwnerQuickCall, createOwnerQuickCallJob } from '../../lib/jobs-api';
import { useAuth } from '../../lib/auth-context';
import { PageHeader } from '../../components/ux';

export function QuickCallIntakePage() {
  const { accessToken } = useAuth();
  const [, navigate] = useLocation();
  const [phone, setPhone] = useState('');
  const [issue, setIssue] = useState('');
  const [locationText, setLocationText] = useState('');
  const [need, setNeed] = useState('ASAP');
  const [customerName, setCustomerName] = useState('');
  const [source, setSource] = useState<
    Extract<QuickJobIntakeSource, 'owner' | 'office' | 'business_call' | 'personal_call_manual'>
  >('personal_call_manual');
  const [prepared, setPrepared] = useState<QuickIntakePrepareResult | null>(null);
  const [matchedCustomerId, setMatchedCustomerId] = useState<string | null>(null);
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handlePrepare(event?: FormEvent) {
    event?.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const result = await prepareOwnerQuickCall(accessToken, {
        phone: phone.trim(),
        issue: issue.trim(),
        location: locationText.trim() || null,
        need: need.trim() || null,
        customerName: customerName.trim() || null,
        source,
      });
      setPrepared(result);
      setMatchedCustomerId(result.matches[0]?.customerId ?? null);
      if (result.matches[0] && !customerName.trim()) {
        setCustomerName(result.matches[0].customerName);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Prepare failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await createOwnerQuickCallJob(accessToken, {
        phone: phone.trim(),
        issue: issue.trim(),
        location: locationText.trim() || null,
        need: need.trim() || null,
        customerName: customerName.trim() || null,
        source,
        matchedCustomerId,
        urgencyHint: (prepared?.suggestedUrgency as QuickJobUrgency | undefined) ?? null,
        preferredTiming: prepared?.proposal.bestSlotStart ?? null,
        overrideDuplicateWarning: overrideDuplicate,
      });
      setMessage(
        `Job ${result.job.jobNumber ?? result.job.id.slice(0, 8)} created. Best tech proposal: ${
          result.proposal.bestTechnicianName ?? 'office assign'
        }.`,
      );
      navigate(`/jobs/${result.job.id}`);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Create failed';
      setError(msg);
      if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('open job')) {
        setOverrideDuplicate(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="jobs-page">
      <PageHeader
        title="NEW CALL / Quick job"
        description="Seconds-not-forms intake for direct / personal business calls. AURA matches customer & proposes dispatch."
        breadcrumbs={[
          { label: 'Operations', href: '/jobs' },
          { label: 'New call' },
        ]}
      />

      {source === 'personal_call_manual' ? (
        <p className="page-muted" role="note">
          {PERSONAL_CALL_INTAKE_PRIVACY}
        </p>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <form onSubmit={(e) => void handlePrepare(e)}>
        <Panel title="Capture" description="Phone · issue · location · need">
          <label className="titan-input-group">
            <span className="titan-input-label">Source</span>
            <select
              className="titan-input"
              value={source}
              onChange={(e) =>
                setSource(e.target.value as typeof source)
              }
            >
              <option value="personal_call_manual">Personal phone (manual handoff)</option>
              <option value="owner">Owner intake</option>
              <option value="office">Office intake</option>
              <option value="business_call">Business call channel</option>
            </select>
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Phone *</span>
            <input
              className="titan-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="082…"
              required
            />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Issue *</span>
            <input
              className="titan-input"
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              placeholder="burst pipe"
              required
            />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Location</span>
            <input
              className="titan-input"
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              placeholder="Durbanville"
            />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Need</span>
            <input
              className="titan-input"
              value={need}
              onChange={(e) => setNeed(e.target.value)}
              placeholder="ASAP"
            />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Customer name (optional)</span>
            <input
              className="titan-input"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy}>
            AURA prepare (match + propose)
          </Button>
        </Panel>
      </form>

      {prepared ? (
        <Panel title="AURA context" description="Draft → approve → execute remains the default">
          <dl className="jobs-detail-list">
            <div>
              <dt>Suggested urgency</dt>
              <dd>{prepared.suggestedUrgency}</dd>
            </div>
            <div>
              <dt>Best technician</dt>
              <dd>{prepared.proposal.bestTechnicianName ?? '—'}</dd>
            </div>
            <div>
              <dt>Best slot</dt>
              <dd>
                {prepared.proposal.bestSlotStart
                  ? new Date(prepared.proposal.bestSlotStart).toLocaleString()
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Arrival window</dt>
              <dd>{prepared.proposal.expectedArrivalWindow ?? '—'}</dd>
            </div>
            <div>
              <dt>Overlap blocked</dt>
              <dd>{prepared.proposal.overlapBlocked ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt>Cartrack</dt>
              <dd>{prepared.proposal.cartrackUsed ? 'Connected' : 'Not connected'}</dd>
            </div>
            <div>
              <dt>Rationale</dt>
              <dd>{prepared.proposal.rationale}</dd>
            </div>
          </dl>

          {prepared.matches.length > 0 ? (
            <>
              <p className="page-muted">Matched customers (phone only — not CRM browse)</p>
              <ul>
                {prepared.matches.map((m) => (
                  <li key={m.customerId}>
                    <label>
                      <input
                        type="radio"
                        name="cust"
                        checked={matchedCustomerId === m.customerId}
                        onChange={() => setMatchedCustomerId(m.customerId)}
                      />{' '}
                      {m.customerName} · {m.matchConfidence}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="page-muted">No existing customer match — create on confirm.</p>
          )}

          {prepared.openJobWarnings.length > 0 ? (
            <div>
              <p className="form-error">Open job warning</p>
              <ul>
                {prepared.openJobWarnings.map((w) => (
                  <li key={w.jobId}>
                    {w.jobNumber ?? w.jobId.slice(0, 8)} — {w.reason}{' '}
                    <Link href={`/jobs/${w.jobId}`}>Open</Link>
                  </li>
                ))}
              </ul>
              <label>
                <input
                  type="checkbox"
                  checked={overrideDuplicate}
                  onChange={(e) => setOverrideDuplicate(e.target.checked)}
                />{' '}
                Override and create anyway
              </label>
            </div>
          ) : null}

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
            <Button type="button" disabled={busy} onClick={() => void handleCreate()}>
              Create job + keep proposal
            </Button>
            <Link href="/voice-ai-receptionist">Voice AI Receptionist</Link>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
