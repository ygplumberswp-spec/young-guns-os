import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { Button, Input, PageHeader } from '@titan/ui';
import type { CustomerStatus } from '@titan/shared';
import { CUSTOMER_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { createCustomer } from '../../lib/crm-api';
import { fetchDraft } from '../../lib/drafts-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { canManageCustomers } from '../../features/crm/CustomerList';
import { AutosaveIndicator } from '../../components/ux/AutosaveIndicator';
import { DraftRestoreBanner } from '../../components/ux/DraftRestoreBanner';
import { useFormDraftShell } from '../../hooks/useFormDraftShell';

export function CustomerCreatePage() {
  const { accessToken, user } = useAuth();
  const { invalidateCustomers } = useStaffMutationInvalidation();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<CustomerStatus>('active');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<{
    id: string;
    title: string | null;
    lastEditedAt: string;
    payload: Record<string, unknown>;
  } | null>(null);

  const canWrite = user ? canManageCustomers(user.permissions) : false;

  const draftShell = useFormDraftShell({
    accessToken,
    userId: user?.id,
    recordType: 'customer',
    enabled: canWrite,
    getPayload: () => ({ name, email, phone, status, notes }),
    getMeta: () => ({
      title: name.trim() || 'New customer',
      customerLabel: name.trim() || null,
      completionPct: name.trim() ? (email.trim() || phone.trim() ? 60 : 30) : 10,
    }),
  });

  useEffect(() => {
    if (user && !canWrite) {
      navigate('/crm');
    }
  }, [canWrite, navigate, user]);

  useEffect(() => {
    let cancelled = false;
    async function loadDraft() {
      if (!accessToken) return;
      const params = new URLSearchParams(search);
      const draftId = params.get('draftId');
      if (!draftId) return;
      try {
        const draft = await fetchDraft(accessToken, draftId);
        if (cancelled || draft.recordType !== 'customer') return;
        setPendingDraft({
          id: draft.id,
          title: draft.title,
          lastEditedAt: draft.lastEditedAt,
          payload: draft.payload,
        });
      } catch {
        /* ignore missing draft */
      }
    }
    void loadDraft();
    return () => {
      cancelled = true;
    };
  }, [accessToken, search]);

  function applyDraftPayload(payload: Record<string, unknown>) {
    if (typeof payload.name === 'string') setName(payload.name);
    if (typeof payload.email === 'string') setEmail(payload.email);
    if (typeof payload.phone === 'string') setPhone(payload.phone);
    if (typeof payload.status === 'string') setStatus(payload.status as CustomerStatus);
    if (typeof payload.notes === 'string') setNotes(payload.notes);
    draftShell.touchField();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !canWrite) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const customer = await createCustomer(accessToken, {
        name,
        email: email.trim() || null,
        phone: phone.trim() || null,
        status,
        notes: notes.trim() || null,
      });

      draftShell.markSubmitted();
      invalidateCustomers();
      navigate(`/crm/${customer.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create customer');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="crm-page">
      <PageHeader
        title="New customer"
        description="Create a customer record for your company. Drafts autosave — create still requires an explicit submit."
        actions={
          <Button
            variant="secondary"
            onClick={() => draftShell.guard.guardNavigation(() => navigate('/crm'))}
          >
            Back to customers
          </Button>
        }
      />

      <AutosaveIndicator
        status={draftShell.autosave.status}
        lastSavedAt={draftShell.autosave.lastSavedAt}
      />
      {draftShell.guard.unsavedChangesModal}

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

      {error ? <p className="form-error">{error}</p> : null}

      <form className="crm-form" onSubmit={(event) => void handleSubmit(event)}>
        <Input
          label="Name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            draftShell.touchField();
          }}
          required
        />

        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            draftShell.touchField();
          }}
        />

        <Input
          label="Phone"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            draftShell.touchField();
          }}
        />

        <label className="titan-input-group">
          <span className="titan-input-label">Status</span>
          <select
            className="titan-input"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as CustomerStatus);
              draftShell.touchField();
            }}
          >
            {CUSTOMER_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="titan-input-group">
          <span className="titan-input-label">Notes</span>
          <textarea
            className="titan-input crm-textarea"
            rows={4}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              draftShell.touchField();
            }}
            placeholder="General notes about this customer"
          />
        </label>

        <div className="crm-form__actions">
          <Button type="submit" disabled={isSaving || !name.trim()}>
            {isSaving ? 'Creating…' : 'Create customer'}
          </Button>
          <Link href="/drafts">
            <Button type="button" variant="secondary">
              Open drafts
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
