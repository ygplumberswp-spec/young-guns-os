import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Input, Panel } from '@titan/ui';
import type {
  CustomerPropertySummary,
  CustomerSummary,
  JobAssignee,
  JobPriority,
  VehicleSummary,
} from '@titan/shared';
import {
  isValidEmailAddress,
  isValidSaMobile,
  JOB_PRIORITY_OPTIONS,
  JOB_TYPE_OPTIONS,
  normalizeSaMobile,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  createCustomer,
  fetchCustomer,
  fetchCustomerProperties,
  fetchCustomers,
} from '../../lib/crm-api';
import { assignJobCrew, createJob } from '../../lib/jobs-api';
import { useFormDraftShell } from '../../hooks/useFormDraftShell';
import { toDatetimeLocalValue } from '../../features/scheduling/utils';

type BookJobModalProps = {
  slotDate: Date;
  accessToken: string;
  userId?: string;
  assignees: JobAssignee[];
  vehicles: VehicleSummary[];
  defaultTechnicianId?: string | null;
  canWrite: boolean;
  onClose: () => void;
  onCreated: () => void;
  onScheduleExisting?: (
    jobId: string,
    body: {
      scheduledAt: string;
      scheduledEndAt?: string | null;
      assignedUserId?: string | null;
    },
  ) => Promise<void>;
};

type SiteMode = 'existing' | 'new';

const AWAITING_SCHEDULE_NOTE = 'Awaiting Schedule Confirmation';

function defaultSlotLocal(slotDate: Date): string {
  const start = new Date(slotDate);
  if (start.getHours() === 0 && start.getMinutes() === 0) {
    start.setHours(8, 0, 0, 0);
  }
  return toDatetimeLocalValue(start.toISOString());
}

