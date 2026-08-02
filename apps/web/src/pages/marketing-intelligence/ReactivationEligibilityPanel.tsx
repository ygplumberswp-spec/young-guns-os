import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearch } from 'wouter';
import { Button, EmptyState, LoadingState, Panel, StatCard } from '@titan/ui';
import type {
  BuyerClassificationSummary,
  ContactFieldKey,
  CustomerContactFieldSummary,
  CustomerMarketingConsentSummary,
  MarketingAudienceRequestSummary,
  MarketingConsentChannel,
  MarketingConsentStatus,
  ReactivationEligibilityCounts,
  ReactivationEligibilitySummary,
  XeroContactSyncBackRequestSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  approveAudienceRequest,
  correctCustomerContact,
  createAudienceRequest,
  createXeroSyncBackRequest,
  ensureContactQuality,
  fetchAudienceRequests,
  fetchClassifications,
  fetchConsents,
  fetchContactFields,
  fetchEligibility,
  fetchEligibilityCounts,
  fetchHumanQualityContentStandard,
  fetchXeroSyncBackRequests,
  recomputeClassifications,
  recomputeEligibility,
  rejectAudienceRequest,
  submitAudienceRequestForApproval,
  upsertConsent,
} from '../../lib/marketing-eligibility-api-client';
import { useAuth } from '../../lib/auth-context';
import { fetchDraft } from '../../lib/drafts-api';
import { AutosaveIndicator } from '../../components/ux/AutosaveIndicator';
import { DraftRestoreBanner } from '../../components/ux/DraftRestoreBanner';
import { useFormDraftShell } from '../../hooks/useFormDraftShell';

const CONTACT_FIELD_OPTIONS: Array<{ value: ContactFieldKey; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'contact_person', label: 'Contact Person' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
];

const CONSENT_CHANNEL_OPTIONS: Array<{ value: MarketingConsentChannel; label: string }> = [
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'Business WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'phone', label: 'Phone' },
];

const CONSENT_STATUS_OPTIONS: Array<{ value: MarketingConsentStatus; label: string }> = [
  { value: 'unknown', label: 'Unknown (Not Consent)' },
  { value: 'granted', label: 'Granted' },
  { value: 'denied', label: 'Denied' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'do_not_contact', label: 'Do Not Contact' },
];

type HumanQualityStandard = {
  id: string;
  title: string;
  requirements: string[];
};

function isHumanQualityStandard(value: unknown): value is HumanQualityStandard {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'requirements' in (value as Record<string, unknown>) &&
    Array.isArray((value as Record<string, unknown>).requirements),
  );
}

function formatStatusLabel(status: string) {
  return status.replace(/_/g, ' ');
}

function isCompanyOwnerRoleName(roleName: string) {
  return roleName === 'Company Owner' || roleName === 'Owner';
}

