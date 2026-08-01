import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button, Input } from '@titan/ui';
import type { AgentKey, AgentProfileStatus, AgentRegistryEntry } from '@titan/shared';
import { AGENT_PROFILE_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { createAgentProfile, fetchAgentRegistry } from '../../lib/agents-api';
import { useAuth } from '../../lib/auth-context';
import { AgentsNav } from '../../features/agents/AgentsNav';
import { canManageAgents, formatAgentKey } from '../../features/agents/utils';

export function AgentProfileCreatePage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const initialAgentKey = (searchParams.get('agentKey') as AgentKey | null) ?? 'executive';

  const [registry, setRegistry] = useState<AgentRegistryEntry[]>([]);
  const [agentKey, setAgentKey] = useState<AgentKey>(initialAgentKey);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<AgentProfileStatus>('draft');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageAgents(user.permissions) : false;
  const selectedEntry = useMemo(
    () => registry.find((entry) => entry.agentKey === agentKey),
    [agentKey, registry],
  );

  useEffect(() => {
    if (user && !canWrite) navigate('/aura/agents');
  }, [canWrite, navigate, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadRegistry() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchAgentRegistry(accessToken);
        if (!cancelled) {
          setRegistry(data);
          const entry = data.find((item) => item.agentKey === initialAgentKey) ?? data[0];
          if (entry) {
            setAgentKey(entry.agentKey);
            setName(entry.name);
            setDescription(entry.description);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load agent registry');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadRegistry();
    return () => {
      cancelled = true;
    };
  }, [accessToken, initialAgentKey]);

  useEffect(() => {
    if (selectedEntry && !name) {
      setName(selectedEntry.name);
      setDescription(selectedEntry.description);
    }
  }, [name, selectedEntry]);

  function handleAgentKeyChange(nextAgentKey: AgentKey) {
    setAgentKey(nextAgentKey);
    const entry = registry.find((item) => item.agentKey === nextAgentKey);
    if (entry) {
      setName(entry.name);
      setDescription(entry.description);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !name.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      const profile = await createAgentProfile(accessToken, {
        agentKey,
        name,
        description: description.trim() || null,
        status,
      });
      navigate(`/aura/agents/${profile.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create agent profile');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading agent registry…</p>;

  return (
    <div className="agents-page">
      <PageHeader
        title="Configure agent profile"
        description="Create a tenant-scoped profile with suggested permissions and tool grants."
      />
      <AgentsNav />
      {error ? <p className="form-error">{error}</p> : null}

      {selectedEntry?.foundationOnly ? (
        <p className="agents-notice">
          {formatAgentKey(selectedEntry.agentKey)} is foundation-only. Hiring automation and
          autonomous execution are not connected in this milestone.
        </p>
      ) : null}

      <form className="agents-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="titan-input-group">
          <span className="titan-input-label">Agent type</span>
          <select
            className="titan-input"
            value={agentKey}
            onChange={(e) => handleAgentKeyChange(e.target.value as AgentKey)}
          >
            {registry.map((entry) => (
              <option key={entry.agentKey} value={entry.agentKey}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
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
        {selectedEntry ? (
          <div className="agents-suggestions">
            <p className="agents-suggestions__title">Suggested permissions</p>
            <p className="page-muted">{selectedEntry.suggestedPermissions.join(', ') || 'None'}</p>
            <p className="agents-suggestions__title">Suggested tools</p>
            <p className="page-muted">{selectedEntry.suggestedToolKeys.join(', ') || 'None'}</p>
          </div>
        ) : null}
        <Button type="submit" disabled={isSaving || !name.trim()}>
          {isSaving ? 'Saving…' : 'Create profile'}
        </Button>
      </form>
    </div>
  );
}
