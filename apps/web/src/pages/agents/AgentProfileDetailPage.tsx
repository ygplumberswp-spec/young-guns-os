import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { Button, Input, PageHeader, Panel } from '@titan/ui';
import type { AgentProfileDetail, AgentProfileStatus } from '@titan/shared';
import { AGENT_PROFILE_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchAgentProfile,
  fetchAgentProfileExecutions,
  setAgentProfilePermissions,
  setAgentProfileTools,
  updateAgentProfile,
} from '../../lib/agents-api';
import type { AgentExecutionSummary } from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import { AgentsNav } from '../../features/agents/AgentsNav';
import {
  canManageAgents,
  formatAgentExecutionStatus,
  formatAgentKey,
  formatAgentProfileStatus,
} from '../../features/agents/utils';

const PERMISSION_OPTIONS = [
  'customers:read',
  'jobs:read',
  'dispatch:read',
  'finance:read',
  'inventory:read',
  'fleet:read',
  'communications:read',
  'documents:read',
  'automation:read',
  'agents:read',
];

export function AgentProfileDetailPage() {
  const [, params] = useRoute('/aura/agents/:id');
  const profileId = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const [profile, setProfile] = useState<AgentProfileDetail | null>(null);
  const [executions, setExecutions] = useState<AgentExecutionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<AgentProfileStatus>('draft');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>({});

  const canWrite = useMemo(() => (user ? canManageAgents(user.permissions) : false), [user]);

  async function loadProfile() {
    if (!accessToken || !profileId) return;

    const [profileData, executionData] = await Promise.all([
      fetchAgentProfile(accessToken, profileId),
      fetchAgentProfileExecutions(accessToken, profileId),
    ]);

    setProfile(profileData);
    setExecutions(executionData);
    setName(profileData.name);
    setDescription(profileData.description ?? '');
    setStatus(profileData.status);
    setSelectedPermissions(profileData.permissions);
    setEnabledTools(
      Object.fromEntries(profileData.tools.map((tool) => [tool.toolKey, tool.enabled])),
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !profileId) {
        setIsLoading(false);
        return;
      }

      try {
        await loadProfile();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load agent profile');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, profileId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !profileId) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateAgentProfile(accessToken, profileId, {
        name,
        description: description.trim() || null,
        status,
      });
      await loadProfile();
      setIsEditing(false);
      setSuccess('Profile updated.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update profile');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSavePermissions() {
    if (!accessToken || !canWrite || !profileId) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await setAgentProfilePermissions(accessToken, profileId, {
        permissions: selectedPermissions,
      });
      await loadProfile();
      setSuccess('Permissions updated.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update permissions');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveTools() {
    if (!accessToken || !canWrite || !profile || !profileId) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await setAgentProfileTools(accessToken, profileId, {
        tools: profile.tools.map((tool) => ({
          toolKey: tool.toolKey,
          enabled: enabledTools[tool.toolKey] ?? false,
          config: tool.config,
        })),
      });
      await loadProfile();
      setSuccess('Tool grants updated.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update tools');
    } finally {
      setIsSaving(false);
    }
  }

  function togglePermission(permission: string) {
    setSelectedPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  }

  if (isLoading) return <p className="page-muted">Loading agent profile…</p>;

  if (!profile) {
    return (
      <div className="agents-page">
        <PageHeader
          title="Profile not found"
          description="This agent profile could not be found."
        />
        <Link href="/aura/agents" className="agents-link">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="agents-page">
      <PageHeader
        title={profile.name}
        description={`${formatAgentKey(profile.agentKey)} profile with permissions and tool grants.`}
        actions={
          <div className="agents-detail-actions">
            <Link href="/aura/agents">
              <Button variant="secondary">Back to dashboard</Button>
            </Link>
            {canWrite ? (
              <Button variant="secondary" onClick={() => setIsEditing((value) => !value)}>
                {isEditing ? 'Cancel editing' : 'Edit profile'}
              </Button>
            ) : null}
          </div>
        }
      />
      <AgentsNav />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {profile.foundationOnly ? (
        <p className="agents-notice">
          This agent type is foundation-only. Hiring automation and autonomous execution are not
          connected yet.
        </p>
      ) : null}

      {isEditing && canWrite ? (
        <form className="agents-form" onSubmit={(event) => void handleSubmit(event)}>
          <Input
            label="Profile name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <label className="titan-input-group">
            <span className="titan-input-label">Description</span>
            <textarea
              className="titan-input agents-textarea"
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
              onChange={(e) => setStatus(e.target.value as AgentProfileStatus)}
            >
              {AGENT_PROFILE_STATUS_OPTIONS.map((option) => (
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
        <Panel title="Profile details">
          <dl className="agents-detail-grid">
            <div>
              <dt>Agent type</dt>
              <dd>{formatAgentKey(profile.agentKey)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{formatAgentProfileStatus(profile.status)}</dd>
            </div>
            <div>
              <dt>Created by</dt>
              <dd>{profile.createdByName}</dd>
            </div>
            <div>
              <dt>Permissions</dt>
              <dd>{profile.permissionCount}</dd>
            </div>
            <div>
              <dt>Enabled tools</dt>
              <dd>{profile.enabledToolCount}</dd>
            </div>
            <div>
              <dt>Executions</dt>
              <dd>{profile.executionCount}</dd>
            </div>
            <div className="agents-detail-grid__full">
              <dt>Description</dt>
              <dd>{profile.description ?? '—'}</dd>
            </div>
          </dl>
        </Panel>
      )}

      <Panel title="Agent permissions">
        <div className="agents-permission-grid">
          {PERMISSION_OPTIONS.map((permission) => (
            <label key={permission} className="agents-permission-option">
              <input
                type="checkbox"
                checked={selectedPermissions.includes(permission)}
                disabled={!canWrite || isSaving}
                onChange={() => togglePermission(permission)}
              />
              <span>{permission}</span>
            </label>
          ))}
        </div>
        {canWrite ? (
          <Button type="button" disabled={isSaving} onClick={() => void handleSavePermissions()}>
            Save permissions
          </Button>
        ) : null}
      </Panel>

      <Panel title="Tool framework grants">
        <p className="page-muted">
          Tools are registered for future execution. No tool runs automatically in this foundation
          milestone.
        </p>
        <div className="agents-tool-list">
          {profile.tools.map((tool) => (
            <label key={tool.toolKey} className="agents-tool-option">
              <input
                type="checkbox"
                checked={enabledTools[tool.toolKey] ?? false}
                disabled={!canWrite || isSaving}
                onChange={(event) =>
                  setEnabledTools((current) => ({
                    ...current,
                    [tool.toolKey]: event.target.checked,
                  }))
                }
              />
              <div>
                <strong>{tool.name}</strong>
                <p className="page-muted">{tool.description}</p>
                <p className="agents-tool-option__meta">{tool.category}</p>
              </div>
            </label>
          ))}
        </div>
        {canWrite ? (
          <Button type="button" disabled={isSaving} onClick={() => void handleSaveTools()}>
            Save tool grants
          </Button>
        ) : null}
      </Panel>

      <Panel title="Execution history">
        {executions.length === 0 ? (
          <p className="page-muted">
            No executions recorded yet. Agents do not run autonomously in this foundation milestone.
          </p>
        ) : (
          <div className="agents-table-wrap">
            <table className="agents-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Mode</th>
                  <th>Started</th>
                  <th>Completed</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((execution) => (
                  <tr key={execution.id}>
                    <td>{formatAgentExecutionStatus(execution.status)}</td>
                    <td>{execution.executionMode}</td>
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
