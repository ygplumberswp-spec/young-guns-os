import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'wouter';
import { Button, EmptyState, Input, Panel } from '@titan/ui';
import type { PropertySiteSectionKey, PropertySiteWorkspace } from '@titan/shared';
import {
  PROPERTY_SITE_360_SECTIONS,
  canAccessPropertySite360,
  canWritePropertySite360,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { ApiClientError } from '../../lib/api-client';
import {
  archivePropertySite360,
  fetchPropertySite360Workspace,
  updatePropertySite360,
} from '../../lib/property-site-360-api';
import { useAuth } from '../../lib/auth-context';

export function PropertySite360Page() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id ?? '';
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<PropertySiteSectionKey>('overview');
  const [workspace, setWorkspace] = useState<PropertySiteWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editSuburb, setEditSuburb] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editAccess, setEditAccess] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const canView = useMemo(
    () =>
      user
        ? canAccessPropertySite360({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );
  const canWrite = useMemo(
    () =>
      user
        ? canWritePropertySite360({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );

  async function load() {
    if (!accessToken || !propertyId || !canView) return;
    const data = await fetchPropertySite360Workspace(accessToken, propertyId, {
      limit: 40,
      offset: 0,
      order: 'newest',
    });
    setWorkspace(data);
    setEditName(data.profile.propertyName);
    setEditAddress(data.profile.addressLine1 ?? '');
    setEditSuburb(data.profile.suburb ?? '');
    setEditCity(data.profile.city ?? '');
    setEditAccess(data.profile.accessInstructions ?? '');
    setEditNotes(data.profile.siteNotes ?? '');
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !canView) {
        setLoading(false);
        if (user && (user.roleName === 'Technician' || user.roleName === 'Client')) {
          setError('Internal Property 360 is not available for this role.');
        }
        return;
      }
      try {
        setError(null);
        await load();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load Property 360');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, propertyId, canView, user?.roleName]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canWrite || !workspace) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updatePropertySite360(accessToken, propertyId, {
        propertyName: editName.trim(),
        addressLine1: editAddress.trim() || null,
        suburb: editSuburb.trim() || null,
        city: editCity.trim() || null,
        accessInstructions: editAccess.trim() || null,
        siteNotes: editNotes.trim() || null,
      });
      await load();
      setSuccess('Property updated. Historical job-site snapshots remain unchanged.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update property');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!accessToken || !canWrite) return;
    if (!window.confirm('Archive this property? Hard delete is blocked when history exists.')) return;
    setSaving(true);
    setError(null);
    try {
      const result = await archivePropertySite360(accessToken, propertyId);
      await load();
      setSuccess(
        result.hasJobHistory
          ? 'Archived (job history present — hard delete blocked).'
          : 'Property archived.',
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to archive property');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page-shell">
        <PageHeader title="Property / Site 360" description="Loading site workspace…" />
        <p className="page-muted">Loading…</p>
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div className="page-shell">
        <PageHeader title="Property / Site 360" description="Site workspace unavailable." />
        <Panel title="Error">
          <p className="text-sm text-red-700">{error}</p>
          <Link href="/crm" className="mt-3 inline-block underline">
            Back to CRM
          </Link>
        </Panel>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="page-shell">
        <EmptyState title="Property not found" description="No canonical site for this id." />
      </div>
    );
  }

  const { profile, contacts, equipment, jobs, visits, documents, notes, activity, counts } =
    workspace;

  return (
    <div className="page-shell space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-600">
            <Link href={`/crm/${profile.customerId}`} className="underline">
              ← {profile.customerName}
            </Link>
          </p>
          <PageHeader
            title={profile.propertyName}
            description={profile.addressDisplay || 'No address on file'}
          />
          <p className="mt-1 text-sm text-slate-600">
            Status: <strong>{profile.status}</strong>
            {profile.sourceProvider ? (
              <>
                {' '}
                · Source: {profile.sourceProvider}
                {profile.sourceExternalId ? ` / ${profile.sourceExternalId}` : ''}
              </>
            ) : null}
          </p>
        </div>
        {canWrite ? (
          <Button type="button" variant="secondary" disabled={saving} onClick={() => void handleArchive()}>
            Archive
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {PROPERTY_SITE_360_SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            className={`rounded px-3 py-1.5 text-sm ${
              tab === section.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'
            }`}
            onClick={() => setTab(section.key)}
          >
            {section.label}
            {section.key === 'equipment' ? ` (${counts.equipment})` : ''}
            {section.key === 'jobs' ? ` (${counts.jobs})` : ''}
            {section.key === 'documents' ? ` (${counts.documents})` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Site identity">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-slate-500">Customer</dt>
                <dd>
                  <Link href={`/crm/${profile.customerId}`} className="underline">
                    {profile.customerName}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Address</dt>
                <dd>{profile.addressDisplay || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Primary / site contact</dt>
                <dd>{profile.primaryContactName || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Coordinates</dt>
                <dd>
                  {profile.latitude != null && profile.longitude != null
                    ? `${profile.latitude}, ${profile.longitude}`
                    : 'Not stored (not fabricated)'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Provenance</dt>
                <dd className="text-slate-600">{profile.provenanceNote}</dd>
              </div>
            </dl>
          </Panel>

          {canWrite ? (
            <Panel title="Edit site (current truth)">
              <form className="space-y-3" onSubmit={(e) => void handleSave(e)}>
                <Input label="Site name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                <Input
                  label="Address line 1"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                />
                <Input label="Suburb" value={editSuburb} onChange={(e) => setEditSuburb(e.target.value)} />
                <Input label="City" value={editCity} onChange={(e) => setEditCity(e.target.value)} />
                <Input
                  label="Access instructions"
                  value={editAccess}
                  onChange={(e) => setEditAccess(e.target.value)}
                />
                <Input
                  label="Site notes (internal)"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
                <p className="text-xs text-slate-500">
                  Edits update the live property only. Completed job address snapshots stay immutable.
                </p>
                <Button type="submit" disabled={saving || !editName.trim()}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              </form>
            </Panel>
          ) : (
            <Panel title="Site contacts">
              {contacts.length === 0 ? (
                <EmptyState
                  title="No site contacts linked"
                  description="Link Row 83 customer_people when a real site contact exists."
                />
              ) : (
                <ul className="space-y-2 text-sm">
                  {contacts.map((c) => (
                    <li key={c.id}>
                      <strong>{c.displayName}</strong> · {c.role}
                      {c.isPrimary ? ' · primary' : ''}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      ) : null}

      {tab === 'equipment' ? (
        <Panel title="Equipment / assets">
          {equipment.length === 0 ? (
            <EmptyState
              title="NO VERIFIED EQUIPMENT LINKED"
              description="Nothing invented. Canonical assets appear when linked via registry profiles."
            />
          ) : (
            <ul className="space-y-2">
              {equipment.map((e) => (
                <li key={e.id} className="text-sm">
                  <Link href={e.href} className="font-medium underline">
                    {e.name}
                  </Link>
                  <span className="block text-slate-600">
                    {e.assetType} · {e.status}
                    {e.manufacturer ? ` · ${e.manufacturer}` : ''}
                    {e.model ? ` ${e.model}` : ''}
                    {e.serialNumber ? ` · SN ${e.serialNumber}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === 'jobs' ? (
        <Panel title="Jobs at this property">
          {jobs.length === 0 ? (
            <EmptyState title="No jobs" description="Canonical jobs for this site will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2 pr-3">Job</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Title</th>
                    <th className="py-2 pr-3">Snapshot address</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3">
                        <Link href={j.href} className="underline">
                          {j.jobNumber || j.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{j.status}</td>
                      <td className="py-2 pr-3">{j.title}</td>
                      <td className="py-2 pr-3 text-slate-600">
                        {j.snapshot.street || j.snapshot.formattedAddress || '—'}
                        {j.snapshot.immutable ? ' · immutable' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === 'visits' ? (
        <Panel title="Visits / service history">
          {visits.length === 0 ? (
            <EmptyState
              title="No visits"
              description="Multi-day work stays one job → many visits at this site."
            />
          ) : (
            <ul className="space-y-2 text-sm">
              {visits.map((v) => (
                <li key={v.id}>
                  <Link href={`/jobs/${v.jobId}`} className="underline">
                    {v.jobNumber || v.jobId.slice(0, 8)}
                  </Link>{' '}
                  · Visit #{v.visitNumber} · {v.status}
                  {v.closeReason ? ` · ${v.closeReason}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === 'documents' ? (
        <Panel title="Documents / evidence">
          {documents.length === 0 ? (
            <EmptyState
              title="No documents linked"
              description="Canonical job/customer documents surface here when present."
            />
          ) : (
            <ul className="space-y-2 text-sm">
              {documents.map((d) => (
                <li key={d.id}>
                  <strong>{d.title}</strong>
                  <span className="block text-slate-600">{d.fileName}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === 'notes' ? (
        <Panel title="Site notes (internal)">
          {notes.length === 0 ? (
            <EmptyState
              title="No internal notes"
              description="Technicians do not receive private office notes automatically."
            />
          ) : (
            <ul className="space-y-3 text-sm">
              {notes.map((n) => (
                <li key={n.id} className="rounded border border-slate-100 p-3">
                  <div className="text-xs text-slate-500">
                    {n.authorName} · {new Date(n.createdAt).toLocaleString()} · {n.visibility}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{n.content}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === 'activity' ? (
        <Panel title="Activity">
          {activity.events.length === 0 ? (
            <EmptyState title="No activity" description="Events appear from jobs, visits, and documents." />
          ) : (
            <ul className="space-y-2 text-sm">
              {activity.events.map((e) => (
                <li key={e.id}>
                  <span className="text-slate-500">{new Date(e.occurredAt).toLocaleString()}</span>
                  {' · '}
                  {e.href ? (
                    <Link href={e.href} className="underline">
                      {e.title}
                    </Link>
                  ) : (
                    <strong>{e.title}</strong>
                  )}
                  <span className="block text-slate-600">{e.summary}</span>
                </li>
              ))}
            </ul>
          )}
          {activity.hasMore ? (
            <p className="mt-2 text-xs text-slate-500">More history available — paginated.</p>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
