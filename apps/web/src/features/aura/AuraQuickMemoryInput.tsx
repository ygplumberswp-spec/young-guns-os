import { Button } from '@titan/ui';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { AuraMemorySummary } from '@titan/shared';
import { PrimaryAction } from '../../components/ux/PrimaryAction';
import { StatusBadge } from '../../components/ux/StatusBadge';
import { MoreMenu } from '../../components/ux/MoreMenu';
import { ApiClientError } from '../../lib/api-client';
import {
  createAuraMemory,
  deleteAuraMemory,
  fetchAuraMemories,
  updateAuraMemory,
} from '../../lib/intelligence-api';
import {
  AURA_MEMORY_INPUT_PLACEHOLDER,
  shouldExpandAuraMemoryOnEnter,
  shouldSaveAuraMemoryOnEnter,
} from './aura-quick-memory';

type AuraQuickMemoryInputProps = {
  accessToken: string;
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

function formatMemoryTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AuraQuickMemoryInput({ accessToken }: AuraQuickMemoryInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [memories, setMemories] = useState<AuraMemorySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');

  const recentMemories = useMemo(() => memories.slice(0, 8), [memories]);
  const isSaving = saveStatus === 'saving';

  const loadMemories = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchAuraMemories(accessToken);
      setMemories(rows);
    } catch (err) {
      setLoadError(err instanceof ApiClientError ? err.message : 'Unable to load company memory');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  useEffect(() => {
    if (saveStatus !== 'saved') {
      return;
    }

    const timer = window.setTimeout(() => {
      setSaveStatus('idle');
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  async function handleSave(nextDraft = draft) {
    const trimmed = nextDraft.trim();
    if (!trimmed || isSaving) {
      return;
    }

    setSaveStatus('saving');
    setActionError(null);

    try {
      const memory = await createAuraMemory(accessToken, {
        information: trimmed,
        category: 'business_rule',
        importance: 4,
      });
      setMemories((current) => [memory, ...current.filter((row) => row.id !== memory.id)]);
      setDraft('');
      setExpanded(false);
      setSaveStatus('saved');
      inputRef.current?.focus();
    } catch (err) {
      setSaveStatus('failed');
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to save memory');
    }
  }

  async function handleToggleEnabled(memory: AuraMemorySummary) {
    setActionError(null);
    try {
      const updated = await updateAuraMemory(accessToken, memory.id, {
        enabled: !memory.enabled,
      });
      setMemories((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to update memory');
    }
  }

  async function handleDelete(memoryId: string) {
    setActionError(null);
    try {
      await deleteAuraMemory(accessToken, memoryId);
      setMemories((current) => current.filter((row) => row.id !== memoryId));
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to delete memory');
    }
  }

  async function handleSaveEdit(memoryId: string) {
    const trimmed = editingDraft.trim();
    if (!trimmed) {
      return;
    }

    setActionError(null);
    try {
      const updated = await updateAuraMemory(accessToken, memoryId, { information: trimmed });
      setMemories((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setEditingId(null);
      setEditingDraft('');
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to update memory');
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (shouldExpandAuraMemoryOnEnter(event)) {
      event.preventDefault();
      setExpanded(true);
      return;
    }

    if (shouldSaveAuraMemoryOnEnter(event)) {
      event.preventDefault();
      void handleSave();
    }
  }

  return (
    <section className="aura-quick-memory" aria-label="Company memory rules">
      <div className={`aura-quick-memory__composer${expanded ? ' aura-quick-memory__composer--expanded' : ''}`}>
        <textarea
          ref={inputRef}
          className="aura-quick-memory__input"
          value={draft}
          rows={expanded ? 4 : 1}
          placeholder={AURA_MEMORY_INPUT_PLACEHOLDER}
          aria-label={AURA_MEMORY_INPUT_PLACEHOLDER}
          disabled={isSaving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleInputKeyDown}
        />
        <PrimaryAction
          type="button"
          className="aura-quick-memory__save"
          disabled={isSaving || !draft.trim()}
          aria-label="Save"
          onClick={() => void handleSave()}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </PrimaryAction>
      </div>
      {saveStatus === 'saving' ? (
        <p className="aura-quick-memory__status" aria-live="polite">
          Saving…
        </p>
      ) : null}
      {saveStatus === 'saved' ? (
        <p className="aura-quick-memory__status aura-quick-memory__status--saved" aria-live="polite">
          Saved
        </p>
      ) : null}
      {saveStatus === 'failed' ? (
        <p className="aura-quick-memory__status aura-quick-memory__status--failed" aria-live="polite">
          Save failed —{' '}
          <button type="button" className="aura-quick-memory__retry" onClick={() => void handleSave()}>
            Retry
          </button>
        </p>
      ) : null}
      {loadError ? <p className="form-error">{loadError}</p> : null}
      {actionError && saveStatus !== 'failed' ? <p className="form-error">{actionError}</p> : null}

      <div className="aura-quick-memory__recent">
        <h3 className="aura-quick-memory__recent-title">Recent rules</h3>
        {isLoading ? (
          <p className="page-muted">Loading saved rules…</p>
        ) : recentMemories.length === 0 ? (
          <p className="page-muted">No saved rules yet.</p>
        ) : (
          <ul className="aura-quick-memory__list">
            {recentMemories.map((memory) => {
              const isEditing = editingId === memory.id;

              return (
                <li
                  key={memory.id}
                  className={`aura-quick-memory__item${memory.enabled ? '' : ' aura-quick-memory__item--disabled'}`}
                >
                  {isEditing ? (
                    <div className="aura-quick-memory__edit">
                      <textarea
                        className="aura-quick-memory__edit-input"
                        value={editingDraft}
                        rows={3}
                        onChange={(event) => setEditingDraft(event.target.value)}
                      />
                      <div className="aura-quick-memory__edit-actions">
                        <PrimaryAction type="button" onClick={() => void handleSaveEdit(memory.id)}>
                          Save
                        </PrimaryAction>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setEditingId(null);
                            setEditingDraft('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="aura-quick-memory__item-main">
                        <p className="aura-quick-memory__item-text">{memory.information}</p>
                        <p className="aura-quick-memory__item-meta page-muted">
                          Updated {formatMemoryTimestamp(memory.updatedAt)}
                        </p>
                      </div>
                      <div className="aura-quick-memory__item-actions">
                        {!memory.enabled ? (
                          <StatusBadge label="Disabled" tone="warning" />
                        ) : null}
                        <MoreMenu
                          label="Rule actions"
                          items={[
                            {
                              id: 'edit',
                              label: 'Edit',
                              onSelect: () => {
                                setEditingId(memory.id);
                                setEditingDraft(memory.information);
                              },
                            },
                            {
                              id: 'toggle',
                              label: memory.enabled ? 'Disable' : 'Enable',
                              onSelect: () => void handleToggleEnabled(memory),
                            },
                            {
                              id: 'delete',
                              label: 'Delete',
                              onSelect: () => void handleDelete(memory.id),
                            },
                          ]}
                        />
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
