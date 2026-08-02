import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRoute } from 'wouter';
import { Button, Input, Panel } from '@titan/ui';
import type {
  WorkflowActionType,
  WorkflowConditionOperator,
  WorkflowDetail,
  WorkflowRunSummary,
  WorkflowStatus,
  WorkflowTriggerType,
} from '@titan/shared';
import {
  WORKFLOW_ACTION_TYPE_OPTIONS,
  WORKFLOW_CONDITION_FIELD_OPTIONS,
  WORKFLOW_CONDITION_OPERATOR_OPTIONS,
  WORKFLOW_STATUS_OPTIONS,
  WORKFLOW_TRIGGER_TYPE_OPTIONS,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  addWorkflowAction,
  addWorkflowCondition,
  addWorkflowTrigger,
  approveWorkflowStepResult,
  fetchWorkflow,
  fetchWorkflowExecutionHistory,
  fetchWorkflowRun,
  fetchWorkflowRuns,
  rejectWorkflowStepResult,
  reorderWorkflowActions,
  runWorkflow,
  updateWorkflow,
} from '../../lib/automation-api';
import type { WorkflowExecutionSummary, WorkflowRunDetail } from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import { AutomationNav } from '../../features/automation/AutomationNav';
import {
  canManageAutomation,
  formatActionType,
  formatExecutionStatus,
  formatRunStatus,
  formatTriggerType,
  formatWorkflowStatus,
} from '../../features/automation/utils';

