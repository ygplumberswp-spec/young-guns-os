import { useState } from 'react';
import { Button } from '@titan/ui';
import type { AgentTaskSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { approveAgentTask, rejectAgentTask, updateAgentTask } from '../../lib/agents-api';

type AuraTaskApprovalCardProps = {
  task: AgentTaskSummary;
  accessToken: string;
  onUpdated: (task: AgentTaskSummary) => void;
};

export function AuraTaskApprovalCard({ task, accessToken, onUpdated }: AuraTaskApprovalCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [preview, setPreview] = useState(task.preview);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (task.status !== 'pending_approval') {
    return (
      <div className="aura-task-card aura-task-card--resolved">
        <p className="aura-task-card__preview">{task.preview}</p>
        <p className="aura-task-card__meta">
          {task.taskType.replaceAll('_', ' ')} · {task.status}
          {task.executedAt ? ` · ${new Date(task.executedAt).toLocaleString()}` : ''}
        </p>
      </div>
    );
  }

  async function handleApprove() {
    setIsBusy(true);
    setError(null);

    try {
      const updated = await approveAgentTask(accessToken, task.id);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to approve task');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReject() {
    setIsBusy(true);
    setError(null);

    try {
      const updated = await rejectAgentTask(accessToken, task.id);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to reject task');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSaveEdit() {
    setIsBusy(true);
    setError(null);

    try {
      const updated = await updateAgentTask(accessToken, task.id, { preview });
      onUpdated(updated);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update task');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="aura-task-card">
      <p className="aura-task-card__label">
        {task.agentName} · {task.taskType.replaceAll('_', ' ')}
      </p>
      {isEditing ? (
        <textarea
          className="titan-input aura-task-card__editor"
          rows={3}
          value={preview}
          onChange={(event) => setPreview(event.target.value)}
        />
      ) : (
        <p className="aura-task-card__preview">{preview}</p>
      )}
      {error ? <p className="form-error">{error}</p> : null}
      <div className="aura-task-card__actions">
        {isEditing ? (
          <>
            <Button type="button" disabled={isBusy} onClick={() => void handleSaveEdit()}>
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
              Cancel edit
            </Button>
          </>
        ) : (
          <>
            <Button type="button" disabled={isBusy} onClick={() => void handleApprove()}>
              Approve
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isBusy}
              onClick={() => setIsEditing(true)}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isBusy}
              onClick={() => void handleReject()}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
