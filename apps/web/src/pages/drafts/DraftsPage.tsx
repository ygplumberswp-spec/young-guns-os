import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, EmptyState, LoadingState } from '@titan/ui';
import { hasAnyPermission } from '@titan/auth/browser';
import {
  DRAFT_RECORD_TYPES,
  draftContinueHref,
  draftRecordTypeLabel,
  permissionsForDraftType,
  type DraftRecordType,
  type DraftWorkspaceSummary,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useTitanNotify } from '../../components/ux/TitanNotifications';
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
  const { notify } = useTitanNotify();
  const [drafts, setDrafts] = useState<DraftWorkspaceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canAccess = user
    ? hasAnyPermission(user.permissions, [
        'finance:read',
        'finance:write',
        'jobs:read',
        'jobs:write',
        'customers:read',
        'documents:read',
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
      if (!user || !hasAnyPermission(user.permissions, [...permissionsForDraftType(draft.recordType), '*'])) {
        continue;
      }
      map.get(draft.recordType)?.push(draft);
    }
    return map;
  }, [drafts, user]);

  async function handleDuplicate(draft: DraftWorkspaceSummary) {
    if (!accessToken) return;
    setBusyId(draft.id);
    try {
      const copy = await duplicateDraft(accessToken, draft.id);
      notify({
        variant: 'saved',
        message: `Duplicate created — ${copy.title ?? 'Untitled'}`,
      });
      await loadDrafts();
      navigate(draftContinueHref(copy));
    } catch (err) {
      notify({
        variant: 'failed',
        message: err instanceof ApiClientError ? err.message : 'Unable to duplicate draft',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleArchive(draft: DraftWorkspaceSummary) {
    if (!accessToken) return;
    setBusyId(draft.id);
    try {
      await archiveDraft(accessToken, draft.id);
      notify({ variant: 'archived', message: 'Draft archived', dedupeKey: `archive-${draft.id}` });
      await loadDrafts();
    } catch (err) {
      notify({
        variant: 'failed',
        message: err instanceof ApiClientError ? err.message : 'Unable to archive draft',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(draft: DraftWorkspaceSummary) {
    if (!accessToken) return;
    if (!window.confirm(`Delete draft "${draft.title ?? 'Untitled'}"? This cannot be undone.`)) return;
    setBusyId(draft.id);
    try {
      await deleteDraft(accessToken, draft.id);
      notify({ variant: 'deleted', message: 'Draft deleted', dedupeKey: `delete-${draft.id}` });
      await loadDrafts();
    } catch (err) {
      notify({
        variant: 'failed',
        message: err instanceof ApiClientError ? err.message : 'Unable to delete draft',
      });
    } finally {
      setBusyId(null);
    }
  }

  if (!canAccess) {
    return (
      <div className="drafts-page">
        <PageHeader title="Drafts" description="Saved work in progress across TITAN." showBack />
        <EmptyState title="Access restricted" description="You do not have permission to view drafts." />
      </div>
    );
  }

  return (
    <div className="drafts-page">
      <PageHeader
        title="Drafts"
        description="Continue quotes, invoices, jobs, and other work saved automatically."
        showBack
      />

      {isLoading ? <LoadingState label="Loading drafts…" /> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && drafts.length === 0 ? (
        <EmptyState
          title="No drafts yet"
          description="Start a quote, invoice, or job — TITAN will save your progress in the background."
        />
      ) : null}

      {DRAFT_RECORD_TYPES.map((type) => {
        const rows = grouped.get(type) ?? [];
        if (rows.length === 0) return null;
        return (
          <section key={type} className="drafts-page__group">
            <h2 className="drafts-page__group-title">{draftRecordTypeLabel(type)}</h2>
            {rows.map((draft) => (
              <div key={draft.id} className="drafts-page__row">
                <div className="drafts-page__meta">
                  <div className="drafts-page__title">{draft.title ?? 'Untitled draft'}</div>
                  <div className="drafts-page__sub">
                    {draft.customerLabel ? `${draft.customerLabel} · ` : ''}
                    Edited {formatWhen(draft.lastEditedAt)}
                    {draft.lastEditedByName ? ` by ${draft.lastEditedByName}` : ''}
                    {draft.completionPct != null ? ` · ${draft.completionPct}% complete` : ''}
                  </div>
                </div>
                <div className="drafts-page__actions">
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
