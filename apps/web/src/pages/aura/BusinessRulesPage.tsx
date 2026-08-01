import { useCallback, useEffect, useState } from 'react';
import {
  BUSINESS_RULE_CATEGORIES,
  BUSINESS_RULE_TYPES,
  NAV_LABELS,
  type BusinessRuleSummary,
  type BusinessRuleType,
} from '@titan/shared';
import { Button, LoadingState } from '@titan/ui';
import { useAuth } from '../../lib/auth-context';
import { canWriteCompanyMemory } from '@titan/auth/browser';
import {
  createBusinessRule,
  fetchBusinessRules,
  updateBusinessRule,
} from '../../lib/intelligence-api';
import { ApiClientError } from '../../lib/api-client';
import { BackButton } from '../../components/ux';
import { PrimaryAction } from '../../components/ux/PrimaryAction';
import { StatusBadge } from '../../components/ux/StatusBadge';
import { MoreMenu } from '../../components/ux/MoreMenu';
import { AuraSectionNav } from '../../features/aura/AuraSectionNav';
import { AuraMark } from '../../brand/AuraMark';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

export function BusinessRulesPage() {
  const { user, accessToken } = useAuth();
  const [rules, setRules] = useState<BusinessRuleSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [draft, setDraft] = useState('');
  const [editingRule, setEditingRule] = useState<BusinessRuleSummary | null>(null);

  const canWrite =
    user &&
    canWriteCompanyMemory({ roleName: user.roleName, permissions: user.permissions });

  const loadRules = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchBusinessRules(accessToken);
      setRules(rows);
    } catch (err) {
      setLoadError(err instanceof ApiClientError ? err.message : 'Unable to load business rules');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const timer = window.setTimeout(() => setSaveStatus('idle'), 2500);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  async function handleQuickAdd() {
    const trimmed = draft.trim();
    if (!trimmed || !canWrite || !accessToken || saveStatus === 'saving') return;

    setSaveStatus('saving');
    setActionError(null);

    try {
      const rule = await createBusinessRule(accessToken, {
        name: trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed,
        instruction: trimmed,
        ruleType: 'always_follow',
        category: 'company_wide',
      });
      setRules((current) => [rule, ...current]);
      setDraft('');
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('failed');
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to save rule');
    }
  }

  async function handlePause(rule: BusinessRuleSummary) {
    if (!canWrite || !accessToken) return;
    setActionError(null);
    try {
      const updated = await updateBusinessRule(accessToken, rule.id, {
        status: rule.status === 'paused' ? 'active' : 'paused',
      });
      setRules((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to update rule');
    }
  }

  async function handleArchive(ruleId: string) {
    if (!canWrite || !accessToken) return;
    setActionError(null);
    try {
      await updateBusinessRule(accessToken, ruleId, { status: 'archived' });
      setRules((current) => current.filter((row) => row.id !== ruleId));
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to archive rule');
    }
  }

  async function handleSaveEdit() {
    if (!editingRule || !canWrite || !accessToken) return;
    setActionError(null);
    try {
      const updated = await updateBusinessRule(accessToken, editingRule.id, {
        name: editingRule.name,
        department: editingRule.department,
        instruction: editingRule.instruction,
        ruleType: editingRule.ruleType,
        category: editingRule.category,
        frequencyCron: editingRule.frequencyCron,
        assignedAgentRole: editingRule.assignedAgentRole,
        approvalRequired: editingRule.approvalRequired,
        approvalType: editingRule.approvalType,
      });
      setRules((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setEditingRule(null);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to update rule');
    }
  }

  if (!user) return null;

  return (
    <div className="aura-page aura-rules-page">
      <header className="aura-page__header">
        <BackButton className="aura-page__back" />
        <div className="aura-page__brand">
          <AuraMark size="md" className="aura-page__mark" />
          <div className="aura-page__brand-copy">
            <p className="aura-page__eyebrow">AURA</p>
            <h1 className="aura-page__title">Business Rules</h1>
            <p className="aura-page__subtitle">
              Permanent company rules — always-follow, scheduled reviews, and approval gates. Agents
              follow but never silently modify these rules.
            </p>
          </div>
        </div>
      </header>

      <AuraSectionNav />

      {canWrite ? (
        <div className="aura-rules-page__quick-add">
          <input
            className="aura-rules-page__input"
            type="text"
            value={draft}
            placeholder="Add a company rule…"
            aria-label="Add a company rule"
            disabled={saveStatus === 'saving'}
            onChange={(event) => setDraft(event.target.value)}
          />
          <PrimaryAction
            type="button"
            className="aura-rules-page__save"
            disabled={saveStatus === 'saving' || !draft.trim()}
            onClick={() => void handleQuickAdd()}
          >
            {saveStatus === 'saving' ? 'Saving…' : 'Save'}
          </PrimaryAction>
        </div>
      ) : null}
      {saveStatus === 'saving' ? (
        <p className="aura-rules-page__status" aria-live="polite">
          Saving…
        </p>
      ) : null}
      {saveStatus === 'saved' ? (
        <p className="aura-rules-page__status aura-rules-page__status--saved" aria-live="polite">
          Saved
        </p>
      ) : null}
      {saveStatus === 'failed' ? (
        <p className="aura-rules-page__status aura-rules-page__status--failed" aria-live="polite">
          Save failed
        </p>
      ) : null}

      {loadError ? <p className="form-error">{loadError}</p> : null}
      {actionError && saveStatus !== 'failed' ? <p className="form-error">{actionError}</p> : null}

      {isLoading ? (
        <LoadingState label="Loading business rules…" />
      ) : rules.length === 0 ? (
        <p className="page-muted">No business rules yet.{canWrite ? ' Add one above.' : ''}</p>
      ) : (
        <ul className="aura-rules-page__list">
          {rules.map((rule) => (
            <li key={rule.id} className="aura-rules-page__card">
              <div className="aura-rules-page__card-main">
                <h3 className="aura-rules-page__card-title">{rule.name}</h3>
                <p className="aura-rules-page__card-instruction">{rule.instruction}</p>
                <div className="aura-rules-page__card-meta">
                  {rule.department ? <span>{rule.department}</span> : null}
                  <span>
                    {BUSINESS_RULE_TYPES.find((entry) => entry.value === rule.ruleType)?.label ??
                      rule.ruleType}
                  </span>
                  <span>
                    {BUSINESS_RULE_CATEGORIES.find((entry) => entry.value === rule.category)?.label ??
                      rule.category}
                  </span>
                  {rule.frequencyCron ? <span>{rule.frequencyCron}</span> : null}
                  {rule.assignedAgentRole ? <span>{rule.assignedAgentRole}</span> : null}
                </div>
              </div>
              <div className="aura-rules-page__card-actions">
                <StatusBadge
                  label={rule.status === 'paused' ? 'Paused' : 'Active'}
                  tone={rule.status === 'paused' ? 'warning' : 'success'}
                />
                {rule.approvalRequired ? (
                  <StatusBadge label="Approval required" tone="warning" />
                ) : null}
                {canWrite ? (
                  <MoreMenu
                    label="Rule actions"
                    items={[
                      {
                        id: 'edit',
                        label: 'Edit',
                        onSelect: () => setEditingRule(rule),
                      },
                      {
                        id: 'pause',
                        label: rule.status === 'paused' ? 'Resume' : 'Pause',
                        onSelect: () => void handlePause(rule),
                      },
                      {
                        id: 'archive',
                        label: 'Archive',
                        onSelect: () => void handleArchive(rule.id),
                      },
                    ]}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editingRule ? (
        <div className="aura-rules-page__drawer" role="dialog" aria-label="Edit business rule">
          <div className="aura-rules-page__drawer-panel">
            <h2>Edit rule</h2>
            <label className="aura-rules-page__field">
              <span>Name</span>
              <input
                className="titan-input"
                value={editingRule.name}
                onChange={(event) =>
                  setEditingRule({ ...editingRule, name: event.target.value })
                }
              />
            </label>
            <label className="aura-rules-page__field">
              <span>Department</span>
              <input
                className="titan-input"
                value={editingRule.department ?? ''}
                onChange={(event) =>
                  setEditingRule({ ...editingRule, department: event.target.value || null })
                }
              />
            </label>
            <label className="aura-rules-page__field">
              <span>Instruction</span>
              <textarea
                className="titan-input"
                rows={4}
                value={editingRule.instruction}
                onChange={(event) =>
                  setEditingRule({ ...editingRule, instruction: event.target.value })
                }
              />
            </label>
            <label className="aura-rules-page__field">
              <span>Type</span>
              <select
                className="titan-input"
                value={editingRule.ruleType}
                onChange={(event) =>
                  setEditingRule({
                    ...editingRule,
                    ruleType: event.target.value as BusinessRuleType,
                  })
                }
              >
                {BUSINESS_RULE_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="aura-rules-page__field">
              <span>Schedule (daily, monthly:25, weekly:monday)</span>
              <input
                className="titan-input"
                value={editingRule.frequencyCron ?? ''}
                onChange={(event) =>
                  setEditingRule({
                    ...editingRule,
                    frequencyCron: event.target.value || null,
                  })
                }
              />
            </label>
            <label className="aura-rules-page__field">
              <span>Assigned agent role</span>
              <input
                className="titan-input"
                value={editingRule.assignedAgentRole ?? ''}
                onChange={(event) =>
                  setEditingRule({
                    ...editingRule,
                    assignedAgentRole: event.target.value || null,
                  })
                }
              />
            </label>
            <label className="aura-rules-page__checkbox">
              <input
                type="checkbox"
                checked={editingRule.approvalRequired}
                onChange={(event) =>
                  setEditingRule({ ...editingRule, approvalRequired: event.target.checked })
                }
              />
              <span>Approval required before action</span>
            </label>
            <div className="aura-rules-page__drawer-actions">
              <PrimaryAction type="button" onClick={() => void handleSaveEdit()}>
                Save changes
              </PrimaryAction>
              <Button type="button" variant="secondary" onClick={() => setEditingRule(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <p className="page-muted aura-rules-page__footnote">
        Quick memory on {NAV_LABELS.auraExecutiveChat} remains for informal notes. Business Rules
        here are structured, auditable, and enforced in AURA context.
      </p>
    </div>
  );
}
