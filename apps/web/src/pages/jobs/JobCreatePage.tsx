import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { Button, Input, PageHeader } from '@titan/ui';
import type {
  CreateJobDocumentInput,
  CustomerPropertySummary,
  CustomerSummary,
  JobPriority,
  TeamMember,
} from '@titan/shared';
import {
  generateJobTitle,
  isPlaceholderEmail,
  isValidEmailAddress,
  isValidSaMobile,
  JOB_PRIORITY_OPTIONS,
  JOB_TYPE_OPTIONS,
  normalizeSaMobile,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomerProperties, fetchCustomers } from '../../lib/crm-api';
import { createJob } from '../../lib/jobs-api';
import { fetchTeamMembers } from '../../lib/team-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { canManageJobs } from '../../features/jobs/JobList';
import {
  documentInputFromFile,
  JOB_DOCUMENT_ACCEPT,
  titleFromFileName,
} from '../../features/jobs/job-document-attach';

type SiteMode = 'existing' | 'new';

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

export function JobCreatePage() {
  const { accessToken, user } = useAuth();
  const { invalidateJobs } = useStaffMutationInvalidation();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [properties, setProperties] = useState<CustomerPropertySummary[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [siteMode, setSiteMode] = useState<SiteMode>('new');
  const [propertyId, setPropertyId] = useState('');
  const [street, setStreet] = useState('');
  const [suburb, setSuburb] = useState('');
  const [city, setCity] = useState('Cape Town');
  const [province, setProvince] = useState('Western Cape');
  const [postalCode, setPostalCode] = useState('');
  const [unit, setUnit] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [siteContactName, setSiteContactName] = useState('');
  const [siteContactMobile, setSiteContactMobile] = useState('');
  const [siteContactEmail, setSiteContactEmail] = useState('');
  const [siteContactDiffers, setSiteContactDiffers] = useState(false);
  const [jobType, setJobType] = useState<string>(JOB_TYPE_OPTIONS[0]);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<JobPriority>('normal');
  const [appointmentLocal, setAppointmentLocal] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [accessInstructions, setAccessInstructions] = useState('');
  const [notes, setNotes] = useState('');
  const [customerVisibleNotes, setCustomerVisibleNotes] = useState('');
  const [updateVerifiedCustomer, setUpdateVerifiedCustomer] = useState(false);
  const [updateVerifiedProperty, setUpdateVerifiedProperty] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<CreateJobDocumentInput[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPropertyIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const canWrite = user ? canManageJobs(user.permissions) : false;
  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;

  const titlePreview = useMemo(
    () =>
      generateJobTitle({
        jobType,
        suburb,
        street,
        customerOrSiteContactName: siteContactName || selectedCustomer?.name || 'Customer',
      }),
    [jobType, suburb, street, siteContactName, selectedCustomer?.name],
  );

  const emailPlaceholderWarning =
    siteContactEmail.trim() && isValidEmailAddress(siteContactEmail)
      ? isPlaceholderEmail(siteContactEmail)
      : false;

  useEffect(() => {
    if (user && !canWrite) {
      navigate('/jobs');
    }
  }, [canWrite, navigate, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadBootstrap() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const [customerData, memberData] = await Promise.all([
          fetchCustomers(accessToken),
          fetchTeamMembers(accessToken).catch(() => [] as TeamMember[]),
        ]);

        if (!cancelled) {
          setCustomers(customerData);
          setMembers(memberData.filter((member) => member.isActive));
          const params = new URLSearchParams(search);
          const preCustomerId = params.get('customerId');
          const prePropertyId = params.get('propertyId');
          pendingPropertyIdRef.current = prePropertyId;
          if (preCustomerId && customerData.some((customer) => customer.id === preCustomerId)) {
            setCustomerId(preCustomerId);
          } else {
            setCustomerId(customerData[0]?.id ?? '');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load customers');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadBootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, search]);

  useEffect(() => {
    let cancelled = false;

    async function loadProperties() {
      if (!accessToken || !customerId) {
        setProperties([]);
        return;
      }

      setIsLoadingProperties(true);
      try {
        const data = await fetchCustomerProperties(accessToken, customerId);
        if (!cancelled) {
          setProperties(data);
          const pendingPropertyId = pendingPropertyIdRef.current;
          const pendingProperty =
            pendingPropertyId != null
              ? data.find((item) => item.id === pendingPropertyId)
              : undefined;
          if (pendingProperty) {
            setSiteMode('existing');
            setPropertyId(pendingProperty.id);
            applyProperty(pendingProperty);
            pendingPropertyIdRef.current = null;
          } else {
            const primary = data.find((item) => item.isPrimary) ?? data[0];
            if (primary && primary.street && primary.suburb && primary.city) {
              setSiteMode('existing');
              setPropertyId(primary.id);
              applyProperty(primary);
            } else {
              setSiteMode('new');
              setPropertyId('');
            }
          }

          const customer = customers.find((item) => item.id === customerId);
          if (customer && !siteContactDiffers) {
            setSiteContactName(customer.name);
            setSiteContactMobile(customer.phone ?? '');
            setSiteContactEmail(customer.email ?? '');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load properties');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProperties(false);
        }
      }
    }

    void loadProperties();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autofill only on customer change
  }, [accessToken, customerId]);

  function applyProperty(property: CustomerPropertySummary) {
    setStreet(property.street ?? '');
    setSuburb(property.suburb ?? '');
    setCity(property.city ?? 'Cape Town');
    setProvince(property.province ?? 'Western Cape');
    setPostalCode(property.postalCode ?? '');
    setUnit(property.unit ?? '');
    setPropertyName(property.propertyName);
  }

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (!customerId) next.customerId = 'Customer is required';
    if (siteMode === 'existing' && !propertyId) next.propertyId = 'Select a property';
    if (!street.trim()) next.street = 'Street is required';
    if (!suburb.trim()) next.suburb = 'Suburb is required';
    if (!city.trim()) next.city = 'City is required';
    if (!province.trim()) next.province = 'Province is required';
    if (!postalCode.trim()) next.postalCode = 'Postal code is required';
    if (!siteContactName.trim()) next.siteContactName = 'Site contact name is required';
    if (!isValidSaMobile(siteContactMobile)) {
      next.siteContactMobile = 'Enter a valid SA mobile (e.g. 0821234567 or +27821234567)';
    }
    if (siteContactEmail.trim() && !isValidEmailAddress(siteContactEmail)) {
      next.siteContactEmail = 'Enter a valid email address';
    }
    if (!jobType.trim()) next.jobType = 'Job type is required';
    if (!description.trim()) next.description = 'Work / problem description is required';

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !canWrite || !validate()) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const preferredAppointmentAt = appointmentLocal
        ? new Date(appointmentLocal).toISOString()
        : null;

      const job = await createJob(accessToken, {
        customerId,
        propertyId: siteMode === 'existing' ? propertyId : null,
        newProperty:
          siteMode === 'new'
            ? {
                propertyName: propertyName.trim() || `${suburb} — ${street}`,
                street: street.trim(),
                suburb: suburb.trim(),
                city: city.trim(),
                province: province.trim(),
                postalCode: postalCode.trim(),
                unit: unit.trim() || null,
              }
            : null,
        address:
          siteMode === 'existing'
            ? {
                street: street.trim(),
                suburb: suburb.trim(),
                city: city.trim(),
                province: province.trim(),
                postalCode: postalCode.trim(),
                unit: unit.trim() || null,
              }
            : null,
        siteContact: {
          name: siteContactName.trim(),
          mobile: normalizeSaMobile(siteContactMobile) ?? siteContactMobile.trim(),
          email: siteContactEmail.trim() || null,
        },
        siteContactDiffersFromCustomer: siteContactDiffers,
        jobType,
        description: description.trim(),
        priority,
        preferredAppointmentAt,
        assignedUserId: assignedUserId || null,
        accessInstructions: accessInstructions.trim() || null,
        notes: notes.trim() || null,
        customerVisibleNotes: customerVisibleNotes.trim() || null,
        updateVerifiedCustomerDetails: updateVerifiedCustomer,
        updateVerifiedPropertyDetails: updateVerifiedProperty && siteMode === 'existing',
        documents: documents.length ? documents : undefined,
      });

      invalidateJobs();
      navigate(`/jobs/${job.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create job');
    } finally {
      setIsSaving(false);
    }
  }

  function handleDocumentFileChange(file: File | null) {
    setPendingFile(file);
    if (!file) return;
    if (!docTitle.trim()) {
      setDocTitle(titleFromFileName(file.name));
    }
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.documents;
      return next;
    });
  }

  function addDocument() {
    if (!pendingFile) {
      setFieldErrors((prev) => ({
        ...prev,
        documents: 'Select a photo or document file to attach',
      }));
      return;
    }
    setDocuments((prev) => [...prev, documentInputFromFile(pendingFile, docTitle)]);
    setDocTitle('');
    setPendingFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.documents;
      return next;
    });
  }

  if (isLoading) {
    return <p className="page-muted">Loading form…</p>;
  }

  return (
    <div className="jobs-page">
      <PageHeader
        title="New job"
        description="Book Young Guns work with a full site handoff for dispatch and technicians."
        actions={
          <Link href="/jobs">
            <Button variant="secondary">Back to jobs</Button>
          </Link>
        }
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {customers.length === 0 ? (
        <div className="jobs-empty-customers">
          <p className="page-muted">You need at least one customer before creating a job.</p>
          <Link href="/crm/new">
            <Button>Add customer</Button>
          </Link>
        </div>
      ) : (
        <form
          className="jobs-form jobs-form--operational"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <section className="jobs-form__section">
            <h2 className="jobs-form__section-title">Customer & site</h2>

            <label className="titan-input-group">
              <span className="titan-input-label">
                Customer <span className="jobs-required">required</span>
              </span>
              <select
                className="titan-input"
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                required
              >
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                    {customer.phone ? ` · ${customer.phone}` : ''}
                  </option>
                ))}
              </select>
              {fieldErrors.customerId ? (
                <span className="form-error">{fieldErrors.customerId}</span>
              ) : null}
            </label>

            <fieldset className="jobs-fieldset">
              <legend>Site address</legend>
              <div className="jobs-radio-row">
                <label>
                  <input
                    type="radio"
                    name="siteMode"
                    checked={siteMode === 'existing'}
                    onChange={() => setSiteMode('existing')}
                    disabled={properties.length === 0}
                  />{' '}
                  Existing property
                </label>
                <label>
                  <input
                    type="radio"
                    name="siteMode"
                    checked={siteMode === 'new'}
                    onChange={() => setSiteMode('new')}
                  />{' '}
                  New site address
                </label>
              </div>
              {isLoadingProperties ? <p className="page-muted">Loading properties…</p> : null}

              {siteMode === 'existing' ? (
                <label className="titan-input-group">
                  <span className="titan-input-label">
                    Property <span className="jobs-required">required</span>
                  </span>
                  <select
                    className="titan-input"
                    value={propertyId}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      setPropertyId(nextId);
                      const property = properties.find((item) => item.id === nextId);
                      if (property) applyProperty(property);
                    }}
                    required
                  >
                    <option value="">Select property</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.propertyName}
                        {property.addressDisplay ? ` — ${property.addressDisplay}` : ''}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.propertyId ? (
                    <span className="form-error">{fieldErrors.propertyId}</span>
                  ) : null}
                </label>
              ) : (
                <Input
                  label="Property name (optional)"
                  value={propertyName}
                  onChange={(event) => setPropertyName(event.target.value)}
                  placeholder="e.g. Main house / Flat 3"
                />
              )}

              <div className="jobs-form__grid">
                <Input
                  label="Street"
                  value={street}
                  onChange={(event) => setStreet(event.target.value)}
                  required
                  error={fieldErrors.street}
                />
                <Input
                  label="Unit / apartment"
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                  placeholder="Optional"
                />
                <Input
                  label="Suburb"
                  value={suburb}
                  onChange={(event) => setSuburb(event.target.value)}
                  required
                  error={fieldErrors.suburb}
                />
                <Input
                  label="City"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  required
                  error={fieldErrors.city}
                />
                <label className="titan-input-group">
                  <span className="titan-input-label">Province</span>
                  <select
                    className="titan-input"
                    value={province}
                    onChange={(event) => setProvince(event.target.value)}
                    required
                  >
                    {SA_PROVINCES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.province ? (
                    <span className="form-error">{fieldErrors.province}</span>
                  ) : null}
                </label>
                <Input
                  label="Postal code"
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                  required
                  error={fieldErrors.postalCode}
                />
              </div>
            </fieldset>
          </section>

          <section className="jobs-form__section">
            <h2 className="jobs-form__section-title">Site contact</h2>
            <label className="jobs-checkbox">
              <input
                type="checkbox"
                checked={siteContactDiffers}
                onChange={(event) => setSiteContactDiffers(event.target.checked)}
              />
              Different site / managing-agent contact (not the customer)
            </label>
            <div className="jobs-form__grid">
              <Input
                label="Contact name"
                value={siteContactName}
                onChange={(event) => setSiteContactName(event.target.value)}
                required
                error={fieldErrors.siteContactName}
              />
              <Input
                label="Mobile / WhatsApp"
                value={siteContactMobile}
                onChange={(event) => setSiteContactMobile(event.target.value)}
                required
                placeholder="0821234567"
                error={fieldErrors.siteContactMobile}
              />
              <Input
                label="Email"
                value={siteContactEmail}
                onChange={(event) => setSiteContactEmail(event.target.value)}
                placeholder="Optional"
                error={fieldErrors.siteContactEmail}
              />
            </div>
            {emailPlaceholderWarning ? (
              <p className="jobs-warning" role="status">
                This email looks like a company/placeholder address and is not treated as
                customer-verified.
              </p>
            ) : null}
          </section>

          <section className="jobs-form__section">
            <h2 className="jobs-form__section-title">Work details</h2>
            <label className="titan-input-group">
              <span className="titan-input-label">
                Job type / service <span className="jobs-required">required</span>
              </span>
              <select
                className="titan-input"
                value={jobType}
                onChange={(event) => setJobType(event.target.value)}
                required
              >
                {JOB_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="titan-input-group">
              <span className="titan-input-label">
                Work / problem description <span className="jobs-required">required</span>
              </span>
              <textarea
                className="titan-input jobs-textarea"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What is wrong? Where on the property? Any prior work?"
                required
              />
              {fieldErrors.description ? (
                <span className="form-error">{fieldErrors.description}</span>
              ) : null}
            </label>

            <div className="jobs-form__grid">
              <label className="titan-input-group">
                <span className="titan-input-label">Urgency / priority</span>
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
              <Input
                label="Preferred appointment"
                type="datetime-local"
                value={appointmentLocal}
                onChange={(event) => setAppointmentLocal(event.target.value)}
              />
              <label className="titan-input-group">
                <span className="titan-input-label">Assign technician (optional)</span>
                <select
                  className="titan-input"
                  value={assignedUserId}
                  onChange={(event) => setAssignedUserId(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.firstName} {member.lastName}
                      {member.roleName ? ` (${member.roleName})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="titan-input-group">
              <span className="titan-input-label">Access instructions</span>
              <textarea
                className="titan-input jobs-textarea"
                rows={3}
                value={accessInstructions}
                onChange={(event) => setAccessInstructions(event.target.value)}
                placeholder="Gate code, dogs, parking, body corp, tenant hours…"
              />
            </label>

            <label className="titan-input-group">
              <span className="titan-input-label">Internal notes</span>
              <textarea
                className="titan-input jobs-textarea"
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Office-only notes"
              />
            </label>

            <label className="titan-input-group">
              <span className="titan-input-label">Customer-visible notes</span>
              <textarea
                className="titan-input jobs-textarea"
                rows={2}
                value={customerVisibleNotes}
                onChange={(event) => setCustomerVisibleNotes(event.target.value)}
                placeholder="Shown to the customer where portal/comms support it"
              />
            </label>
          </section>

          <section className="jobs-form__section">
            <h2 className="jobs-form__section-title">Photos / documents</h2>
            <p className="page-muted">
              Select photos or documents to attach. File details are stored through the existing
              documents system and linked to this job when you create it.
            </p>
            <div className="jobs-form__grid">
              <Input
                label="Document title"
                value={docTitle}
                onChange={(event) => setDocTitle(event.target.value)}
                placeholder="Blocked drain"
              />
              <label className="titan-input-group">
                <span className="titan-input-label">Photo or document file</span>
                <input
                  ref={fileInputRef}
                  className="titan-input"
                  type="file"
                  accept={JOB_DOCUMENT_ACCEPT}
                  onChange={(event) =>
                    handleDocumentFileChange(event.target.files?.[0] ?? null)
                  }
                />
              </label>
            </div>
            {pendingFile ? (
              <p className="page-muted jobs-doc-pending">
                Selected: {pendingFile.name}
                {pendingFile.type ? ` · ${pendingFile.type}` : ''}
                {Number.isFinite(pendingFile.size)
                  ? ` · ${Math.max(1, Math.round(pendingFile.size / 1024))} KB`
                  : ''}
              </p>
            ) : null}
            {fieldErrors.documents ? (
              <span className="form-error">{fieldErrors.documents}</span>
            ) : null}
            <Button type="button" variant="secondary" onClick={addDocument} disabled={!pendingFile}>
              Add document
            </Button>
            {documents.length > 0 ? (
              <ul className="jobs-doc-list">
                {documents.map((doc, index) => (
                  <li key={`${doc.fileName}-${index}`}>
                    {doc.title}{' '}
                    <span className="page-muted">
                      ({doc.fileName}
                      {doc.fileType ? ` · ${doc.fileType}` : ''}
                      {doc.fileSizeBytes != null
                        ? ` · ${Math.max(1, Math.round(doc.fileSizeBytes / 1024))} KB`
                        : ''}
                      )
                    </span>
                    <button
                      type="button"
                      className="jobs-link"
                      onClick={() =>
                        setDocuments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="jobs-form__section">
            <h2 className="jobs-form__section-title">Verified record updates</h2>
            <p className="page-muted">
              Customer and property records are never overwritten silently. Only update them when
              you explicitly confirm below.
            </p>
            <label className="jobs-checkbox">
              <input
                type="checkbox"
                checked={updateVerifiedCustomer}
                onChange={(event) => setUpdateVerifiedCustomer(event.target.checked)}
              />
              Update verified customer details too
            </label>
            <label className="jobs-checkbox">
              <input
                type="checkbox"
                checked={updateVerifiedProperty}
                onChange={(event) => setUpdateVerifiedProperty(event.target.checked)}
                disabled={siteMode !== 'existing'}
              />
              Update verified property details too
            </label>
          </section>

          <section className="jobs-form__section jobs-form__preview">
            <h2 className="jobs-form__section-title">System-generated handoff</h2>
            <dl className="jobs-detail-list">
              <div>
                <dt>Job title</dt>
                <dd>{titlePreview}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{appointmentLocal ? 'Scheduled (appointment set)' : 'New'}</dd>
              </div>
              <div>
                <dt>Job number</dt>
                <dd>Assigned on save (tenant-unique)</dd>
              </div>
            </dl>
          </section>

          <div className="jobs-form__actions">
            <Button type="submit" disabled={isSaving || !customerId}>
              {isSaving ? 'Creating…' : 'Create job'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