export function WorkflowDetailPage() {
  const [, params] = useRoute('/automation/:id');
  const workflowId = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [executions, setExecutions] = useState<WorkflowExecutionSummary[]>([]);
  const [runs, setRuns] = useState<WorkflowRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<WorkflowRunDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<WorkflowStatus>('draft');
  const [newTriggerType, setNewTriggerType] = useState<WorkflowTriggerType>('job_completed');
  const [newActionType, setNewActionType] = useState<WorkflowActionType>('send_whatsapp_draft');
  const [conditionField, setConditionField] = useState('invoice.status');
  const [conditionOperator, setConditionOperator] = useState<WorkflowConditionOperator>('equals');
  const [conditionValue, setConditionValue] = useState('sent');

  const canWrite = useMemo(() => (user ? canManageAutomation(user.permissions) : false), [user]);

  async function loadWorkflow() {
    if (!accessToken || !workflowId) return;

    const [workflowData, executionData, runData] = await Promise.all([
      fetchWorkflow(accessToken, workflowId),
      fetchWorkflowExecutionHistory(accessToken, workflowId),
      fetchWorkflowRuns(accessToken, workflowId),
    ]);

    setWorkflow(workflowData);
    setExecutions(executionData);
    setRuns(runData);
    setName(workflowData.name);
    setDescription(workflowData.description ?? '');
    setStatus(workflowData.status);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !workflowId) {
        setIsLoading(false);
        return;
      }

      try {
        await loadWorkflow();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load workflow');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, workflowId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !workflowId) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateWorkflow(accessToken, workflowId, {
        name,
        description: description.trim() || null,
        status,
      });
      await loadWorkflow();
      setIsEditing(false);
      setSuccess('Workflow updated.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update workflow');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddTrigger() {
    if (!accessToken || !canWrite || !workflowId) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await addWorkflowTrigger(accessToken, workflowId, { triggerType: newTriggerType });
      await loadWorkflow();
      setSuccess('Trigger added.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to add trigger');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddAction() {
    if (!accessToken || !canWrite || !workflowId) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await addWorkflowAction(accessToken, workflowId, {
        actionType: newActionType,
        sortOrder: workflow?.actions.length ?? 0,
      });
      await loadWorkflow();
      setSuccess('Action added.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to add action');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddCondition() {
    if (!accessToken || !canWrite || !workflowId) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await addWorkflowCondition(accessToken, workflowId, {
        field: conditionField,
        operator: conditionOperator,
        value: conditionValue.trim() || null,
      });
      await loadWorkflow();
      setSuccess('Condition added.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to add condition');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleMoveAction(actionId: string, direction: 'up' | 'down') {
    if (!accessToken || !canWrite || !workflow) return;

    const index = workflow.actions.findIndex((action) => action.id === actionId);
    if (index < 0) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= workflow.actions.length) return;

    const actionIds = workflow.actions.map((action) => action.id);
    [actionIds[index], actionIds[targetIndex]] = [actionIds[targetIndex], actionIds[index]];

    setIsSaving(true);
    setError(null);

    try {
      const updated = await reorderWorkflowActions(accessToken, workflow.id, { actionIds });
      setWorkflow(updated);
      setSuccess('Action order updated.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to reorder actions');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRunWorkflow() {
    if (!accessToken || !canWrite || !workflowId) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const run = await runWorkflow(accessToken, workflowId);
      setSelectedRun(run);
      await loadWorkflow();
      setSuccess('Workflow run started.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to run workflow');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleViewRun(runId: string) {
    if (!accessToken) return;

    try {
      const run = await fetchWorkflowRun(accessToken, runId);
      setSelectedRun(run);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load run details');
    }
  }

  async function handleApproveStep(stepResultId: string) {
    if (!accessToken || !canWrite) return;

    setIsSaving(true);
    setError(null);

    try {
      const run = await approveWorkflowStepResult(accessToken, stepResultId);
      setSelectedRun(run);
      await loadWorkflow();
      setSuccess('Step approved and executed.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to approve step');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRejectStep(stepResultId: string) {
    if (!accessToken || !canWrite) return;

    setIsSaving(true);
    setError(null);

    try {
      await rejectWorkflowStepResult(accessToken, stepResultId);
      if (selectedRun) {
        const refreshed = await fetchWorkflowRun(accessToken, selectedRun.id);
        setSelectedRun(refreshed);
      }
      await loadWorkflow();
      setSuccess('Step rejected.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to reject step');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="page-shell">
        <PageHeader title="Workflow" description="Workflow detail" />
        <p className="page-muted">Loading workflow…</p>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="automation-page">
        <PageHeader title="Workflow not found" description="This workflow could not be found." />
      </div>
    );
  }

  return (
    <div className="automation-page">
      <PageHeader
        title={workflow.name}
        description="Visual workflow builder with triggers, conditions, ordered actions, and execution history."
        actions={
          <div className="automation-detail-actions">
            {canWrite ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => void handleRunWorkflow()}
                  disabled={isSaving}
                >
                  Run now
                </Button>
                <Button variant="secondary" onClick={() => setIsEditing((value) => !value)}>
                  {isEditing ? 'Cancel editing' : 'Edit workflow'}
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      <AutomationNav />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {isEditing && canWrite ? (
        <form className="automation-form" onSubmit={(event) => void handleSubmit(event)}>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <label className="titan-input-group">
            <span className="titan-input-label">Description</span>
            <textarea
              className="titan-input automation-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Status (enable/disable)</span>
            <select
              className="titan-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as WorkflowStatus)}
            >
              {WORKFLOW_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={isSaving || !name.trim()}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      ) : (
        <Panel title="Workflow details">
          <dl className="automation-detail-grid">
            <div>
              <dt>Status</dt>
              <dd>{formatWorkflowStatus(workflow.status)}</dd>
            </div>
            <div>
              <dt>Created by</dt>
              <dd>{workflow.createdByName}</dd>
            </div>
            <div>
              <dt>Triggers</dt>
              <dd>{workflow.triggerCount}</dd>
            </div>
            <div>
              <dt>Conditions</dt>
              <dd>{workflow.conditionCount}</dd>
            </div>
            <div>
              <dt>Actions</dt>
              <dd>{workflow.actionCount}</dd>
            </div>
            <div>
              <dt>Executions</dt>
              <dd>{workflow.executionCount}</dd>
            </div>
            <div className="automation-detail-grid__full">
              <dt>Description</dt>
              <dd>{workflow.description ?? '—'}</dd>
            </div>
          </dl>
        </Panel>
      )}

      <Panel title="WHEN — Triggers">
        {workflow.triggers.length === 0 ? (
          <p className="page-muted">No triggers configured yet.</p>
        ) : (
          <ul className="automation-list">
            {workflow.triggers.map((trigger) => (
              <li key={trigger.id}>{formatTriggerType(trigger.triggerType)}</li>
            ))}
          </ul>
        )}
        {canWrite ? (
          <div className="automation-inline-form">
            <select
              className="titan-input"
              value={newTriggerType}
              onChange={(e) => setNewTriggerType(e.target.value as WorkflowTriggerType)}
            >
              {WORKFLOW_TRIGGER_TYPE_OPTIONS.filter((option) => option.value !== 'manual').map(
                (option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ),
              )}
            </select>
            <Button type="button" disabled={isSaving} onClick={() => void handleAddTrigger()}>
              Add trigger
            </Button>
          </div>
        ) : null}
      </Panel>

      <Panel title="IF — Conditions">
        {workflow.conditions.length === 0 ? (
          <p className="page-muted">No conditions — workflow runs whenever a trigger matches.</p>
        ) : (
          <ul className="automation-list">
            {workflow.conditions.map((condition) => (
              <li key={condition.id}>
                {condition.field} {condition.operator.replace('_', ' ')}{' '}
                {condition.value ? `"${condition.value}"` : ''}
              </li>
            ))}
          </ul>
        )}
        {canWrite ? (
          <div className="automation-inline-form automation-inline-form--stacked">
            <select
              className="titan-input"
              value={conditionField}
              onChange={(e) => setConditionField(e.target.value)}
            >
              {WORKFLOW_CONDITION_FIELD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="titan-input"
              value={conditionOperator}
              onChange={(e) => setConditionOperator(e.target.value as WorkflowConditionOperator)}
            >
              {WORKFLOW_CONDITION_OPERATOR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Input
              label="Value"
              value={conditionValue}
              onChange={(e) => setConditionValue(e.target.value)}
            />
            <Button type="button" disabled={isSaving} onClick={() => void handleAddCondition()}>
              Add condition
            </Button>
          </div>
        ) : null}
      </Panel>

      <Panel title="THEN — Actions (ordered)">
        {workflow.actions.length === 0 ? (
          <p className="page-muted">No actions configured yet.</p>
        ) : (
          <ol className="automation-list automation-list--ordered">
            {workflow.actions.map((action, index) => (
              <li key={action.id} className="automation-action-row">
                <span>{formatActionType(action.actionType)}</span>
                {canWrite ? (
                  <span className="automation-action-row__controls">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isSaving || index === 0}
                      onClick={() => void handleMoveAction(action.id, 'up')}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isSaving || index === workflow.actions.length - 1}
                      onClick={() => void handleMoveAction(action.id, 'down')}
                    >
                      ↓
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {canWrite ? (
          <div className="automation-inline-form">
            <select
              className="titan-input"
              value={newActionType}
              onChange={(e) => setNewActionType(e.target.value as WorkflowActionType)}
            >
              {WORKFLOW_ACTION_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button type="button" disabled={isSaving} onClick={() => void handleAddAction()}>
              Add action
            </Button>
          </div>
        ) : null}
      </Panel>

      <Panel title="Workflow runs">
        {runs.length === 0 ? (
          <p className="page-muted">
            No runs recorded yet. Activate the workflow and wait for matching events.
          </p>
        ) : (
          <div className="automation-table-wrap">
            <table className="automation-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{formatTriggerType(run.triggerEvent as WorkflowTriggerType)}</td>
                    <td>{formatRunStatus(run.status)}</td>
                    <td>{new Date(run.startedAt).toLocaleString()}</td>
                    <td>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void handleViewRun(run.id)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {selectedRun ? (
        <Panel title={`Run detail — ${formatRunStatus(selectedRun.status)}`}>
          <ol className="automation-list automation-list--ordered">
            {selectedRun.steps.map((step) => (
              <li key={step.id}>
                <strong>{formatActionType(step.actionType)}</strong> — {step.status}
                {step.results.map((result) => (
                  <div key={result.id} className="automation-step-result">
                    {result.preview ? <p className="page-muted">{result.preview}</p> : null}
                    {result.requiresApproval &&
                    result.status === 'awaiting_approval' &&
                    canWrite ? (
                      <div className="automation-inline-form">
                        <Button
                          type="button"
                          disabled={isSaving}
                          onClick={() => void handleApproveStep(result.id)}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isSaving}
                          onClick={() => void handleRejectStep(result.id)}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      <Panel title="Execution history">
        {executions.length === 0 ? (
          <p className="page-muted">No executions recorded yet.</p>
        ) : (
          <div className="automation-table-wrap">
            <table className="automation-table">
              <thead>
                <tr>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Completed</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((execution) => (
                  <tr key={execution.id}>
                    <td>{formatTriggerType(execution.triggerType as WorkflowTriggerType)}</td>
                    <td>{formatExecutionStatus(execution.status)}</td>
                    <td>{new Date(execution.startedAt).toLocaleString()}</td>
                    <td>
                      {execution.completedAt
                        ? new Date(execution.completedAt).toLocaleString()
                        : '—'}
                    </td>
                    <td>{execution.errorMessage ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
