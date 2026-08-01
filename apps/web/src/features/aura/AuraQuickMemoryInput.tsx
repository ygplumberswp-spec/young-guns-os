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
  AURA_MEMORY_SAVED_MESSAGE,
  shouldExpandAuraMemoryOnEnter,
  shouldSaveAuraMemoryOnEnter,
} from './aura-quick-memory';

type AuraQuickMemoryInputProps = {
  accessToken: string;
};

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
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');

  const recentMemories = useMemo(() => memories.slice(0, 8), [memories]);

  const loadMemories = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await fetchAuraMemories(accessToken);
      setMemories(rows);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load company memory');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  async function handleSave(nextDraft = draft) {
    const trimmed = nextDraft.trim();
    if (!trimmed || isSaving) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const memory = await createAuraMemory(accessToken, {
        information: trimmed,
        category: 'business_rule',
        importance: 4,
      });
      setMemories((current) => [memory, ...current.filter((row) => row.id !== memory.id)]);
      setDraft('');
      setExpanded(false);
      setSuccessMessage(AURA_MEMORY_SAVED_MESSAGE);
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save memory');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleEnabled(memory: AuraMemorySummary) {
    setError(null);
    try {
      const updated = await updateAuraMemory(accessToken, memory.id, {
        enabled: !memory.enabled,
      });
      setMemories((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update memory');
    }
  }

  async function handleDelete(memoryId: string) {
    setError(null);
    try {
      await deleteAuraMemory(accessToken, memoryId);
      setMemories((current) => current.filter((row) => row.id !== memoryId));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to delete memory');
    }
  }

  async function handleSaveEdit(memoryId: string) {
    const trimmed = editingDraft.trim();
    if (!trimmed) {
      return;
    }

    setError(null);
    try {
      const updated = await updateAuraMemory(accessToken, memoryId, { information: trimmed });
      setMemories((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setEditingId(null);
      setEditingDraft('');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update memory');
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
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleInputKeyDown}
        />
        <PrimaryAction
          type="button"
          className="aura-quick-memory__save"
          disabled={isSaving || !draft.trim()}
          onClick={() => void handleSave()}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </PrimaryAction>
      </div>
      <p className="aura-quick-memory__hint page-muted">
        Enter to save · Shift+Enter for a longer note
      </p>
      {successMessage ? <p className="form-success">{successMessage}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

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
