import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { Button, Input, LoadingState, Panel } from '@titan/ui';
import {
  JOB_PRIORITY_OPTIONS,
  JOB_TYPE_OPTIONS,
  LEAD_STATUS_OPTIONS,
  isValidSaMobile,
  normalizeSaMobile,
  type ConvertLeadRequest,
  type LeadStatus,
  type LeadUrgency,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { fetchCustomerProperties, fetchCustomers } from '../../lib/crm-api';
import {
  checkLeadDuplicates,
  convertLead,
  fetchLeadDetail,
  updateLead,
} from '../../lib/leads-api';
import { fetchTeamMembers } from '../../lib/team-api';
import { useCachedQuery } from '../../lib/use-cached-query';
import {
  buildLeadConversionProperty,
  canConvertLeads,
  canCreateJobFromLead,
  canManageLeads,
  leadHasConvertibleSiteAddress,
  newClientActionId,
} from '../../features/leads/utils';

export function LeadDetailPage() {
  const [, params] = useRoute('/leads/:id');
  const leadId = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();

  const canWrite = user ? canManageLeads(user.permissions) : false;
  const canConvert = user ? canConvertLeads(user.permissions) : false;
  const canCreateJob = user ? canCreateJobFromLead(user.permissions) : false;

  const {
    data: lead,
    error,
    isLoading,
    refetch,
  } = useCachedQuery({
    queryKey: `leads/detail:${leadId}`,
    accessToken,
    enabled: Boolean(leadId && accessToken),
    staleTimeMs: 5_000,
    fetcher: async () => fetchLeadDetail(accessToken!, leadId),
  });

  const [status, setStatus] = useState<LeadStatus>('new');
  const [lostReason, setLostReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDue, setNextActionDue] = useState('');
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const [showConvert, setShowConvert] = useState(false);
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('new');
  const [customerId, setCustomerId] = useState('');
  const [propertyMode, setPropertyMode] = useState<'existing' | 'new' | 'none'>('new');
  const [propertyId, setPropertyId] = useState('');
  const [createJob, setCreateJob] = useState(false);
  const [jobType, setJobType] = useState<string>(JOB_TYPE_OPTIONS[0]);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<LeadUrgency>('normal');
  const [appointmentLocal, setAppointmentLocal] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [siteMobile, setSiteMobile] = useState('');
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState('');
  const [clientActionId] = useState(() => newClientActionId());
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertSummary, setConvertSummary] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [confirmReady, setConfirmReady] = useState(false);

  useEffect(() => {
    if (!lead) return;
    setStatus(lead.status);
    setLostReason(lead.lostReason ?? '');
    setReopenReason(lead.reopenReason ?? '');
    setNextAction(lead.nextAction ?? '');
    setNextActionDue(
      lead.nextActionDueAt ? new Date(lead.nextActionDueAt).toISOString().slice(0, 16) : '',
    );
    setDescription(lead.notes ?? '');
    setJobType(lead.serviceType || JOB_TYPE_OPTIONS[0]);
    setPriority(lead.urgency);
    setSiteMobile(lead.contactPhoneE164 || lead.contactPhone || '');
    setAssignedUserId(lead.assignedUserId ?? '');
    setAppointmentLocal(
      lead.preferredAppointmentAt
        ? new Date(lead.preferredAppointmentAt).toISOString().slice(0, 16)
        : '',
    );
    setCreateJob(canCreateJob && leadHasConvertibleSiteAddress(lead));
    if (lead.customerId) {
      setCustomerMode('existing');
      setCustomerId(lead.customerId);
    }
  }, [canCreateJob, lead]);

  const { data: customers } = useCachedQuery({
    queryKey: 'crm/customers',
    accessToken,
    enabled: showConvert && canConvert,
    staleTimeMs: 30_000,
    fetcher: async () => fetchCustomers(accessToken!),
  });

  const { data: properties } = useCachedQuery({
    queryKey: `crm/properties:${customerId}`,
    accessToken,
    enabled: showConvert && canConvert && customerMode === 'existing' && Boolean(customerId),
    staleTimeMs: 20_000,
    fetcher: async () => fetchCustomerProperties(accessToken!, customerId),
  });

  const { data: members } = useCachedQuery({
    queryKey: 'team/members',
    accessToken,
    enabled: showConvert && canConvert,
    staleTimeMs: 60_000,
    fetcher: async () => fetchTeamMembers(accessToken!),
  });

  const confirmationPreview = useMemo(() => {
    if (!lead) return null;
    return {
      customer:
        customerMode === 'existing'
          ? customers?.find((c) => c.id === customerId)?.name ?? 'Selected customer'
          : lead.companyName || lead.contactName,
      property:
        propertyMode === 'existing'
          ? properties?.find((p) => p.id === propertyId)?.propertyName ?? 'Selected property'
          : propertyMode === 'none'
            ? 'No property'
            : `${lead.suburb || 'Suburb'} — ${lead.street || 'Street'}`,
      job: createJob ? `${jobType} → auto JOB-###### title` : 'Convert without job',
      appointment: appointmentLocal || lead.preferredAppointmentAt || 'Not set',
    };
  }, [
    lead,
    customerMode,
    customers,
    customerId,
    propertyMode,
    properties,
    propertyId,
    createJob,
    jobType,
    appointmentLocal,
  ]);

  async function onUpdateStatus(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !lead) return;
    setStatusError(null);
    setIsUpdating(true);
    try {
      await updateLead(accessToken, lead.id, {
        status,
        lostReason: lostReason.trim() || null,
        reopenReason: reopenReason.trim() || null,
        nextAction: nextAction.trim() || null,
        nextActionDueAt: nextActionDue ? new Date(nextActionDue).toISOString() : null,
      });
      await refetch();
    } catch (err) {
      setStatusError(err instanceof ApiClientError ? err.message : 'Unable to update lead');
    } finally {
      setIsUpdating(false);
    }
  }

  async function onConvert(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !lead || !canConvert) return;
    setConvertError(null);

    if (createJob && !canCreateJob) {
      setConvertError('Job write permission is required to create a job during conversion');
      return;
    }
    if (createJob && !siteMobile.trim()) {
      setConvertError('Site contact mobile is required to create a job');
      return;
    }
    if (createJob && !isValidSaMobile(siteMobile)) {
      setConvertError('Site contact mobile must be a valid SA mobile number');
      return;
    }
    if (
      (propertyMode === 'new' || createJob) &&
      propertyMode !== 'existing' &&
      propertyMode !== 'none' &&
      !leadHasConvertibleSiteAddress(lead)
    ) {
      setConvertError(
        'Add a site street and suburb on the lead before creating a property or job. Data must carry from the lead — placeholder addresses are not allowed.',
      );
      return;
    }
    if (createJob && propertyMode === 'none') {
      setConvertError('Select or create a property before creating a job');
      return;
    }
    if (!confirmReady) {
      setConvertError('Review the confirmation summary and confirm before converting');
      return;
    }

    setIsConverting(true);
    try {
      const dupes = await checkLeadDuplicates(accessToken, {
        contactName: lead.contactName,
        companyName: lead.companyName,
        contactEmail: lead.contactEmail,
        contactPhone: lead.contactPhone,
        street: lead.street,
        suburb: lead.suburb,
        excludeLeadId: lead.id,
      });
      const high = dupes.matches.filter((m) => m.score >= 90);
      if (high.length > 0 && customerMode === 'new' && !duplicateOverrideReason.trim()) {
        setConvertError(
          'Possible duplicate customers/leads found. Choose an existing customer or provide an override reason.',
        );
        setIsConverting(false);
        return;
      }

      const newProperty =
        propertyMode === 'new' ? buildLeadConversionProperty(lead) : null;
      if (propertyMode === 'new' && !newProperty) {
        setConvertError(
          'Add a site street and suburb on the lead before creating a property or job.',
        );
        setIsConverting(false);
        return;
      }

      const payload: ConvertLeadRequest = {
        clientActionId,
        customerMode,
        customerId: customerMode === 'existing' ? customerId : null,
        newCustomer:
          customerMode === 'new'
            ? {
                name: lead.companyName || lead.contactName,
                email: lead.contactEmail,
                phone: lead.contactPhoneE164 || lead.contactPhone,
                notes: lead.notes,
              }
            : null,
        propertyMode,
        propertyId: propertyMode === 'existing' ? propertyId : null,
        newProperty,
        createJob: createJob && canCreateJob,
        job: createJob && canCreateJob
          ? {
              jobType,
              description: description.trim() || lead.notes || `${jobType} from lead`,
              priority,
              preferredAppointmentAt: appointmentLocal
                ? new Date(appointmentLocal).toISOString()
                : lead.preferredAppointmentAt,
              assignedUserId: assignedUserId || null,
              accessInstructions: lead.accessInstructions,
              notes: lead.notes,
              siteContactName: lead.contactName,
              siteContactMobile: normalizeSaMobile(siteMobile) || siteMobile,
              siteContactEmail: lead.contactEmail,
            }
          : null,
        duplicateResolution: high.length > 0 && customerMode === 'existing'
          ? 'use_existing_customer'
          : duplicateOverrideReason.trim()
            ? 'override'
            : 'create_new',
        duplicateOverrideReason: duplicateOverrideReason.trim() || null,
      };

      const result = await convertLead(accessToken, lead.id, payload);
      setConvertSummary(
        [
          result.idempotentReplay ? 'Idempotent replay — no duplicates created.' : 'Conversion complete.',
          `Customer: ${result.confirmation.customerName}`,
          result.jobNumber ? `Job: ${result.jobNumber}` : 'No job created',
          result.dispatchNotificationSent ? 'Dispatch handoff notified.' : null,
        ]
          .filter(Boolean)
          .join(' '),
      );
      await refetch();
      if (result.jobId) {
        navigate(`/jobs/${result.jobId}`);
      } else if (result.customerId) {
        navigate(`/crm/${result.customerId}`);
      }
    } catch (err) {
      setConvertError(err instanceof ApiClientError ? err.message : 'Conversion failed');
    } finally {
      setIsConverting(false);
    }
  }

  if (isLoading) {
    return <LoadingState label="Loading lead…" />;
  }

  if (error || !lead) {
    return (
      <div className="page-shell">
        <PageHeader title="Lead" description={error || 'Lead not found'} />
      </div>
    );
  }

  return (
    <div className="page-shell leads-detail-page">
      <PageHeader
        title={lead.companyName || lead.contactName}
        description={lead.title}
        actions={
          <div className="page-header-actions">
            <Link href="/leads">
              <Button variant="ghost" size="sm">
                All leads
              </Button>
            </Link>
            {canConvert && lead.status !== 'converted' ? (
              <Button variant="primary" size="sm" onClick={() => setShowConvert((v) => !v)}>
                {showConvert ? 'Hide conversion' : 'Convert lead'}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="leads-detail-grid">
        <Panel title="Contact & property">
          <dl className="detail-list">
            <div>
              <dt>Contact</dt>
              <dd>{lead.contactName}</dd>
            </div>
            <div>
              <dt>Mobile</dt>
              <dd>{lead.contactPhoneE164 || lead.contactPhone || '—'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>
                {lead.contactEmail || '—'}
                {lead.emailIsPlaceholder ? ' (placeholder)' : ''}
              </dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{lead.addressDisplay || '—'}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>{lead.accessInstructions || '—'}</dd>
            </div>
            <div>
              <dt>Consents</dt>
              <dd>
                Operational: {lead.operationalContactPermission ? 'yes' : 'no'}; Marketing:{' '}
                {lead.marketingConsent ? 'yes' : 'no'}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Enquiry & qualification">
          <dl className="detail-list">
            <div>
              <dt>Service</dt>
              <dd>{lead.serviceType || '—'}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{lead.sourceName || '—'}</dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>{lead.urgency}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {LEAD_STATUS_OPTIONS.find((o) => o.value === lead.status)?.label ?? lead.status}
                {lead.isOverdue ? ' · Overdue' : ''}
              </dd>
            </div>
            <div>
              <dt>Assigned</dt>
              <dd>{lead.assignedUserName || '—'}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{lead.notes || '—'}</dd>
            </div>
          </dl>
          {lead.customerId || lead.jobId ? (
            <div className="page-header-actions">
              {lead.customerId ? (
                <Link href={`/crm/${lead.customerId}`}>
                  <Button variant="secondary" size="sm">
                    Open customer
                  </Button>
                </Link>
              ) : null}
              {lead.jobId ? (
                <Link href={`/jobs/${lead.jobId}`}>
                  <Button variant="secondary" size="sm">
                    Open {lead.jobNumber || 'job'}
                  </Button>
                </Link>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </div>

      {canWrite ? (
        <Panel title="Follow-up & lifecycle">
          <form className="form-stack" onSubmit={onUpdateStatus}>
            <label>
              Status
              <select
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value as LeadStatus)}
              >
                {LEAD_STATUS_OPTIONS.filter((o) => o.value !== 'converted').map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {(status === 'lost' || status === 'duplicate') && (
              <label>
                Lost / duplicate reason *
                <Input value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
              </label>
            )}
            {(['converted', 'lost', 'duplicate'] as LeadStatus[]).includes(lead.status) &&
            !['converted', 'lost', 'duplicate'].includes(status) ? (
              <label>
                Reopen reason *
                <Input value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
              </label>
            ) : null}
            <label>
              Next action
              <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
            </label>
            <label>
              Due
              <Input
                type="datetime-local"
                value={nextActionDue}
                onChange={(e) => setNextActionDue(e.target.value)}
              />
            </label>
            {statusError ? <p className="form-error">{statusError}</p> : null}
            <Button type="submit" variant="secondary" disabled={isUpdating}>
              {isUpdating ? 'Saving…' : 'Save lifecycle'}
            </Button>
          </form>
        </Panel>
      ) : null}

      {showConvert && canConvert ? (
        <Panel title="Conversion wizard">
          <form className="form-stack" onSubmit={onConvert}>
            <fieldset>
              <legend>Customer</legend>
              <label className="leads-toolbar__check">
                <input
                  type="radio"
                  checked={customerMode === 'new'}
                  onChange={() => setCustomerMode('new')}
                />
                Create new customer
              </label>
              <label className="leads-toolbar__check">
                <input
                  type="radio"
                  checked={customerMode === 'existing'}
                  onChange={() => setCustomerMode('existing')}
                />
                Use existing customer
              </label>
              {customerMode === 'existing' ? (
                <select
                  className="input"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  required
                >
                  <option value="">Select customer…</option>
                  {(customers ?? []).map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </fieldset>

            <fieldset>
              <legend>Property</legend>
              <label className="leads-toolbar__check">
                <input
                  type="radio"
                  checked={propertyMode === 'new'}
                  onChange={() => setPropertyMode('new')}
                />
                Create new property from lead address
              </label>
              <label className="leads-toolbar__check">
                <input
                  type="radio"
                  checked={propertyMode === 'existing'}
                  onChange={() => setPropertyMode('existing')}
                />
                Use existing property
              </label>
              <label className="leads-toolbar__check">
                <input
                  type="radio"
                  checked={propertyMode === 'none'}
                  onChange={() => {
                    setPropertyMode('none');
                    setCreateJob(false);
                  }}
                />
                No property (convert without job)
              </label>
              {propertyMode === 'existing' ? (
                <select
                  className="input"
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  required
                >
                  <option value="">Select property…</option>
                  {(properties ?? []).map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.propertyName}
                    </option>
                  ))}
                </select>
              ) : null}
            </fieldset>

            <label className="leads-toolbar__check">
              <input
                type="checkbox"
                checked={createJob}
                onChange={(e) => setCreateJob(e.target.checked)}
                disabled={
                  propertyMode === 'none' ||
                  !canCreateJob ||
                  (propertyMode === 'new' && !leadHasConvertibleSiteAddress(lead))
                }
              />
              Create operational job now
              {!canCreateJob
                ? ' (requires jobs:write)'
                : propertyMode === 'new' && !leadHasConvertibleSiteAddress(lead)
                  ? ' (lead needs street + suburb)'
                  : ''}
            </label>

            {createJob ? (
              <>
                <label>
                  Job type
                  <select
                    className="input"
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                  >
                    {JOB_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Description
                  <textarea
                    className="input"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <label>
                  Priority
                  <select
                    className="input"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as LeadUrgency)}
                  >
                    {JOB_PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Appointment
                  <Input
                    type="datetime-local"
                    value={appointmentLocal}
                    onChange={(e) => setAppointmentLocal(e.target.value)}
                  />
                </label>
                <label>
                  Site mobile
                  <Input value={siteMobile} onChange={(e) => setSiteMobile(e.target.value)} />
                </label>
                <label>
                  Assign technician / crew
                  <select
                    className="input"
                    value={assignedUserId}
                    onChange={(e) => setAssignedUserId(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {(members ?? []).map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.firstName} {member.lastName}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            <label>
              Duplicate override reason (if creating new despite matches)
              <Input
                value={duplicateOverrideReason}
                onChange={(e) => setDuplicateOverrideReason(e.target.value)}
              />
            </label>

            {confirmationPreview ? (
              <div className="leads-confirm">
                <h3>Confirmation summary</h3>
                <p>Customer: {confirmationPreview.customer}</p>
                <p>Property: {confirmationPreview.property}</p>
                <p>Job: {confirmationPreview.job}</p>
                <p>Appointment: {confirmationPreview.appointment}</p>
                <label className="leads-toolbar__check">
                  <input
                    type="checkbox"
                    checked={confirmReady}
                    onChange={(e) => setConfirmReady(e.target.checked)}
                  />
                  I confirm this conversion is correct
                </label>
              </div>
            ) : null}

            {convertError ? <p className="form-error">{convertError}</p> : null}
            {convertSummary ? <p className="form-success">{convertSummary}</p> : null}

            <Button type="submit" variant="primary" disabled={isConverting || !confirmReady}>
              {isConverting ? 'Converting…' : 'Convert lead'}
            </Button>
            <p className="muted-text">Idempotency key: {clientActionId}</p>
          </form>
        </Panel>
      ) : null}

      <Panel title="Timeline">
        <ul className="leads-timeline">
          {lead.statusHistory.map((entry) => (
            <li key={entry.id}>
              <strong>
                {entry.fromStatus ?? '—'} → {entry.toStatus}
              </strong>
              <span className="muted-text">
                {' '}
                {new Date(entry.createdAt).toLocaleString()} · {entry.actorName || 'System'}
              </span>
              {entry.reason ? <div>{entry.reason}</div> : null}
            </li>
          ))}
          {lead.activities.map((activity) => (
            <li key={activity.id}>
              <strong>{activity.activityType}</strong>
              <span className="muted-text">
                {' '}
                {new Date(activity.occurredAt).toLocaleString()} · {activity.authorName || 'Staff'}
              </span>
              <div>{activity.body}</div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
