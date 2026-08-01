import {
  createDayPlan,
  fetchDayPlans,
  updateDayPlan,
} from '../../lib/intelligence-api';
import { ApiClientError } from '../../lib/api-client';
import { PrimaryAction } from '../../components/ux/PrimaryAction';
import { StatusBadge, type StatusBadgeTone } from '../../components/ux/StatusBadge';
import { MoreMenu } from '../../components/ux/MoreMenu';
import {
  DAY_PLAN_CATEGORIES,
  DAY_PLAN_INPUT_PLACEHOLDERS,
  displayDayPlanStatus,
  formatDayPlanDisplayDate,
  localPlanDateIso,
  type DayPlanCategory,
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
  const inputRef = useRef<HTMLInputElement>(null);
  const planDate = useMemo(() => localPlanDateIso(), []);
  const [draft, setDraft] = useState('');
  const [category, setCategory] = useState<DayPlanCategory | ''>('');
  const [priority, setPriority] = useState<DayPlanPriority>('normal');
  const [plans, setPlans] = useState<DayPlanSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [placeholderIndex] = useState(() =>
    Math.floor(Math.random() * DAY_PLAN_INPUT_PLACEHOLDERS.length),
  );

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
      setLoadError(err instanceof ApiClientError ? err.message : 'Unable to load today\'s priorities');
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
      setSaveStatus('saved');
      inputRef.current?.focus();
    } catch (err) {
      setSaveStatus('failed');
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to save priority');
    }
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
          <div className="day-planning__composer">
            <input
              ref={inputRef}
              className="day-planning__input"
              type="text"
              value={draft}
              placeholder={DAY_PLAN_INPUT_PLACEHOLDERS[placeholderIndex]}
              aria-label="Add a priority for today"
              disabled={isSaving}
              onChange={(event) => setDraft(event.target.value)}
            />
            <select
              className="titan-input day-planning__select"
              value={priority}
              aria-label="Priority"
              disabled={isSaving}
              onChange={(event) => setPriority(event.target.value as DayPlanPriority)}
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
            <select
              className="titan-input day-planning__select"
              value={category}
              aria-label="Category"
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
              disabled={isSaving || !draft.trim()}
              aria-label="Save"
              onClick={() => void handleSave()}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </PrimaryAction>
          </div>
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
            ? 'No priorities set yet. Add today’s operational focus above.'
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
