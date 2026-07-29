import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel } from '@titan/ui';
import type { AgentProfileSummary, AgentRegistryEntry, AgentsStats } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchAgentProfiles,
  fetchAgentRegistry,
  fetchAgentsStats,
} from '../../lib/agents-api';
import { useAuth } from '../../lib/auth-context';
import { AgentsNav } from '../../features/agents/AgentsNav';
import {
  canAccessAgents,
  canManageAgents,
  formatAgentKey,
  formatAgentProfileStatus,
} from '../../features/agents/utils';

function RegistryCard({
  entry,
  configured,
  canWrite,
}: {
  entry: AgentRegistryEntry;
  configured: boolean;
  canWrite: boolean;
}) {
  return (
    <article className="agents-registry-card">
      <div className="agents-registry-card__header">
        <h3>{entry.name}</h3>
        {entry.foundationOnly ? <span className="agents-badge">Foundation only</span> : null}
      </div>
      <p className="agents-registry-card__description">{entry.description}</p>
      <p className="agents-registry-card__meta">
        Focus: {entry.focusAreas.join(' · ')}
      </p>
      <div className="agents-registry-card__actions">
        {configured ? (
          <span className="page-muted">Configured</span>
        ) : canWrite ? (
          <Link href={`/aura/agents/new?agentKey=${entry.agentKey}`}>
            <Button size="sm">Configure profile</Button>
          </Link>
        ) : (
          <span className="page-muted">Not configured</span>
        )}
      </div>
    </article>
  );
}

export function AgentDashboardPage() {
  const { accessToken, user } = useAuth();
  const [stats, setStats] = useState<AgentsStats | null>(null);
  const [registry, setRegistry] = useState<AgentRegistryEntry[]>([]);
  const [profiles, setProfiles] = useState<AgentProfileSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessAgents(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageAgents(user.permissions) : false), [user]);

  const configuredKeys = useMemo(
    () => new Set(profiles.map((profile) => profile.agentKey)),
    [profiles],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const [statsData, registryData, profilesData] = await Promise.all([
          fetchAgentsStats(accessToken),
          fetchAgentRegistry(accessToken),
          fetchAgentProfiles(accessToken),
        ]);

        if (!cancelled) {
          setStats(statsData);
          setRegistry(registryData);
          setProfiles(profilesData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load agent dashboard');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadDashboard();
    return () => { cancelled = true; };
  }, [accessToken, canView]);

  if (!canView) {
    return (
      <div className="agents-page">
        <PageHeader title="AURA Agents" description="You do not have permission to view agents." />
      </div>
    );
  }

  return (
    <div className="agents-page">
      <PageHeader
        title="AURA Agents"
        description="Configure specialist agent profiles, permissions, and tool grants for your tenant."
      />
      <AgentsNav />

      {isLoading ? <p className="page-muted">Loading agent dashboard…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error && stats ? (
        <>
          <div className="agents-stats-grid">
            <Panel title="Available agents">{stats.availableAgentCount}</Panel>
            <Panel title="Configured profiles">{stats.configuredProfileCount}</Panel>
            <Panel title="Active profiles">{stats.activeProfileCount}</Panel>
            <Panel title="Execution records">{stats.executionCount}</Panel>
          </div>

          <Panel title="Agent registry">
            <div className="agents-registry-grid">
              {registry.map((entry) => (
                <RegistryCard
                  key={entry.agentKey}
                  entry={entry}
                  configured={configuredKeys.has(entry.agentKey)}
                  canWrite={canWrite}
                />
              ))}
            </div>
          </Panel>

          {profiles.length === 0 ? (
            <EmptyState
              title="No agent profiles configured"
              description="Choose an agent type from the registry and create a profile with permissions and tools."
            />
          ) : (
            <Panel title="Configured profiles">
              <div className="agents-table-wrap">
                <table className="agents-table">
                  <thead>
                    <tr>
                      <th>Profile</th>
                      <th>Agent type</th>
                      <th>Status</th>
                      <th>Permissions</th>
                      <th>Tools</th>
                      <th>Executions</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((profile) => (
                      <tr key={profile.id}>
                        <td>
                          <Link href={`/aura/agents/${profile.id}`} className="agents-link">
                            {profile.name}
                          </Link>
                        </td>
                        <td>{formatAgentKey(profile.agentKey)}</td>
                        <td>{formatAgentProfileStatus(profile.status)}</td>
                        <td>{profile.permissionCount}</td>
                        <td>{profile.enabledToolCount}</td>
                        <td>{profile.executionCount}</td>
                        <td>{new Date(profile.updatedAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      ) : null}
    </div>
  );
}
