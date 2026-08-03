import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Button, Input, Panel } from '@titan/ui';
import {
  isPlaceholderEmail,
  isValidEmailAddress,
  isValidSaMobile,
  JOB_PRIORITY_OPTIONS,
  JOB_TYPE_OPTIONS,
  normalizeSaMobile,
} from '@titan/shared';
import type { LeadDuplicateMatch, LeadUrgency } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { checkLeadDuplicates, createLead, fetchLeadSources } from '../../lib/leads-api';
import { fetchTeamMembers } from '../../lib/team-api';
import { useCachedQuery } from '../../lib/use-cached-query';
import { canManageLeads } from '../../features/leads/utils';

const SA_PROVINCES = [
  'Western Cape',
  'Eastern Cape',
  'Northern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
] as const;

export function LeadCreatePage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const canWrite = user ? canManageLeads(user.permissions) : false;

  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [serviceType, setServiceType] = useState<string>(JOB_TYPE_OPTIONS[0]);
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<LeadUrgency>('normal');
  const [street, setStreet] = useState('');
  const [suburb, setSuburb] = useState('');
  const [city, setCity] = useState('Cape Town');
  const [province, setProvince] = useState('Western Cape');
  const [postalCode, setPostalCode] = useState('');
  const [unit, setUnit] = useState('');
  const [preferredAppointment, setPreferredAppointment] = useState('');
  const [accessInstructions, setAccessInstructions] = useState('');
  const [notes, setNotes] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [operationalContactPermission, setOperationalContactPermission] = useState(true);
  const [assignedUserId, setAssignedUserId] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDue, setNextActionDue] = useState('');
  const [acknowledgePlaceholderEmail, setAcknowledgePlaceholderEmail] = useState(false);
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState('');
  const [matches, setMatches] = useState<LeadDuplicateMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const { data: sources } = useCachedQuery({
    queryKey: 'leads/sources',
    accessToken,
    enabled: canWrite,
    staleTimeMs: 60_000,
    fetcher: async () => fetchLeadSources(accessToken!),
  });

  const { data: members } = useCachedQuery({
    queryKey: 'team/members',
    accessToken,
    enabled: canWrite,
    staleTimeMs: 60_000,
    fetcher: async () => fetchTeamMembers(accessToken!),
  });

  const emailPlaceholderWarning = useMemo(() => {
    const email = contactEmail.trim();
    return Boolean(email && isValidEmailAddress(email) && isPlaceholderEmail(email));
  }, [contactEmail]);

  const phonePreview = contactPhone.trim() ? normalizeSaMobile(contactPhone) : null;

  /** Prefill from Communications Hub WhatsApp readiness links — never auto-saves. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const phone = params.get('phone');
    const name = params.get('name');
    const descriptionParam = params.get('description');
    const source = params.get('source');
    if (phone?.trim()) setContactPhone(phone.trim());
    if (name?.trim()) setContactName(name.trim());
    if (descriptionParam?.trim()) setDescription(descriptionParam.trim());
    if (source === 'whatsapp') {
      setNotes((current) =>
        current.trim()
          ? current
          : 'Opened from Business WhatsApp conversation — review before saving.',
      );
    }
  }, []);

  async function runDuplicateCheck() {
    if (!accessToken) return;
    const result = await checkLeadDuplicates(accessToken, {
      contactName,
      companyName,
      contactEmail,
      contactPhone,
      street,
      suburb,
    });
    setMatches(result.matches);
    return result;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canWrite) return;
    setError(null);
    setWarnings([]);

    if (!contactName.trim()) {
      setError('Contact name is required');
      return;
    }
    if (contactPhone.trim() && !isValidSaMobile(contactPhone)) {
      setError('Enter a valid South African mobile number');
      return;
    }
    if (contactEmail.trim() && !isValidEmailAddress(contactEmail)) {
      setError('Enter a valid email address');
      return;
    }
    if (emailPlaceholderWarning && !acknowledgePlaceholderEmail) {
      setError('Acknowledge the placeholder email warning to continue');
      return;
    }

    setIsSaving(true);
    try {
      const dupes = await runDuplicateCheck();
      if (dupes && dupes.matches.some((match) => match.score >= 90) && !duplicateOverrideReason.trim()) {
        setError('Possible duplicate found. Review matches and provide an override reason, or keep as a separate lead with a reason.');
        setIsSaving(false);
        return;
      }

      const result = await createLead(accessToken, {
        companyName: companyName.trim() || null,
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
        sourceId: sourceId || null,
        serviceType,
        urgency,
        street: street.trim() || null,
        suburb: suburb.trim() || null,
        city: city.trim() || null,
        province: province.trim() || null,
        postalCode: postalCode.trim() || null,
        unit: unit.trim() || null,
        accessInstructions: accessInstructions.trim() || null,
        preferredAppointmentAt: preferredAppointment
          ? new Date(preferredAppointment).toISOString()
          : null,
        nextAction: nextAction.trim() || null,
        nextActionDueAt: nextActionDue ? new Date(nextActionDue).toISOString() : null,
        marketingConsent,
        operationalContactPermission,
        assignedUserId: assignedUserId || null,
        notes: [description.trim(), notes.trim()].filter(Boolean).join('\n\n') || null,
        acknowledgePlaceholderEmail,
        duplicateOverrideReason: duplicateOverrideReason.trim() || null,
      });
      setWarnings(result.warnings);
      navigate(`/leads/${result.lead.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        if (err.code === 'DUPLICATE_SUSPECTED') {
          void runDuplicateCheck();
        }
      } else {
        setError('Unable to create lead');
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (!canWrite) {
    return (
      <div className="page-shell">
        <PageHeader title="Add Lead" description="You do not have permission to create leads." />
      </div>
    );
  }

  return (
    <div className="page-shell leads-create-page">
      <PageHeader
        title="Add Lead"
        description="Capture the enquiry once — conversion reuses this data."
      />

      <form className="form-stack" onSubmit={onSubmit}>
        <Panel title="Contact">
          <label>
            Person / company
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </label>
          <label>
            Contact name *
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} required />
          </label>
          <label>
            SA mobile
            <Input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="082 123 4567"
            />
            {phonePreview ? <span className="muted-text">Normalised: {phonePreview}</span> : null}
          </label>
          <label>
            Email
            <Input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </label>
          {emailPlaceholderWarning ? (
            <label className="leads-toolbar__check">
              <input
                type="checkbox"
                checked={acknowledgePlaceholderEmail}
                onChange={(e) => setAcknowledgePlaceholderEmail(e.target.checked)}
              />
              This email looks like a placeholder and will not prove identity
            </label>
          ) : null}
        </Panel>

        <Panel title="Enquiry">
          <label>
            Enquiry source
            <select className="titan-select" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">Unknown / not set</option>
              {(sources ?? []).map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Service / job type
            <select
              className="input"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
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
            Urgency
            <select
              className="input"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as LeadUrgency)}
            >
              {JOB_PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </Panel>

        <Panel title="Property / Site (Optional)">
          <label>
            Street
            <Input value={street} onChange={(e) => setStreet(e.target.value)} />
          </label>
          <label>
            Suburb
            <Input value={suburb} onChange={(e) => setSuburb(e.target.value)} />
          </label>
          <label>
            City
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label>
            Province
            <select
              className="input"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
            >
              {SA_PROVINCES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Postal code
            <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
          </label>
          <label>
            Unit
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </label>
          <label>
            Preferred appointment
            <Input
              type="datetime-local"
              value={preferredAppointment}
              onChange={(e) => setPreferredAppointment(e.target.value)}
            />
          </label>
          <label>
            Access instructions
            <textarea
              className="input"
              rows={2}
              value={accessInstructions}
              onChange={(e) => setAccessInstructions(e.target.value)}
            />
          </label>
        </Panel>

        <Panel title="Follow-Up & Consent">
          <label>
            Assigned user
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
          <label>
            Next action
            <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
          </label>
          <label>
            Next action due
            <Input
              type="datetime-local"
              value={nextActionDue}
              onChange={(e) => setNextActionDue(e.target.value)}
            />
          </label>
          <label>
            Notes
            <textarea
              className="input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <label className="leads-toolbar__check">
            <input
              type="checkbox"
              checked={operationalContactPermission}
              onChange={(e) => setOperationalContactPermission(e.target.checked)}
            />
            Operational contact permission (job updates / site access)
          </label>
          <label className="leads-toolbar__check">
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
            />
            Marketing consent (separate from operational contact)
          </label>
        </Panel>

        {matches.length > 0 ? (
          <Panel title="Possible Matches">
            <ul className="leads-dupe-list">
              {matches.map((match, index) => (
                <li key={`${match.kind}-${match.leadId ?? match.customerId ?? index}`}>
                  <strong>{match.label}</strong> — {match.detail} (score {match.score})
                </li>
              ))}
            </ul>
            <label>
              Duplicate override reason
              <Input
                value={duplicateOverrideReason}
                onChange={(e) => setDuplicateOverrideReason(e.target.value)}
                placeholder="Required when creating despite high-confidence matches"
              />
            </label>
          </Panel>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}
        {warnings.map((warning) => (
          <p key={warning} className="form-warning">
            {warning}
          </p>
        ))}

        <div className="page-header-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void runDuplicateCheck()}
            disabled={isSaving}
          >
            Check duplicates
          </Button>
          <Button type="submit" variant="primary" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Create lead'}
          </Button>
        </div>
      </form>
    </div>
  );
}