export function ReactivationEligibilityPanel() {
  const { accessToken, user } = useAuth();
  const search = useSearch();
  const permissions = user?.permissions ?? [];
  const roleName = user?.roleName ?? '';

  const canRecompute = useMemo(
    () =>
      permissions.includes('marketing:write') ||
      permissions.includes('marketing_intelligence:write') ||
      permissions.includes('finance:write') ||
      permissions.includes('*'),
    [permissions],
  );
  const canCorrectContact = useMemo(
    () => permissions.includes('customers:write') || permissions.includes('*'),
    [permissions],
  );
  const canUpdateConsent = useMemo(
    () =>
      permissions.includes('marketing:write') ||
      permissions.includes('marketing_intelligence:write') ||
      permissions.includes('*'),
    [permissions],
  );
  const canCreateAudience = canUpdateConsent;
  const canApproveAudience = useMemo(
    () =>
      isCompanyOwnerRoleName(roleName) ||
      permissions.includes('marketing_intelligence:manage') ||
      permissions.includes('*'),
    [permissions, roleName],
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [classifications, setClassifications] = useState<BuyerClassificationSummary[]>([]);
  const [eligibility, setEligibility] = useState<ReactivationEligibilitySummary[]>([]);
  const [counts, setCounts] = useState<ReactivationEligibilityCounts | null>(null);
  const [audienceRequests, setAudienceRequests] = useState<MarketingAudienceRequestSummary[]>([]);
  const [standard, setStandard] = useState<HumanQualityStandard | null>(null);

  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [contactFields, setContactFields] = useState<CustomerContactFieldSummary[]>([]);
  const [consents, setConsents] = useState<CustomerMarketingConsentSummary[]>([]);
  const [syncBackRequests, setSyncBackRequests] = useState<XeroContactSyncBackRequestSummary[]>([]);

  const [contactFieldKey, setContactFieldKey] = useState<ContactFieldKey>('email');
  const [contactValue, setContactValue] = useState('');
  const [contactMarkVerified, setContactMarkVerified] = useState(false);
  const [contactReason, setContactReason] = useState('');

  const [consentChannel, setConsentChannel] = useState<MarketingConsentChannel>('email');
  const [consentStatus, setConsentStatus] = useState<MarketingConsentStatus>('granted');
  const [consentReason, setConsentReason] = useState('');

  const [audienceName, setAudienceName] = useState('');
  const [audienceNotes, setAudienceNotes] = useState('');
  const [pendingDraft, setPendingDraft] = useState<{
    id: string;
    title: string | null;
    lastEditedAt: string;
    payload: Record<string, unknown>;
  } | null>(null);
  const draftShell = useFormDraftShell({
    accessToken,
    userId: user?.id,
    recordType: 'marketing',
    enabled: canCreateAudience,
    getPayload: () => ({
      audienceName,
      audienceNotes,
      draftKind: 'audience_request',
    }),
    getMeta: () => ({ title: audienceName.trim() || 'New audience request' }),
  });

  async function loadAll() {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [classificationList, eligibilityList, eligibilityCounts, requests, contentStandard] =
        await Promise.all([
          fetchClassifications(accessToken),
          fetchEligibility(accessToken),
          fetchEligibilityCounts(accessToken),
          fetchAudienceRequests(accessToken),
          fetchHumanQualityContentStandard(accessToken),
        ]);
      setClassifications(classificationList);
      setEligibility(eligibilityList);
      setCounts(eligibilityCounts);
      setAudienceRequests(requests);
      setStandard(isHumanQualityStandard(contentStandard) ? contentStandard : null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load reactivation data');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;
    async function loadDraft() {
      if (!accessToken) return;
      const draftId = new URLSearchParams(search).get('draftId');
      if (!draftId) return;
      try {
        const draft = await fetchDraft(accessToken, draftId);
        if (
          cancelled ||
          draft.recordType !== 'marketing' ||
          draft.payload.draftKind !== 'audience_request'
        )
          return;
        setPendingDraft({
          id: draft.id,
          title: draft.title,
          lastEditedAt: draft.lastEditedAt,
          payload: draft.payload,
        });
      } catch {
        /* Ignore unavailable drafts. */
      }
    }
    void loadDraft();
    return () => {
      cancelled = true;
    };
  }, [accessToken, search]);

  function applyDraftPayload(payload: Record<string, unknown>) {
    if (typeof payload.audienceName === 'string') setAudienceName(payload.audienceName);
    if (typeof payload.audienceNotes === 'string') setAudienceNotes(payload.audienceNotes);
    draftShell.touchField();
  }

  async function loadCustomerDetail(customerId: string) {
    if (!accessToken) return;
    try {
      const [fields, customerConsents, syncBack] = await Promise.all([
        fetchContactFields(accessToken, customerId),
        fetchConsents(accessToken, customerId),
        fetchXeroSyncBackRequests(accessToken, customerId),
      ]);
      setContactFields(fields);
      setConsents(customerConsents);
      setSyncBackRequests(syncBack);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load customer detail');
    }
  }

  function selectCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    setContactReason('');
    setConsentReason('');
    void loadCustomerDetail(customerId);
  }

  async function runAction(action: () => Promise<unknown>, message: string) {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      setSuccess(message);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleRecomputeClassifications() {
    await runAction(async () => {
      const result = await recomputeClassifications(accessToken!);
      setClassifications(result);
    }, 'Buyer classifications recomputed from real invoice evidence.');
  }

  async function handleRecomputeEligibility() {
    await runAction(async () => {
      const result = await recomputeEligibility(accessToken!);
      setEligibility(result);
      setCounts(await fetchEligibilityCounts(accessToken!));
    }, 'Reactivation eligibility recomputed.');
  }

  async function handleEnsureContactQuality(customerId: string) {
    await runAction(async () => {
      await ensureContactQuality(accessToken!, customerId);
      await loadCustomerDetail(customerId);
    }, 'Contact quality seeded from customer record.');
  }

  async function handleCorrectContact() {
    if (!selectedCustomerId || !contactReason.trim()) return;
    await runAction(async () => {
      await correctCustomerContact(accessToken!, selectedCustomerId, {
        fieldKey: contactFieldKey,
        value: contactValue.trim() ? contactValue.trim() : null,
        reason: contactReason.trim(),
        markVerified: contactMarkVerified,
      });
      await loadCustomerDetail(selectedCustomerId);
      setContactValue('');
      setContactReason('');
      setContactMarkVerified(false);
    }, 'Contact corrected in TITAN (never synced to Xero automatically).');
  }

  async function handleUpsertConsent() {
    if (!selectedCustomerId || !consentReason.trim()) return;
    await runAction(async () => {
      await upsertConsent(accessToken!, selectedCustomerId, {
        channel: consentChannel,
        status: consentStatus,
        reason: consentReason.trim(),
      });
      await loadCustomerDetail(selectedCustomerId);
      setConsentReason('');
    }, 'Marketing consent updated.');
  }

  async function handleRequestXeroSyncBack() {
    if (!selectedCustomerId) return;
    await runAction(async () => {
      const created = await createXeroSyncBackRequest(accessToken!, {
        customerId: selectedCustomerId,
        requestedFields: ['name', 'email', 'phone', 'contact_person'],
        notes: 'Requested from reactivation eligibility panel',
      });
      setSyncBackRequests((current) => [created, ...current]);
    }, 'Xero sync-back requested — TITAN does not call Xero for this; a human/provider step will follow later.');
  }

  async function handleCreateAudienceRequest() {
    if (!audienceName.trim()) return;
    await runAction(async () => {
      const created = await createAudienceRequest(accessToken!, {
        name: audienceName.trim(),
        notes: audienceNotes.trim() || null,
      });
      setAudienceRequests((current) => [created, ...current]);
      setAudienceName('');
      setAudienceNotes('');
      draftShell.markSubmitted();
    }, `Audience request created with ${audienceName.trim()} — delivery state stays "not sent".`);
  }

  async function handleSubmitAudienceRequest(requestId: string) {
    await runAction(async () => {
      const updated = await submitAudienceRequestForApproval(accessToken!, requestId);
      setAudienceRequests((current) =>
        current.map((request) => (request.id === requestId ? updated : request)),
      );
    }, 'Audience request submitted for approval.');
  }

  async function handleApproveAudienceRequest(requestId: string) {
    await runAction(async () => {
      const updated = await approveAudienceRequest(accessToken!, requestId);
      setAudienceRequests((current) =>
        current.map((request) => (request.id === requestId ? updated : request)),
      );
    }, 'Audience request approved. Delivery state remains "not sent" — no provider send exists yet.');
  }

  async function handleRejectAudienceRequest(requestId: string) {
    const reason = window.prompt('Rejection reason (required):');
    if (!reason || !reason.trim()) return;
    await runAction(async () => {
      const updated = await rejectAudienceRequest(accessToken!, requestId, reason.trim());
      setAudienceRequests((current) =>
        current.map((request) => (request.id === requestId ? updated : request)),
      );
    }, 'Audience request rejected.');
  }

  const selectedEligibility = eligibility.find((row) => row.customerId === selectedCustomerId);

  return (
    <div className="reactivation-eligibility">
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel
        title="Accrec Buyer Classification & Reactivation Eligibility"
        description="Real paid-invoice evidence only — contact existence is never treated as buyer proof (Decision 3 / FIN-006, UX-H)."
      >
        {canRecompute ? (
          <div className="panel-actions">
            <Button disabled={isWorking} onClick={() => void handleRecomputeClassifications()}>
              Recompute classifications
            </Button>
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() => void handleRecomputeEligibility()}
            >
              Recompute eligibility
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <LoadingState label="Loading Reactivation Eligibility…" />
        ) : (
          <>
            {counts ? (
              <div className="stat-grid">
                <StatCard label="Eligible" value={String(counts.eligible)} />
                <StatCard
                  label="Awaiting Verification"
                  value={String(counts.awaitingVerification)}
                />
                <StatCard label="Blocked" value={String(counts.blocked)} />
                <StatCard label="Excluded" value={String(counts.excluded)} />
              </div>
            ) : null}

            {eligibility.length === 0 ? (
              <EmptyState
                title="No Eligibility Data Yet"
                description="Run classification and eligibility recompute to evaluate customers for reactivation marketing."
              />
            ) : (
              <div className="reactivation-table-wrap">
                <table className="reactivation-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Classification</th>
                      <th>Eligibility</th>
                      <th>Preferred channel</th>
                      <th>Contact quality</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligibility.map((row) => (
                      <Fragment key={row.id}>
                        <tr
                          className={
                            selectedCustomerId === row.customerId ? 'is-selected' : undefined
                          }
                        >
                          <td>{row.customerName}</td>
                          <td>
                            {row.classification ? formatStatusLabel(row.classification) : '—'}
                          </td>
                          <td>
                            <span
                              className={`reactivation-status reactivation-status--${row.eligibilityStatus}`}
                            >
                              {formatStatusLabel(row.eligibilityStatus)}
                            </span>
                          </td>
                          <td>{row.preferredChannel ?? '—'}</td>
                          <td>
                            {row.emailVerificationState === 'placeholder' ? (
                              <span className="form-error">Placeholder email</span>
                            ) : (
                              <span className="page-muted">
                                email: {row.emailVerificationState ?? 'unknown'} · phone:{' '}
                                {row.phoneVerificationState ?? 'unknown'}
                              </span>
                            )}
                            {row.doNotContact ? (
                              <span className="form-error"> · Do not contact</span>
                            ) : null}
                          </td>
                          <td>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setExpandedCustomerId(
                                  expandedCustomerId === row.customerId ? null : row.customerId,
                                )
                              }
                            >
                              {expandedCustomerId === row.customerId ? 'Hide reasons' : 'Reasons'}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => selectCustomer(row.customerId)}
                            >
                              Manage
                            </Button>
                          </td>
                        </tr>
                        {expandedCustomerId === row.customerId ? (
                          <tr>
                            <td colSpan={6}>
                              <ul className="simple-list">
                                {row.reasons.map((reason, index) => (
                                  <li key={`${row.id}-reason-${index}`}>
                                    <strong>{reason.code}</strong> — {reason.detail}
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Panel>

      {selectedCustomerId ? (
        <Panel
          title={`Contact quality & consent — ${selectedEligibility?.customerName ?? 'customer'}`}
          description="Corrections and consent changes are recorded in TITAN only — never synced live to Xero, WhatsApp, or email/SMS providers."
        >
          <div className="panel-actions">
            <Button
              variant="secondary"
              size="sm"
              disabled={isWorking}
              onClick={() => void handleEnsureContactQuality(selectedCustomerId)}
            >
              Seed contact quality from customer record
            </Button>
          </div>

          <h3>Contact fields</h3>
          {contactFields.length === 0 ? (
            <p className="page-muted">No contact field quality data yet.</p>
          ) : (
            <ul className="simple-list">
              {contactFields.map((field) => (
                <li key={field.id}>
                  <strong>{field.fieldKey}</strong>: {field.value ?? '—'} ·{' '}
                  <span
                    className={
                      field.verificationState === 'placeholder' ? 'form-error' : 'page-muted'
                    }
                  >
                    {field.verificationState}
                  </span>
                  {field.isSharedCompanyEmail ? ' · shared company inbox' : ''}
                </li>
              ))}
            </ul>
          )}

          {canCorrectContact ? (
            <div className="stack-form">
              <h4>Correct a contact field</h4>
              <label className="titan-input-group">
                <span className="titan-input-label">Field</span>
                <select
                  className="titan-input"
                  value={contactFieldKey}
                  onChange={(event) => setContactFieldKey(event.target.value as ContactFieldKey)}
                >
                  {CONTACT_FIELD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="titan-input-group">
                <span className="titan-input-label">New value</span>
                <input
                  className="titan-input"
                  value={contactValue}
                  onChange={(event) => setContactValue(event.target.value)}
                  placeholder="Leave blank to clear"
                />
              </label>
              <label className="titan-checkbox">
                <input
                  type="checkbox"
                  checked={contactMarkVerified}
                  onChange={(event) => setContactMarkVerified(event.target.checked)}
                />
                Mark verified (staff confirmed this value with the customer)
              </label>
              <label className="titan-input-group">
                <span className="titan-input-label">Reason (required)</span>
                <input
                  className="titan-input"
                  value={contactReason}
                  onChange={(event) => setContactReason(event.target.value)}
                  placeholder="Why is this correction being made?"
                  required
                />
              </label>
              <Button
                disabled={isWorking || !contactReason.trim()}
                onClick={() => void handleCorrectContact()}
              >
                Save correction
              </Button>
            </div>
          ) : null}

          <h3>Marketing consent per channel</h3>
          {consents.length === 0 ? (
            <p className="page-muted">
              No consent captured yet — missing/unknown consent is never treated as granted.
            </p>
          ) : (
            <ul className="simple-list">
              {consents.map((consent) => (
                <li key={consent.id}>
                  <strong>{consent.channel}</strong>: {formatStatusLabel(consent.status)}
                  {consent.capturedAt
                    ? ` · captured ${new Date(consent.capturedAt).toLocaleDateString()}`
                    : ''}
                  {consent.withdrawnAt
                    ? ` · withdrawn ${new Date(consent.withdrawnAt).toLocaleDateString()}`
                    : ''}
                </li>
              ))}
            </ul>
          )}

          {canUpdateConsent ? (
            <div className="stack-form">
              <h4>Update consent</h4>
              <label className="titan-input-group">
                <span className="titan-input-label">Channel</span>
                <select
                  className="titan-input"
                  value={consentChannel}
                  onChange={(event) =>
                    setConsentChannel(event.target.value as MarketingConsentChannel)
                  }
                >
                  {CONSENT_CHANNEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="titan-input-group">
                <span className="titan-input-label">Status</span>
                <select
                  className="titan-input"
                  value={consentStatus}
                  onChange={(event) =>
                    setConsentStatus(event.target.value as MarketingConsentStatus)
                  }
                >
                  {CONSENT_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="titan-input-group">
                <span className="titan-input-label">Reason (required)</span>
                <input
                  className="titan-input"
                  value={consentReason}
                  onChange={(event) => setConsentReason(event.target.value)}
                  placeholder="Why is this consent change being recorded?"
                  required
                />
              </label>
              <Button
                disabled={isWorking || !consentReason.trim()}
                onClick={() => void handleUpsertConsent()}
              >
                Save consent
              </Button>
            </div>
          ) : null}

          <h3>Xero contact sync-back</h3>
          <p className="page-muted">
            This does not call Xero. It only records a request for a future human or provider-backed
            sync-back step.
          </p>
          {syncBackRequests.length === 0 ? (
            <p className="page-muted">No sync-back requests yet.</p>
          ) : (
            <ul className="simple-list">
              {syncBackRequests.map((requestItem) => (
                <li key={requestItem.id}>
                  {requestItem.requestedFields.join(', ')} — {formatStatusLabel(requestItem.status)}{' '}
                  · never called Xero
                </li>
              ))}
            </ul>
          )}
          {canCorrectContact ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() => void handleRequestXeroSyncBack()}
            >
              Request Xero sync-back (does not call Xero)
            </Button>
          ) : null}
        </Panel>
      ) : null}

      <Panel
        title="Audience Requests (Never Sent)"
        description='Draft → submit → approve. Delivery state always stays "not sent" in this release — no live provider send exists yet.'
      >
        {canCreateAudience ? (
          <div className="stack-form">
            <AutosaveIndicator
              status={draftShell.autosave.status}
              lastSavedAt={draftShell.autosave.lastSavedAt}
            />
            {pendingDraft ? (
              <DraftRestoreBanner
                title={pendingDraft.title}
                lastEditedAt={pendingDraft.lastEditedAt}
                onRestore={() => {
                  applyDraftPayload(pendingDraft.payload);
                  setPendingDraft(null);
                }}
                onDismiss={() => setPendingDraft(null)}
              />
            ) : null}
            <label className="titan-input-group">
              <span className="titan-input-label">Audience name</span>
              <input
                className="titan-input"
                value={audienceName}
                onChange={(event) => {
                  setAudienceName(event.target.value);
                  draftShell.touchField();
                }}
                placeholder="e.g. Inactive paid buyers — email opt-in"
              />
            </label>
            <label className="titan-input-group">
              <span className="titan-input-label">Notes</span>
              <input
                className="titan-input"
                value={audienceNotes}
                onChange={(event) => {
                  setAudienceNotes(event.target.value);
                  draftShell.touchField();
                }}
              />
            </label>
            <Button
              disabled={isWorking || !audienceName.trim()}
              onClick={() => void handleCreateAudienceRequest()}
            >
              Create audience request from current eligible members
            </Button>
          </div>
        ) : null}

        {audienceRequests.length === 0 ? (
          <EmptyState
            title="No Audience Requests"
            description="Create a request from currently eligible members to start the approval flow."
          />
        ) : (
          <ul className="simple-list">
            {audienceRequests.map((request) => (
              <li key={request.id}>
                <strong>{request.name}</strong> — {formatStatusLabel(request.status)} ·{' '}
                {request.memberCount} member(s) · delivery: {request.deliveryState}
                <div className="panel-actions">
                  {request.status === 'draft' && canCreateAudience ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isWorking}
                      onClick={() => void handleSubmitAudienceRequest(request.id)}
                    >
                      Submit for approval
                    </Button>
                  ) : null}
                  {request.status === 'pending_approval' && canApproveAudience ? (
                    <Button
                      size="sm"
                      disabled={isWorking}
                      onClick={() => void handleApproveAudienceRequest(request.id)}
                    >
                      Approve
                    </Button>
                  ) : null}
                  {(request.status === 'draft' || request.status === 'pending_approval') &&
                  canCreateAudience ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isWorking}
                      onClick={() => void handleRejectAudienceRequest(request.id)}
                    >
                      Reject
                    </Button>
                  ) : null}
                </div>
                {request.rejectionReason ? (
                  <p className="page-muted">Rejected: {request.rejectionReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {classifications.length > 0 ? (
        <Panel
          title="Classification Evidence"
          description="Every classification is backed by real invoice evidence, never contact existence alone."
        >
          <ul className="simple-list">
            {classifications.map((classification) => (
              <li key={classification.id}>
                <strong>{classification.customerName}</strong> —{' '}
                {formatStatusLabel(classification.primaryClassification)} ·{' '}
                {classification.paidInvoiceCount} paid / {classification.qualifyingInvoiceCount}{' '}
                qualifying invoice(s)
                <p className="page-muted">{classification.reason}</p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {standard ? (
        <Panel
          title={standard.title}
          description="Future marketing content requirement — not enforced by this eligibility engine yet."
        >
          <ul className="simple-list">
            {standard.requirements.map((requirement, index) => (
              <li key={`${standard.id}-${index}`}>{requirement}</li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
