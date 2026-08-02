import {
  approveDayPlanSuggestions,
  createDayPlan,
  fetchDayPlans,
  parseDayPlanNaturalLanguage,
  updateDayPlan,
} from '../../lib/intelligence-api';
import { ApiClientError } from '../../lib/api-client';
import { PrimaryAction } from '../../components/ux/PrimaryAction';
import { StatusBadge, type StatusBadgeTone } from '../../components/ux/StatusBadge';
import { MoreMenu } from '../../components/ux/MoreMenu';
import { Button } from '@titan/ui';
import {
  DAY_PLAN_CATEGORIES,
  DAY_PLAN_INPUT_PLACEHOLDERS,
  displayDayPlanStatus,
  formatDayPlanDisplayDate,
  localPlanDateIso,
  type DayPlanCategory,
  type DayPlanParsedItem,
  type DayPlanPriority,
  type DayPlanStatus,
  type DayPlanSummary,
} from '@titan/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type DayPlanningPanelProps = {
  accessToken: string;
  canWrite: boolean;
  compact?: boolean;
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

function formatPriorityTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function displayStatus(plan: DayPlanSummary): string {
  if (plan.status === 'active' && plan.progressPct > 0) {
    return 'In progress';
  }
  return displayDayPlanStatus(plan.status);
}

function statusTone(plan: DayPlanSummary): StatusBadgeTone {
  if (plan.status === 'active' && plan.progressPct > 0) {
    return 'info';
  }
  if (plan.status === 'completed') {
    return 'success';
  }
  if (plan.status === 'archived') {
    return 'warning';
  }
  return 'neutral';
}

