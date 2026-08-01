import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Button, Input } from '@titan/ui';
import type { WorkflowActionType, WorkflowStatus, WorkflowTriggerType } from '@titan/shared';
import {
  WORKFLOW_ACTION_TYPE_OPTIONS,
  WORKFLOW_STATUS_OPTIONS,
  WORKFLOW_TRIGGER_TYPE_OPTIONS,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { createWorkflow } from '../../lib/automation-api';
import { useAuth } from '../../lib/auth-context';
import { AutomationNav } from '../../features/automation/AutomationNav';
import { canManageAutomation } from '../../features/automation/utils';

export function WorkflowCreatePage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<WorkflowStatus>('draft');
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>('manual');
  const [actionType, setActionType] = useState<WorkflowActionType>('log_customer_activity');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageAutomation(user.permissions) : false;

  useEffect(() => {
    if (user && !canWrite) navigate('/automation');
  }, [canWrite, navigate, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !name.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      const workflow = await createWorkflow(accessToken, {
        name,
        description: description.trim() || null,
        status,
        triggers: [{ triggerType }],
        actions: [{ actionType, sortOrder: 0 }],
      });
      navigate(`/automation/${workflow.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create workflow');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="automation-page">
      <PageHeader
        title="New workflow"
        description="Define a workflow with at least one trigger and one action."
      />
      <AutomationNav />
      {error ? <p className="form-error">{error}</p> : null}

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
          <span className="titan-input-label">Status</span>
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
        <label className="titan-input-group">
          <span className="titan-input-label">Initial trigger</span>
          <select
            className="titan-input"
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value as WorkflowTriggerType)}
          >
            {WORKFLOW_TRIGGER_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="titan-input-group">
          <span className="titan-input-label">Initial action</span>
          <select
            className="titan-input"
            value={actionType}
            onChange={(e) => setActionType(e.target.value as WorkflowActionType)}
          >
            {WORKFLOW_ACTION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={isSaving || !name.trim()}>
          {isSaving ? 'Saving…' : 'Create workflow'}
        </Button>
      </form>
    </div>
  );
}
