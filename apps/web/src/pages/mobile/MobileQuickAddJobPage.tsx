import { FormEvent, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, PageHeader, Panel } from '@titan/ui';
import type { QuickIntakeCustomerMatch, QuickJobUrgency } from '@titan/shared';
import { technicianMaySelfAssign } from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import {
  MobileApiClientError,
  matchMobileIntakePhone,
  technicianQuickAddJob,
} from '../../lib/mobile-api-client';

const URGENCY_OPTIONS: Array<{ value: QuickJobUrgency; label: string }> = [
  { value: 'emergency', label: 'Emergency' },
  { value: 'same_day', label: 'Same day' },
  { value: 'next_available', label: 'Next available' },
  { value: 'scheduled', label: 'Scheduled' },
];

export function MobileQuickAddJobPage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const canSelfAssign = technicianMaySelfAssign({
    roleName: user?.roleName,
    permissions: user?.permissions,
  });

  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [urgency, setUrgency] = useState<QuickJobUrgency>('same_day');
  const [preferredTiming, setPreferredTiming] = useState('');
  const [notes, setNotes] = useState('');
  const [assignToSelf, setAssignToSelf] = useState(false);
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);
  const [matches, setMatches] = useState<QuickIntakeCustomerMatch[]>([]);
  const [matchedCustomerId, setMatchedCustomerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleMatchPhone() {
    if (!accessToken || !phone.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await matchMobileIntakePhone(accessToken, phone.trim());
      setMatches(result.matches);
      setMatchedCustomerId(result.matches[0]?.customerId ?? null);
      if (result.matches[0] && !customerName.trim()) {
        setCustomerName(result.matches[0].customerName);
      }
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Match failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const preferredIso = preferredTiming.trim()
        ? new Date(preferredTiming).toISOString()
        : null;
      const result = await technicianQuickAddJob(accessToken, {
        customerName: customerName.trim(),
        phone: phone.trim(),
        siteAddress: siteAddress.trim(),
        workDescription: workDescription.trim(),
        urgency,
        preferredTiming: preferredIso,
        notes: notes.trim() || null,
        matchedCustomerId,
        assignToSelf: canSelfAssign ? assignToSelf : false,
        overrideDuplicateWarning: overrideDuplicate,
      });
      setMessage(
        result.requiresOfficeConfirmation
          ? 'Job created — office must confirm booking (schedule not silently changed).'
          : 'Job created and assigned to you.',
      );
      if (!result.requiresOfficeConfirmation && result.job.id) {
        navigate(`/jobs/${result.job.id}`);
      }
    } catch (err) {
      const msg = err instanceof MobileApiClientError ? err.message : 'Quick add failed';
      setError(msg);
      if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('open job')) {
        setOverrideDuplicate(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-page">
      <PageHeader
        title="Add job"
        description="Last-minute / emergency field intake. No CRM browse. Phone match only."
      />
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="page-success">{message}</p> : null}

      <Panel title="Customer" description="Match by phone — duplicates avoided when possible">
        <label className="titan-input-group">
          <span className="titan-input-label">Phone *</span>
          <input
            className="titan-input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="082…"
            inputMode="tel"
          />
        </label>
        <Button type="button" disabled={busy || !phone.trim()} onClick={() => void handleMatchPhone()}>
          Match existing customer
        </Button>
        {matches.length > 0 ? (
          <ul className="mobile-visit-list">
            {matches.map((m) => (
              <li key={m.customerId}>
                <label>
                  <input
                    type="radio"
                    name="match"
                    checked={matchedCustomerId === m.customerId}
                    onChange={() => {
                      setMatchedCustomerId(m.customerId);
                      setCustomerName(m.customerName);
                    }}
                  />{' '}
                  {m.customerName} ({m.matchConfidence}) · {m.propertyCount} site(s)
                </label>
              </li>
            ))}
            <li>
              <label>
                <input
                  type="radio"
                  name="match"
                  checked={matchedCustomerId === null}
                  onChange={() => setMatchedCustomerId(null)}
                />{' '}
                Create new customer (controlled — no CRM browse)
              </label>
            </li>
          </ul>
        ) : null}
      </Panel>

      <form onSubmit={(e) => void handleSubmit(e)}>
        <Panel title="Job details">
          <label className="titan-input-group">
            <span className="titan-input-label">Customer name *</span>
            <input
              className="titan-input"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Property / site address *</span>
            <input
              className="titan-input"
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
              placeholder="Suburb or full address"
              required
            />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Work / problem *</span>
            <textarea
              className="titan-input"
              rows={3}
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              required
            />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Urgency *</span>
            <select
              className="titan-input"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as QuickJobUrgency)}
            >
              {URGENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Preferred timing</span>
            <input
              className="titan-input"
              type="datetime-local"
              value={preferredTiming}
              onChange={(e) => setPreferredTiming(e.target.value)}
            />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Notes</span>
            <textarea
              className="titan-input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {canSelfAssign ? (
            <label className="titan-input-group">
              <input
                type="checkbox"
                checked={assignToSelf}
                onChange={(e) => setAssignToSelf(e.target.checked)}
              />{' '}
              Create &amp; assign to myself (authorised)
            </label>
          ) : (
            <p className="page-muted">
              Creates job — needs office confirmation. You cannot alter another technician&apos;s
              schedule.
            </p>
          )}
          {overrideDuplicate ? (
            <label className="titan-input-group">
              <input
                type="checkbox"
                checked={overrideDuplicate}
                onChange={(e) => setOverrideDuplicate(e.target.checked)}
              />{' '}
              Override open-job duplicate warning
            </label>
          ) : null}
          <div className="mobile-action-grid" style={{ marginTop: '0.75rem' }}>
            <Button type="submit" disabled={busy}>
              {assignToSelf && canSelfAssign ? 'Create & assign to me' : 'Create job — needs office'}
            </Button>
            <Link href="/jobs" className="mobile-action-btn">
              Cancel
            </Link>
          </div>
        </Panel>
      </form>
    </div>
  );
}
