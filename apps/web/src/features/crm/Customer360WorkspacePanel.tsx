import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel } from '@titan/ui';
import type { Customer360SectionKey, Customer360Workspace } from '@titan/shared';
import { CUSTOMER_360_SECTIONS, canAccessCustomer360, canWriteCustomer360 } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  createCustomer360Person,
  fetchCustomer360Workspace,
  updateCustomer360Person,
} from '../../lib/customer-360-api';
import { useAuth } from '../../lib/auth-context';

type Props = {
  customerId: string;
  initialTab?: Customer360SectionKey;
};

export function Customer360WorkspacePanel({ customerId, initialTab = 'overview' }: Props) {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Customer360SectionKey>(initialTab);
  const [workspace, setWorkspace] = useState<Customer360Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [timelineOrder, setTimelineOrder] = useState<'newest' | 'oldest'>('newest');
  const [displayName, setDisplayName] = useState('');
  const [personEmail, setPersonEmail] = useState('');
  const [personPhone, setPersonPhone] = useState('');
  const [savingPerson, setSavingPerson] = useState(false);

  const canView = useMemo(
    () =>
      user
        ? canAccessCustomer360({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );
  const canWrite = useMemo(
    () =>
      user
        ? canWriteCustomer360({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );

  async function load(order: 'newest' | 'oldest' = timelineOrder) {
    if (!accessToken || !customerId || !canView) return;
    const data = await fetchCustomer360Workspace(accessToken, customerId, {
      limit: 40,
      offset: 0,
      order,
    });
    setWorkspace(data);
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !canView) {
        setLoading(false);
        return;
      }
      try {
        setError(null);
        await load('newest');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load Customer 360');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, customerId, canView]);

  async function handleAddPerson(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canWrite || !displayName.trim()) return;
    setSavingPerson(true);
    setError(null);
    setSuccess(null);
    try {
      await createCustomer360Person(accessToken, customerId, {
        displayName: displayName.trim(),
        email: personEmail.trim() || null,
        phone: personPhone.trim() || null,
        consentStatus: 'unknown',
      });
      setDisplayName('');
      setPersonEmail('');
      setPersonPhone('');
      await load();
      setSuccess('Contact added.');
      setTab('people');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to add contact');
    } finally {
      setSavingPerson(false);
    }
  }

  async function deactivatePerson(personId: string) {
    if (!accessToken || !canWrite) return;
    try {
      await updateCustomer360Person(accessToken, customerId, personId, { status: 'inactive' });
      await load();
      setSuccess('Contact deactivated.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to deactivate contact');
    }
  }

  if (!canView) {
    return (
      <EmptyState
        title="Customer 360 restricted"
        description="Technicians and clients cannot open the full company Customer 360. Use assigned job surfaces or the customer portal."
      />
    );
  }

  if (loading) {
    return <p className="page-muted">Loading Customer 360…</p>;
  }

  if (error && !workspace) {
    return <p className="form-error">{error}</p>;
  }

  if (!workspace) return null;

  const { profile, people, associations, billing, preferences, notes, properties, equipment, leads, timeline } =
    workspace;

  return (
    <div className="customer-360-workspace space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Customer 360</p>
          <h2 className="text-xl font-semibold text-slate-900">{profile.displayName}</h2>
          <p className="text-sm text-slate-600">
            {profile.primaryContactName
              ? `Primary contact: ${profile.primaryContactName}`
              : 'No primary contact set'}
            {profile.xeroContactId ? ` · Xero linked` : ''}
          </p>
        </div>
        <Link href="/crm">
          <Button variant="secondary">Back to customers</Button>
        </Link>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="flex flex-wrap gap-2">
        {CUSTOMER_360_SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            className={`rounded-md border px-3 py-1.5 text-sm ${
              tab === section.key
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700'
            }`}
            onClick={() => setTab(section.key)}
          >
            {section.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <Panel title="Company identity">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Display name</dt>
              <dd>{profile.displayName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Company / trading</dt>
              <dd>{profile.companyName || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">VAT / tax</dt>
              <dd>{profile.vatNumber || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Status</dt>
              <dd>{profile.status}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Email</dt>
              <dd>{profile.email || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Phone</dt>
              <dd>{profile.phone || '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Billing address</dt>
              <dd>{profile.billingAddress || '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Source</dt>
              <dd className="text-sm text-slate-600">{profile.provenanceNote}</dd>
            </div>
          </dl>
        </Panel>
      ) : null}

      {tab === 'people' ? (
        <div className="space-y-4">
          <Panel title="People / contacts">
            {people.length === 0 ? (
              <EmptyState
                title="No people linked yet"
                description="Add named contacts under this company. Related Xero contact records can be associated without merging."
              />
            ) : (
              <ul className="divide-y divide-slate-200">
                {people.map((person) => (
                  <li key={person.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                    <div>
                      <p className="font-medium">
                        {person.displayName}
                        {person.isPrimary ? ' · Primary' : ''}
                        {person.status === 'inactive' ? ' · Inactive' : ''}
                      </p>
                      <p className="text-sm text-slate-600">
                        {[person.roleTitle, person.email, person.phone || person.mobile]
                          .filter(Boolean)
                          .join(' · ') || 'No contact details'}
                      </p>
                      <p className="text-xs text-slate-500">
                        Consent: {person.consentStatus}
                        {person.sourceExternalId ? ` · source ${person.sourceExternalId}` : ''}
                      </p>
                    </div>
                    {canWrite && person.status === 'active' ? (
                      <Button variant="secondary" onClick={() => void deactivatePerson(person.id)}>
                        Deactivate
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {associations.length > 0 ? (
            <Panel title="Associated source identities (non-destructive)">
              <ul className="space-y-2">
                {associations.map((assoc) => (
                  <li key={assoc.id} className="text-sm">
                    <strong>{assoc.sourceCustomerName ?? assoc.sourceCustomerId}</strong>
                    {' — '}
                    {assoc.associationRole}
                    {assoc.sourceExternalId ? ` · Xero ${assoc.sourceExternalId}` : ''}
                    <span className="block text-xs text-slate-500">
                      Financial ownership preserved · no Xero write · no merge
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {canWrite ? (
            <Panel title="Add contact">
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => void handleAddPerson(e)}>
                <Input
                  label="Display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
                <Input
                  label="Email"
                  value={personEmail}
                  onChange={(e) => setPersonEmail(e.target.value)}
                />
                <Input
                  label="Phone"
                  value={personPhone}
                  onChange={(e) => setPersonPhone(e.target.value)}
                />
                <div className="flex items-end">
                  <Button type="submit" disabled={savingPerson}>
                    {savingPerson ? 'Saving…' : 'Add contact'}
                  </Button>
                </div>
              </form>
              <p className="mt-2 text-xs text-slate-500">
                Consent stays unknown until explicitly recorded — never inferred from email/phone.
              </p>
            </Panel>
          ) : null}
        </div>
      ) : null}

      {tab === 'properties' ? (
        <Panel title="Properties / sites">
          {properties.length === 0 ? (
            <EmptyState title="No properties linked" description="Property/Site 360 remains a later item." />
          ) : (
            <ul className="space-y-2">
              {properties.map((p) => (
                <li key={p.id}>
                  <Link href={p.href} className="font-medium text-slate-900 underline">
                    {p.name}
                  </Link>
                  <span className="block text-sm text-slate-600">{p.address || 'No address on file'}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === 'equipment' ? (
        <Panel title="Equipment / assets">
          {equipment.length === 0 ? (
            <EmptyState title="No equipment linked" description="Nothing invented — link via maintenance/assets when real." />
          ) : (
            <ul className="space-y-2">
              {equipment.map((e) => (
                <li key={e.id} className="text-sm">
                  <strong>{e.name}</strong> · {e.assetType} · {e.status}
                  {e.serialNumber ? ` · SN ${e.serialNumber}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === 'leads' ? (
        <Panel title="Leads">
          {leads.length === 0 ? (
            <EmptyState title="No leads" description="No lead records linked to this customer yet." />
          ) : (
            <ul className="space-y-2">
              {leads.map((l) => (
                <li key={l.id}>
                  <Link href={l.href}>{l.title ?? 'Lead'}</Link>
                  <span className="text-sm text-slate-600"> · {l.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {['jobs', 'quotes', 'invoices', 'payments', 'documents', 'communications'].includes(tab) ? (
        <Panel title="Activity timeline">
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              variant={timelineOrder === 'newest' ? 'primary' : 'secondary'}
              onClick={() => {
                setTimelineOrder('newest');
                void load('newest');
              }}
            >
              Newest first
            </Button>
            <Button
              variant={timelineOrder === 'oldest' ? 'primary' : 'secondary'}
              onClick={() => {
                setTimelineOrder('oldest');
                void load('oldest');
              }}
            >
              Oldest first
            </Button>
          </div>
          {timeline.events.filter((e) =>
            tab === 'jobs'
              ? e.kind === 'job'
              : tab === 'quotes'
                ? e.kind === 'quote'
                : tab === 'invoices'
                  ? e.kind === 'invoice'
                  : tab === 'payments'
                    ? e.kind === 'payment'
                    : tab === 'documents'
                      ? e.kind === 'document'
                      : e.kind === 'communication' || e.kind === 'activity',
          ).length === 0 ? (
            <EmptyState
              title={`No ${tab} yet`}
              description="Empty state is truthful — nothing invented for this section."
            />
          ) : (
            <ul className="space-y-3">
              {timeline.events
                .filter((e) =>
                  tab === 'jobs'
                    ? e.kind === 'job'
                    : tab === 'quotes'
                      ? e.kind === 'quote'
                      : tab === 'invoices'
                        ? e.kind === 'invoice'
                        : tab === 'payments'
                          ? e.kind === 'payment'
                          : tab === 'documents'
                            ? e.kind === 'document'
                            : e.kind === 'communication' || e.kind === 'activity',
                )
                .map((event) => (
                  <li key={event.id} className="border-b border-slate-100 pb-2">
                    <p className="text-xs text-slate-500">
                      {new Date(event.occurredAt).toLocaleString()} · {event.kind}
                    </p>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-slate-600">{event.summary}</p>
                    {event.href ? (
                      <Link href={event.href} className="text-sm underline">
                        Open
                      </Link>
                    ) : null}
                  </li>
                ))}
            </ul>
          )}
          {timeline.hasMore ? (
            <p className="mt-2 text-xs text-slate-500">
              Showing {timeline.events.length} of {timeline.total} — load more via pagination on larger histories.
            </p>
          ) : null}
        </Panel>
      ) : null}

      {tab === 'notes' ? (
        <Panel title="Internal notes">
          {notes.length === 0 ? (
            <EmptyState title="No internal notes" description="Office notes stay internal — not shown to technicians by default." />
          ) : (
            <ul className="space-y-3">
              {notes.map((note) => (
                <li key={note.id}>
                  <p className="text-xs text-slate-500">
                    {new Date(note.createdAt).toLocaleString()} · {note.authorName}
                  </p>
                  <p className="text-sm">{note.content}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === 'overview' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Billing">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Company</dt>
                <dd>{billing.companyName || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">VAT</dt>
                <dd>{billing.vatNumber || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Xero contact</dt>
                <dd className="break-all">{billing.xeroContactId || '—'}</dd>
              </div>
              <p className="text-xs text-slate-500">{billing.note}</p>
            </dl>
          </Panel>
          <Panel title="Preferences / consent">
            <p className="text-sm">
              Do not contact: <strong>{preferences.doNotContact ? 'Yes' : 'No'}</strong>
            </p>
            {preferences.marketingConsents.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No explicit marketing consents recorded.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {preferences.marketingConsents.map((c) => (
                  <li key={`${c.channel}-${c.status}`}>
                    {c.channel}: {c.status}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Consent is never inferred from contact presence. Opt-out remains authoritative.
            </p>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