export function DayPlanningPanel({ accessToken, canWrite, compact = false }: DayPlanningPanelProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const planDate = useMemo(() => localPlanDateIso(), []);
  const [draft, setDraft] = useState('');
  const [category, setCategory] = useState<DayPlanCategory | ''>('');
  const [priority, setPriority] = useState<DayPlanPriority>('normal');
  const [plans, setPlans] = useState<DayPlanSummary[]>([]);
  const [suggestions, setSuggestions] = useState<DayPlanParsedItem[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [unsafeHints, setUnsafeHints] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [placeholderIndex] = useState(() =>
    Math.floor(Math.random() * DAY_PLAN_INPUT_PLACEHOLDERS.length),
  );

  const speechSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const isSaving = saveStatus === 'saving';
  const activeCount = useMemo(
    () => plans.filter((plan) => plan.status === 'active').length,
    [plans],
  );

  const loadPlans = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await fetchDayPlans(accessToken, planDate);
      setPlans(result.plans);
    } catch (err) {
      setLoadError(err instanceof ApiClientError ? err.message : "Unable to load today's priorities");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, planDate]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (saveStatus !== 'saved') {
      return;
    }

    const timer = window.setTimeout(() => {
      setSaveStatus('idle');
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  async function handleParse() {
    const trimmed = draft.trim();
    if (!trimmed || isParsing || !canWrite) {
      return;
    }

    setIsParsing(true);
    setActionError(null);
    try {
      const parsed = await parseDayPlanNaturalLanguage(accessToken, {
        text: trimmed,
        planDate,
      });
      setSuggestions(parsed.items);
      setSelectedIndexes(new Set(parsed.items.map((_, index) => index)));
      setUnsafeHints(parsed.unsafeExecutionHints);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to parse priorities');
    } finally {
      setIsParsing(false);
    }
  }

  async function handleApproveSuggestions() {
    if (!canWrite || isApproving || selectedIndexes.size === 0) {
      return;
    }

    setIsApproving(true);
    setActionError(null);
    try {
      const items = suggestions.filter((_, index) => selectedIndexes.has(index));
      const result = await approveDayPlanSuggestions(accessToken, {
        planDate,
        items: items.map((item) => ({
          content: item.content,
          category: item.category,
          priority: item.priority,
          department: item.department,
          approvalRequired: item.approvalRequired,
        })),
      });
      setPlans((current) => {
        const merged = [...result.plans, ...current];
        const seen = new Set<string>();
        return merged.filter((plan) => {
          if (seen.has(plan.id)) return false;
          seen.add(plan.id);
          return true;
        });
      });
      setSuggestions([]);
      setSelectedIndexes(new Set());
      setUnsafeHints([]);
      setDraft('');
      setSaveStatus('saved');
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to approve suggestions');
    } finally {
      setIsApproving(false);
    }
  }

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed || isSaving || !canWrite) {
      return;
    }

    setSaveStatus('saving');
    setActionError(null);

    try {
      const plan = await createDayPlan(accessToken, {
        content: trimmed,
        planDate,
        category: category || undefined,
        priority,
      });
      setPlans((current) => [plan, ...current.filter((row) => row.id !== plan.id)]);
      setDraft('');
      setCategory('');
      setPriority('normal');
      setSuggestions([]);
      setUnsafeHints([]);
      setSaveStatus('saved');
      inputRef.current?.focus();
    } catch (err) {
      setSaveStatus('failed');
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to save priority');
    }
  }

  function startListening() {
    if (!speechSupported || !canWrite) return;
    type SpeechRec = {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
    };
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const SpeechRecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-ZA';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setIsListening(true);
    setActionError(null);
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setDraft((current) => (current ? `${current.trim()} ${transcript}` : transcript));
      }
    };
    recognition.onerror = () => {
      setActionError('Speech recognition failed — type priorities instead.');
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  }

  async function handleStatusChange(
    plan: DayPlanSummary,
    update: { status?: DayPlanStatus; progressPct?: number },
  ) {
    if (!canWrite) {
      return;
    }

    setActionError(null);
    try {
      const updated = await updateDayPlan(accessToken, plan.id, update);
      setPlans((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to update priority');
    }
  }

  function categoryLabel(value: DayPlanCategory | null): string | null {
    if (!value) {
      return null;
    }

    return DAY_PLAN_CATEGORIES.find((entry) => entry.value === value)?.label ?? value;
  }

  function toggleSuggestion(index: number) {
    setSelectedIndexes((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <section
      className={`day-planning${compact ? ' day-planning--compact' : ''}`}
      aria-label="Today's plan"
    >
      <div className="day-planning__header">
        <div>
          <h3 className="day-planning__title">Today&apos;s plan</h3>
          <p className="day-planning__date page-muted">
            {formatDayPlanDisplayDate(planDate)}
            {activeCount > 0 ? ` · ${activeCount} active` : ''}
          </p>
        </div>
      </div>

      {canWrite ? (
        <>
          <div className="day-planning__composer day-planning__composer--nl">
            <textarea
              ref={inputRef}
              className="day-planning__input day-planning__textarea"
              value={draft}
              placeholder={`${DAY_PLAN_INPUT_PLACEHOLDERS[placeholderIndex]} (speak or type — Parse suggests items, Approve saves)`}
              aria-label="Describe today's priorities in natural language"
              disabled={isSaving || isParsing || isApproving}
              rows={3}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="day-planning__composer-actions">
              {speechSupported ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isListening || isParsing || isApproving}
                  onClick={startListening}
                >
                  {isListening ? 'Listening…' : 'Speak'}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isParsing || !draft.trim() || isApproving}
                onClick={() => void handleParse()}
              >
                {isParsing ? 'Parsing…' : 'Parse suggestions'}
              </Button>
              <select
                className="titan-input day-planning__select"
                value={priority}
                aria-label="Priority for quick save"
                disabled={isSaving}
                onChange={(event) => setPriority(event.target.value as DayPlanPriority)}
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
              <select
                className="titan-input day-planning__select"
                value={category}
                aria-label="Category for quick save"
                disabled={isSaving}
                onChange={(event) => setCategory(event.target.value as DayPlanCategory | '')}
              >
                <option value="">Optional category</option>
                {DAY_PLAN_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <PrimaryAction
                type="button"
                className="day-planning__save"
                disabled={isSaving || !draft.trim() || suggestions.length > 0}
                aria-label="Quick save single priority"
                onClick={() => void handleSave()}
              >
                {isSaving ? 'Saving…' : 'Quick save'}
              </PrimaryAction>
            </div>
          </div>

          {suggestions.length > 0 ? (
            <div className="day-planning__suggestions" aria-live="polite">
              <p className="day-planning__suggestions-title">
                Suggested plan items — review, then Owner approve. Nothing is saved until you approve.
              </p>
              {unsafeHints.length > 0 ? (
                <p className="day-planning__status day-planning__status--failed" role="status">
                  Safety: utterance mentions {unsafeHints.join(', ')}. TITAN will only create plan
                  text — no payments, customer sends, or Xero writes.
                </p>
              ) : null}
              <ul className="day-planning__suggestion-list">
                {suggestions.map((item, index) => (
                  <li key={`${item.content}-${index}`} className="day-planning__suggestion-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedIndexes.has(index)}
                        onChange={() => toggleSuggestion(index)}
                      />{' '}
                      <strong>{item.content}</strong>
                      <span className="page-muted">
                        {' '}
                        · {item.category ?? 'uncategorised'} · {item.priority}
                        {item.approvalRequired ? ' · approval flagged' : ''}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="day-planning__composer-actions">
                <PrimaryAction
                  type="button"
                  disabled={isApproving || selectedIndexes.size === 0}
                  onClick={() => void handleApproveSuggestions()}
                >
                  {isApproving ? 'Approving…' : `Approve ${selectedIndexes.size} selected`}
                </PrimaryAction>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isApproving}
                  onClick={() => {
                    setSuggestions([]);
                    setSelectedIndexes(new Set());
                    setUnsafeHints([]);
                  }}
                >
                  Dismiss suggestions
                </Button>
              </div>
            </div>
          ) : null}

          {saveStatus === 'saving' ? (
            <p className="day-planning__status" aria-live="polite">
              Saving…
            </p>
          ) : null}
          {saveStatus === 'saved' ? (
            <p className="day-planning__status day-planning__status--saved" aria-live="polite">
              Saved
            </p>
          ) : null}
          {saveStatus === 'failed' ? (
            <p className="day-planning__status day-planning__status--failed" aria-live="polite">
              Save failed —{' '}
              <button type="button" className="day-planning__retry" onClick={() => void handleSave()}>
                Retry
              </button>
            </p>
          ) : null}
        </>
      ) : null}

      {loadError ? <p className="form-error">{loadError}</p> : null}
      {actionError && saveStatus !== 'failed' ? <p className="form-error">{actionError}</p> : null}

      {isLoading ? (
        <p className="page-muted">Loading today&apos;s priorities…</p>
      ) : plans.length === 0 ? (
        <p className="page-muted">
          {canWrite
            ? 'No priorities set yet. Speak or type today’s focus, then Parse → Approve.'
            : 'No priorities set for today.'}
        </p>
      ) : (
        <ul className="day-planning__list">
          {plans.map((plan) => {
            const dept = categoryLabel(plan.category);

            return (
              <li
                key={plan.id}
                className={`day-planning__item${plan.priority === 'high' ? ' day-planning__item--high' : ''}${plan.status === 'completed' ? ' day-planning__item--completed' : ''}`}
              >
                <label className="day-planning__check">
                  <input
                    type="checkbox"
                    checked={plan.status === 'completed'}
                    disabled={!canWrite}
                    aria-label={`Mark complete: ${plan.content}`}
                    onChange={() =>
                      void handleStatusChange(plan, {
                        status: plan.status === 'completed' ? 'active' : 'completed',
                        progressPct: plan.status === 'completed' ? 0 : 100,
                      })
                    }
                  />
                </label>
                <div className="day-planning__item-main">
                  <p className="day-planning__item-text">{plan.content}</p>
                  <div className="day-planning__item-meta">
                    {plan.priority === 'high' ? (
                      <StatusBadge label="High priority" tone="warning" />
                    ) : null}
                    <StatusBadge label={displayStatus(plan)} tone={statusTone(plan)} />
                    {dept ? <StatusBadge label={dept} tone="info" /> : null}
                    {plan.source === 'aura_suggested' ? (
                      <StatusBadge label="Approved suggestion" tone="info" />
                    ) : null}
                    <span className="page-muted">
                      Set {formatPriorityTimestamp(plan.createdAt)}
                    </span>
                  </div>
                </div>
                {canWrite ? (
                  <MoreMenu
                    label="Plan actions"
                    items={[
                      ...(plan.status !== 'archived'
                        ? [
                            {
                              id: 'archive',
                              label: 'Archive',
                              onSelect: () =>
                                void handleStatusChange(plan, { status: 'archived' }),
                            },
                          ]
                        : []),
                    ]}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
