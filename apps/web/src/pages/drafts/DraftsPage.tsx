import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, EmptyState, LoadingState, PageHeader } from '@titan/ui';
import { hasAnyPermission } from '@titan/auth/browser';
import {
  DRAFT_RECORD_TYPES,
  draftContinueHref,
  draftRecordTypeLabel,
  permissionsForDraftType,
  type DraftRecordType,
  type DraftWorkspaceSummary,
} from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import { ApiClientError } from '../../lib/api-client';
import {
  archiveDraft,
  deleteDraft,
  duplicateDraft,
  fetchDrafts,
} from '../../lib/drafts-api';

function formatWhen(value: string): string {
  return new Date(value).toLocaleString();
}

export function DraftsPage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const [drafts, setDrafts] = useState<DraftWorkspaceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canAccess = user
    ? hasAnyPermission(user.permissions, [
        'finance:read',
        'finance:write',
        'jobs:read',
        'jobs:write',
        'customers:read',
        'documents:read',
        'marketing:read',
        'procurement:read',
        '*',
      ])
    : false;

  const loadDrafts = useCallback(async () => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    setError(null);
    try {
      const rows = await fetchDrafts(accessToken, { status: 'active' });
      setDrafts(rows);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load drafts');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  const grouped = useMemo(() => {
    const map = new Map<DraftRecordType, DraftWorkspaceSummary[]>();
    for (const type of DRAFT_RECORD_TYPES) {
      map.set(type, []);
    }
    for (const draft of drafts) {
      if (
        !user ||
        !hasAnyPermission(user.permissions, [...permissionsForDraftType(draft.recordType), '*'])
      ) {
        continue;
      }
      map.get(draft.recordType)?.push(draft);
    }
    return map;
  }, [drafts, user]);

  async function handleDuplicate(draft: DraftWorkspaceSummary) {
    if (!accessToken) return;
    setBusyId(draft.id);
    setSuccess(null);
    try {
      const copy = await duplicateDraft(accessToken, draft.id);
      setSuccess(`Duplicate created — ${copy.title ?? 'Untitled'}`);
      await loadDrafts();
      navigate(draftContinueHref(copy));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to duplicate draft');
    } finally {
      setBusyId(null);
    }
  }

  async function handleArchive(draft: DraftWorkspaceSummary) {
    if (!accessToken) return;
    setBusyId(draft.id);
    setSuccess(null);
    try {
      await archiveDraft(accessToken, draft.id);
      setSuccess('Draft archived');
      await loadDrafts();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to archive draft');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(draft: DraftWorkspaceSummary) {
    if (!accessToken) return;
    if (!window.confirm(`Delete draft "${draft.title ?? 'Untitled'}"? This cannot be undone.`)) return;
    setBusyId(draft.id);
    setSuccess(null);
    try {
      await deleteDraft(accessToken, draft.id);
      setSuccess('Draft deleted');
      await loadDrafts();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to delete draft');
    } finally {
      setBusyId(null);
    }
  }

  if (!canAccess) {
    return (
      <div className="drafts-page">
        <PageHeader title="Drafts" description="Saved work in progress across TITAN." />
        <EmptyState title="Access restricted" description="You do not have permission to view drafts." />
      </div>
    );
  }

  return (
    <div className="drafts-page">
      <PageHeader
        title="Drafts"
        description="Continue customer, purchase order, document, marketing, and other work saved automatically. Publishing and sending stay approval-gated."
        actions={
          <Link href="/">
            <Button variant="secondary">Home</Button>
          </Link>
        }
      />

      {isLoading ? <LoadingState label="Loading drafts…" /> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {!isLoading && drafts.length === 0 ? (
        <EmptyState
          title="No drafts yet"
          description="Start a customer, purchase order, document, or marketing audience form — TITAN saves draft fields in the background without submitting."
        />
      ) : null}

      {DRAFT_RECORD_TYPES.map((type) => {
        const rows = grouped.get(type) ?? [];
        if (rows.length === 0) return null;
        return (
          <section key={type} className="drafts-page__group" style={{ marginBottom: '1.5rem' }}>
            <h2 className="page-section-title">{draftRecordTypeLabel(type)}</h2>
            {rows.map((draft) => (
              <div
                key={draft.id}
                className="drafts-page__row"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 0',
                  borderBottom: '1px solid var(--titan-border-subtle, #e2e8f0)',
                }}
              >
                <div>
                  <div>
                    <strong>{draft.title ?? 'Untitled draft'}</strong>
                  </div>
                  <div className="page-muted">
                    {draft.customerLabel ? `${draft.customerLabel} · ` : ''}
                    Edited {formatWhen(draft.lastEditedAt)}
                    {draft.lastEditedByName ? ` by ${draft.lastEditedByName}` : ''}
                    {draft.completionPct != null ? ` · ${draft.completionPct}% complete` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <Link href={draftContinueHref(draft)}>
                    <Button variant="secondary" disabled={busyId === draft.id}>
                      Continue
                    </Button>
                  </Link>
                  <Button
                    variant="secondary"
                    disabled={busyId === draft.id}
                    onClick={() => void handleDuplicate(draft)}
                  >
                    Duplicate
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busyId === draft.id}
                    onClick={() => void handleArchive(draft)}
                  >
                    Archive
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busyId === draft.id}
                    onClick={() => void handleDelete(draft)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