export function BookJobModal({
  slotDate,
  accessToken,
  userId,
  assignees,
  vehicles,
  defaultTechnicianId = null,
  canWrite,
  onClose,
  onCreated,
}: BookJobModalProps) {
  const [customerQuery, setCustomerQuery] = useState('');
  const [matches, setMatches] = useState<CustomerSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');

  const [properties, setProperties] = useState<CustomerPropertySummary[]>([]);
  const [siteMode, setSiteMode] = useState<SiteMode>('new');
  const [propertyId, setPropertyId] = useState('');
  const [street, setStreet] = useState('');
  const [suburb, setSuburb] = useState('');
  const [city, setCity] = useState('Cape Town');
  const [province, setProvince] = useState('Western Cape');
  const [postalCode, setPostalCode] = useState('');
  const [unit, setUnit] = useState('');
  const [propertyName, setPropertyName] = useState('');

  const [description, setDescription] = useState('');
  const [jobType, setJobType] = useState<string>(JOB_TYPE_OPTIONS[0] ?? 'General plumbing');
  const [priority, setPriority] = useState<JobPriority>('normal');
  const [notes, setNotes] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  const [timeConfirmed, setTimeConfirmed] = useState(true);
  const [startLocal, setStartLocal] = useState(() => defaultSlotLocal(slotDate));
  const [endLocal, setEndLocal] = useState('');

  const [assignedUserId, setAssignedUserId] = useState(defaultTechnicianId ?? '');
  const [vehicleId, setVehicleId] = useState('');

  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [updateVerifiedCustomer, setUpdateVerifiedCustomer] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const draftShell = useFormDraftShell({
    accessToken,
    userId,
    recordType: 'job',
    enabled: canWrite,
    getPayload: () => ({
      customerId,
      description,
      jobType,
      priority,
      startLocal,
      timeConfirmed,
      notes,
      customerNotes,
      assignedUserId,
      street,
      suburb,
      city,
      province,
      postalCode,
    }),
    getMeta: () => ({
      title: description.trim() ? description.trim().slice(0, 80) : 'Schedule booking draft',
      customerLabel: selectedCustomer?.name ?? (newCustomerName.trim() || null),
    }),
  });

  useEffect(() => {
    const q = customerQuery.trim();
    if (q.length < 2) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsSearching(true);
      void fetchCustomers(accessToken, q)
        .then((rows) => {
          if (!cancelled) setMatches(rows.slice(0, 8));
        })
        .catch(() => {
          if (!cancelled) setMatches([]);
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [accessToken, customerQuery]);

  useEffect(() => {
    if (!customerId) {
      setProperties([]);
      return;
    }
    let cancelled = false;
    void fetchCustomerProperties(accessToken, customerId)
      .then((rows) => {
        if (cancelled) return;
        setProperties(rows);
        if (rows.length === 1) {
          setSiteMode('existing');
          setPropertyId(rows[0]!.id);
          applyProperty(rows[0]!);
        } else if (rows.length > 1) {
          setSiteMode('existing');
          const primary = rows.find((row) => row.isPrimary) ?? rows[0]!;
          setPropertyId(primary.id);
          applyProperty(primary);
        } else {
          setSiteMode('new');
          setPropertyId('');
        }
      })
      .catch(() => {
        if (!cancelled) setProperties([]);
      });
    return () => {
      cancelled = true;
    };
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

  async function selectCustomer(customer: CustomerSummary) {
    setSelectedCustomer(customer);
    setCustomerId(customer.id);
    setCustomerQuery(customer.name);
    setShowCreateCustomer(false);
    setMatches([]);
    draftShell.touchField();

    setContactName(customer.name);
    setContactPhone(customer.phone ?? '');
    setContactEmail(customer.email ?? '');

    try {
      const detail = await fetchCustomer(accessToken, customer.id);
      setContactName(detail.name);
      setContactPhone(detail.phone ?? '');
      setContactEmail(detail.email ?? '');
    } catch {
      // keep summary contact fields
    }
  }

  async function ensureCustomerId(): Promise<string> {
    if (customerId) return customerId;
    if (!showCreateCustomer) {
      throw new Error('Select an existing customer or create a new one');
    }
    if (matches.length > 0) {
      throw new Error('A matching customer already exists — select it instead of creating a duplicate');
    }
    if (!newCustomerName.trim()) {
      throw new Error('New customer name is required');
    }
    if (!isValidSaMobile(newCustomerPhone)) {
      throw new Error('Enter a valid SA mobile for the new customer');
    }
    const created = await createCustomer(accessToken, {
      name: newCustomerName.trim(),
      phone: normalizeSaMobile(newCustomerPhone) ?? newCustomerPhone.trim(),
      email: newCustomerEmail.trim() || null,
      status: 'active',
    });
    setCustomerId(created.id);
    setSelectedCustomer(created);
    return created.id;
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!customerId && !showCreateCustomer) next.customer = 'Select or create a customer';
    if (showCreateCustomer && matches.length > 0) {
      next.customer = 'Select an existing match to avoid duplicates';
    }
    if (siteMode === 'existing' && !propertyId) next.property = 'Select a property';
    if (!street.trim()) next.street = 'Street is required';
    if (!suburb.trim()) next.suburb = 'Suburb is required';
    if (!city.trim()) next.city = 'City is required';
    if (!province.trim()) next.province = 'Province is required';
    if (!postalCode.trim()) next.postalCode = 'Postal code is required';
    if (!description.trim()) next.description = 'Job description is required';
    if (!jobType.trim()) next.jobType = 'Job type is required';
    if (!contactName.trim()) next.contactName = 'Contact name is required';
    if (!isValidSaMobile(contactPhone)) next.contactPhone = 'Valid SA mobile required';
    if (contactEmail.trim() && !isValidEmailAddress(contactEmail)) {
      next.contactEmail = 'Valid email required';
    }
    if (timeConfirmed && !startLocal) next.startLocal = 'Date and time required';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(mode: 'schedule' | 'unscheduled') {
    if (!canWrite || !validate()) return;
    setIsSaving(true);
    setError(null);
    try {
      const ensuredCustomerId = await ensureCustomerId();
      const scheduleConfirmed = mode === 'schedule' && timeConfirmed && Boolean(startLocal);
      const preferredAppointmentAt = scheduleConfirmed
        ? new Date(startLocal).toISOString()
        : null;
      const noteParts = [notes.trim()];
      if (!scheduleConfirmed) {
        noteParts.unshift(AWAITING_SCHEDULE_NOTE);
        if (startLocal) {
          noteParts.push(`Preferred slot (unconfirmed): ${startLocal}`);
        }
      }

      const job = await createJob(accessToken, {
        customerId: ensuredCustomerId,
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
          name: contactName.trim(),
          mobile: normalizeSaMobile(contactPhone) ?? contactPhone.trim(),
          email: contactEmail.trim() || null,
        },
        jobType,
        description: description.trim(),
        priority,
        preferredAppointmentAt,
        scheduledEndAt:
          scheduleConfirmed && endLocal ? new Date(endLocal).toISOString() : null,
        assignedUserId: assignedUserId || null,
        notes: noteParts.filter(Boolean).join('\n') || null,
        customerVisibleNotes: customerNotes.trim() || null,
        updateVerifiedCustomerDetails: updateVerifiedCustomer,
        updateVerifiedPropertyDetails: false,
      });

      if (vehicleId && assignedUserId) {
        await assignJobCrew(accessToken, job.id, {
          members: [
            {
              userId: assignedUserId,
              crewRole: 'crew_leader',
              isPrimary: true,
            },
          ],
          vehicleId,
          primaryUserId: assignedUserId,
        });
      }

      draftShell.markSubmitted();
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : 'Unable to create booking');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveDraft(event?: FormEvent) {
    event?.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      draftShell.touchField();
      await draftShell.autosave.saveNow();
      draftShell.markSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save draft');
    } finally {
      setIsSaving(false);
    }
  }

  const matchHint = useMemo(() => {
    if (isSearching) return 'Searching customers…';
    if (customerQuery.trim().length >= 2 && matches.length === 0) {
      return 'No matches — you can create a new customer.';
    }
    return null;
  }, [customerQuery, isSearching, matches.length]);

  return (
    <div
      className="cal-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-job-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Panel title="Book job" className="cal-modal cal-modal--book">
        {!canWrite ? (
          <p className="page-muted">You do not have permission to create jobs.</p>
        ) : (
          <form
            className="book-job-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit('schedule');
            }}
          >
            {error ? <p className="form-error">{error}</p> : null}

            <section className="book-job-form__section">
              <h3>Customer</h3>
              <label className="titan-input-group">
                <span className="titan-input-label">Search existing customer</span>
                <input
                  className="titan-input"
                  value={customerQuery}
                  onChange={(event) => {
                    setCustomerQuery(event.target.value);
                    setShowCreateCustomer(false);
                    draftShell.touchField();
                  }}
                  placeholder="Name, phone, email, or address"
                  autoComplete="off"
                />
              </label>
              {matchHint ? <p className="page-muted">{matchHint}</p> : null}
              {matches.length > 0 ? (
                <ul className="book-job-form__matches">
                  {matches.map((customer) => (
                    <li key={customer.id}>
                      <button
                        type="button"
                        className={`book-job-form__match${customerId === customer.id ? ' is-selected' : ''}`}
                        onClick={() => void selectCustomer(customer)}
                      >
                        <strong>{customer.name}</strong>
                        <span>
                          {[customer.phone, customer.email, customer.primaryAddressDisplay]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {customerQuery.trim().length >= 2 && matches.length === 0 && !isSearching ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowCreateCustomer(true);
                    setNewCustomerName(customerQuery.trim());
                    draftShell.touchField();
                  }}
                >
                  Create new customer
                </Button>
              ) : null}
              {showCreateCustomer ? (
                <div className="book-job-form__new-customer">
                  <Input
                    label="New customer name"
                    value={newCustomerName}
                    onChange={(event) => {
                      setNewCustomerName(event.target.value);
                      draftShell.touchField();
                    }}
                    required
                  />
                  <Input
                    label="Mobile"
                    value={newCustomerPhone}
                    onChange={(event) => {
                      setNewCustomerPhone(event.target.value);
                      draftShell.touchField();
                    }}
                    required
                  />
                  <Input
                    label="Email (optional)"
                    value={newCustomerEmail}
                    onChange={(event) => {
                      setNewCustomerEmail(event.target.value);
                      draftShell.touchField();
                    }}
                  />
                </div>
              ) : null}
              {fieldErrors.customer ? <p className="form-error">{fieldErrors.customer}</p> : null}
            </section>

            <section className="book-job-form__section">
              <h3>Property / address</h3>
              {properties.length > 1 ? (
                <label className="titan-input-group">
                  <span className="titan-input-label">Property</span>
                  <select
                    className="titan-input"
                    value={propertyId}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      setPropertyId(nextId);
                      setSiteMode('existing');
                      const property = properties.find((row) => row.id === nextId);
                      if (property) applyProperty(property);
                      draftShell.touchField();
                    }}
                  >
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.propertyName}
                        {property.addressDisplay ? ` · ${property.addressDisplay}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="book-job-form__inline">
                <Button
                  type="button"
                  size="sm"
                  variant={siteMode === 'existing' ? 'primary' : 'secondary'}
                  disabled={properties.length === 0}
                  onClick={() => setSiteMode('existing')}
                >
                  Existing property
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={siteMode === 'new' ? 'primary' : 'secondary'}
                  onClick={() => {
                    setSiteMode('new');
                    setPropertyId('');
                    draftShell.touchField();
                  }}
                >
                  New address
                </Button>
              </div>
              <Input
                label="Street"
                value={street}
                onChange={(event) => {
                  setStreet(event.target.value);
                  draftShell.touchField();
                }}
                required
              />
              <div className="book-job-form__grid">
                <Input
                  label="Suburb"
                  value={suburb}
                  onChange={(event) => {
                    setSuburb(event.target.value);
                    draftShell.touchField();
                  }}
                  required
                />
                <Input
                  label="City"
                  value={city}
                  onChange={(event) => {
                    setCity(event.target.value);
                    draftShell.touchField();
                  }}
                  required
                />
                <Input
                  label="Province"
                  value={province}
                  onChange={(event) => {
                    setProvince(event.target.value);
                    draftShell.touchField();
                  }}
                  required
                />
                <Input
                  label="Postal code"
                  value={postalCode}
                  onChange={(event) => {
                    setPostalCode(event.target.value);
                    draftShell.touchField();
                  }}
                  required
                />
              </div>
              <Input
                label="Unit / complex (optional)"
                value={unit}
                onChange={(event) => {
                  setUnit(event.target.value);
                  draftShell.touchField();
                }}
              />
            </section>

            <section className="book-job-form__section">
              <h3>Job details</h3>
              <label className="titan-input-group">
                <span className="titan-input-label">Problem / description</span>
                <textarea
                  className="titan-input"
                  rows={3}
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    draftShell.touchField();
                  }}
                  required
                />
              </label>
              {fieldErrors.description ? <p className="form-error">{fieldErrors.description}</p> : null}
              <div className="book-job-form__grid">
                <label className="titan-input-group">
                  <span className="titan-input-label">Job type</span>
                  <select
                    className="titan-input"
                    value={jobType}
                    onChange={(event) => {
                      setJobType(event.target.value);
                      draftShell.touchField();
                    }}
                  >
                    {JOB_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="titan-input-group">
                  <span className="titan-input-label">Priority</span>
                  <select
                    className="titan-input"
                    value={priority}
                    onChange={(event) => {
                      setPriority(event.target.value as JobPriority);
                      draftShell.touchField();
                    }}
                  >
                    {JOB_PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="titan-input-group">
                <span className="titan-input-label">Internal notes</span>
                <textarea
                  className="titan-input"
                  rows={2}
                  value={notes}
                  onChange={(event) => {
                    setNotes(event.target.value);
                    draftShell.touchField();
                  }}
                />
              </label>
              <label className="titan-input-group">
                <span className="titan-input-label">Customer notes</span>
                <textarea
                  className="titan-input"
                  rows={2}
                  value={customerNotes}
                  onChange={(event) => {
                    setCustomerNotes(event.target.value);
                    draftShell.touchField();
                  }}
                />
              </label>
            </section>

            <section className="book-job-form__section">
              <h3>Date and time</h3>
              <label className="titan-checkbox">
                <input
                  type="checkbox"
                  checked={timeConfirmed}
                  onChange={(event) => {
                    setTimeConfirmed(event.target.checked);
                    draftShell.touchField();
                  }}
                />
                <span>Time confirmed</span>
              </label>
              {!timeConfirmed ? (
                <p className="page-muted">
                  Unconfirmed time saves the job as <strong>Awaiting Schedule Confirmation</strong>{' '}
                  (status: Needs scheduling).
                </p>
              ) : null}
              <div className="book-job-form__grid">
                <Input
                  label="Start"
                  type="datetime-local"
                  value={startLocal}
                  onChange={(event) => {
                    setStartLocal(event.target.value);
                    draftShell.touchField();
                  }}
                  required={timeConfirmed}
                />
                <Input
                  label="End (optional)"
                  type="datetime-local"
                  value={endLocal}
                  onChange={(event) => {
                    setEndLocal(event.target.value);
                    draftShell.touchField();
                  }}
                />
              </div>
            </section>

            <section className="book-job-form__section">
              <h3>Assignment</h3>
              <div className="book-job-form__grid">
                <label className="titan-input-group">
                  <span className="titan-input-label">Technician</span>
                  <select
                    className="titan-input"
                    value={assignedUserId}
                    onChange={(event) => {
                      setAssignedUserId(event.target.value);
                      draftShell.touchField();
                    }}
                  >
                    <option value="">Unassigned</option>
                    {assignees.map((assignee) => (
                      <option key={assignee.id} value={assignee.id}>
                        {assignee.firstName} {assignee.lastName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="titan-input-group">
                  <span className="titan-input-label">Vehicle</span>
                  <select
                    className="titan-input"
                    value={vehicleId}
                    onChange={(event) => {
                      setVehicleId(event.target.value);
                      draftShell.touchField();
                    }}
                    disabled={!assignedUserId}
                  >
                    <option value="">No vehicle</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.name}
                        {vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="book-job-form__section">
              <h3>Contact confirmation</h3>
              <Input
                label="Contact name"
                value={contactName}
                onChange={(event) => {
                  setContactName(event.target.value);
                  draftShell.touchField();
                }}
                required
              />
              <div className="book-job-form__grid">
                <Input
                  label="Phone"
                  value={contactPhone}
                  onChange={(event) => {
                    setContactPhone(event.target.value);
                    draftShell.touchField();
                  }}
                  required
                />
                <Input
                  label="Email"
                  value={contactEmail}
                  onChange={(event) => {
                    setContactEmail(event.target.value);
                    draftShell.touchField();
                  }}
                />
              </div>
              <label className="titan-checkbox">
                <input
                  type="checkbox"
                  checked={updateVerifiedCustomer}
                  onChange={(event) => setUpdateVerifiedCustomer(event.target.checked)}
                />
                <span>Also update verified customer phone/email (never silent)</span>
              </label>
            </section>

            <div className="book-job-form__actions">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Create Job & Schedule'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={isSaving}
                onClick={() => void submit('unscheduled')}
              >
                Create Unscheduled Job
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isSaving}
                onClick={() => void handleSaveDraft()}
              >
                Save Draft
              </Button>
              <Button type="button" variant="ghost" disabled={isSaving} onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Panel>
    </div>
  );
}
