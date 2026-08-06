import { PageHeader } from '../../components/ux';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, LoadingState, Panel } from '@titan/ui';
import type {
  AgentProfileSummary,
  AgentRegistryEntry,
  TenantCapabilitySummary,
} from '@titan/shared';
import { hasAgentManagePermission } from '@titan/auth/browser';
import { fetchAgentProfiles, fetchAgentRegistry, fetchAgentsStats } from '../../lib/agents-api';
import { fetchAiProviders } from '../../lib/ai-orchestration-api-client';
import { fetchTenantCapabilities } from '../../lib/tenant-capabilities-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { SimpleAdvancedToggle } from '../../components/SimpleAdvancedToggle';
import { AgentsNav } from '../../features/agents/AgentsNav';
import {
  CAPABILITY_GROUPS,
  formatCapabilityStatus,
  type CapabilityStatus,
} from '../../features/agents/capability-groups';
import {
  canAccessAgents,
  canManageAgents,
  formatAgentKey,
  formatAgentProfileStatus,
} from '../../features/agents/utils';

function resolveGroupStatus(
  groupAgentKeys: string[],
  configuredKeys: Set<string>,
  registry: AgentRegistryEntry[],
  aiConfigured: boolean,
): CapabilityStatus {
  const entries = registry.filter((entry) => groupAgentKeys.includes(entry.agentKey));
  if (entries.length === 0) {
    return 'unavailable';
  }

  const configuredCount = entries.filter((entry) => configuredKeys.has(entry.agentKey)).length;
  if (configuredCount === entries.length) {
    return 'active';
  }

  if (!aiConfigured) {
    return 'provider_required';
  }

  if (configuredCount > 0) {
    return 'active';
  }

  return 'needs_setup';
}

function CapabilityGroupCard({
  label,
  description,
  status,
  canManage,
  customCapabilities,
}: {
  label: string;
  description: string;
  status: CapabilityStatus;
  canManage: boolean;
  customCapabilities: TenantCapabilitySummary[];
}) {
  return (
    <article className="capability-group-card">
      <div className="capability-group-card__header">
        <h3>{label}</h3>
        <span className={`status-pill status-pill--${status}`}>
          {formatCapabilityStatus(status)}
        </span>
      </div>
      <p className="page-muted">{description}</p>
      {customCapabilities.length > 0 ? (
        <ul className="capability-group-card__custom">
          {customCapabilities.map((capability) => (
            <li key={capability.id}>
              <strong>{capability.name}</strong>
              <span className={`status-pill status-pill--${capability.status}`}>
                {capability.status.replace(/_/g, ' ')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {canManage ? (
        <div className="panel-actions">
          <Link href="/aura/capabilities/create">
            <Button size="sm" variant="secondary">
              Manage capability
            </Button>
          </Link>
        </div>
      ) : null}
    </article>
  );
}

export function AgentDashboardPage() {
  const { accessToken, user } = useAuth();
  const [viewMode, setViewMode] = useState<'simple' | 'advanced'>('simple');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const canView = useMemo(() => (user ? canAccessAgents(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageAgents(user.permissions) : false), [user]);
  const canAdvanced = useMemo(
    () => (user ? hasAgentManagePermission(user.permissions) : false),
    [user],
  );

  const { data: stats, isLoading: statsLoading } = useCachedQuery({
    queryKey: 'agents/stats',
    accessToken,
    enabled: canView,
    staleTimeMs: 60_000,
    fetcher: async () => fetchAgentsStats(accessToken!),
  });

  const { data: registry = [], isLoading: registryLoading } = useCachedQuery({
    queryKey: 'agents/registry',
    accessToken,
    enabled: canView,
    staleTimeMs: 120_000,
    fetcher: async () => fetchAgentRegistry(accessToken!),
  });

  const { data: profiles = [], isLoading: profilesLoading } = useCachedQuery({
    queryKey: 'agents/profiles',
    accessToken,
    enabled: canView,
    staleTimeMs: 60_000,
    fetcher: async () => fetchAgentProfiles(accessToken!),
  });

  const { data: aiProviders = [] } = useCachedQuery({
    queryKey: 'agents/ai-providers',
    accessToken,
    enabled: canView,
    staleTimeMs: 120_000,
    fetcher: async () => fetchAiProviders(accessToken!),
  });

  const { data: tenantCapabilities = [] } = useCachedQuery({
    queryKey: 'tenant-capabilities/list',
    accessToken,
    enabled: canView,
    staleTimeMs: 60_000,
    fetcher: async () => fetchTenantCapabilities(accessToken!),
  });

  const activeCustomCount = useMemo(
    () => tenantCapabilities.filter((capability) => capability.status === 'active').length,
    [tenantCapabilities],
  );

  const customByDepartment = useMemo(() => {
    const map = new Map<string, TenantCapabilitySummary[]>();
    for (const capability of tenantCapabilities) {
      if (capability.status === 'archived') continue;
      const list = map.get(capability.department) ?? [];
      list.push(capability);
      map.set(capability.department, list);
    }
    return map;
  }, [tenantCapabilities]);

  const configuredKeys = useMemo(
    () => new Set(profiles.map((profile) => profile.agentKey)),
    [profiles],
  );

  const aiConfigured = useMemo(
    () => aiProviders.some((provider) => provider.isConfigured && provider.credentialsConfigured),
    [aiProviders],
  );

  const isLoading = statsLoading || registryLoading || profilesLoading;

  if (!canView) {
    return (
      <div className="agents-page page-shell">
        <PageHeader
          title="AURA Capabilities"
          description="You do not have permission to view AURA capabilities."
        />
      </div>
    );
  }

  const activeGroups = CAPABILITY_GROUPS.filter(
    (group) =>
      resolveGroupStatus(group.agentKeys, configuredKeys, registry, aiConfigured) === 'active',
  ).length;
  const needsSetupGroups = CAPABILITY_GROUPS.filter(
    (group) =>
      resolveGroupStatus(group.agentKeys, configuredKeys, registry, aiConfigured) ===
        'needs_setup' ||
      resolveGroupStatus(group.agentKeys, configuredKeys, registry, aiConfigured) ===
        'provider_required',
  ).length;

  return (
    <div className="agents-page page-shell">
      <PageHeader
        title="AURA Capabilities"
        description="AURA coordinates specialist intelligence across your business."
        actions={
          <div className="page-header-actions">
            <SimpleAdvancedToggle
              mode={viewMode}
              onChange={setViewMode}
              canAccessAdvanced={canAdvanced}
            />
            {canManage ? (
              <Link href="/aura/capabilities/create">
                <Button size="sm">Create Capability</Button>
              </Link>
            ) : null}
            <Link href="/aura">
              <Button variant="secondary" size="sm">
                Open AURA Chat
              </Button>
            </Link>
          </div>
        }
      />
      <AgentsNav />

      {isLoading ? <LoadingState label="Loading AURA Capabilities…" /> : null}

      {stats ? (
        <section className="capability-summary">
          <div className="stat-grid">
            <Panel title="AURA Status">{aiConfigured ? 'Ready' : 'Provider required'}</Panel>
            <Panel title="AI Provider">{aiConfigured ? 'Configured' : 'Not configured'}</Panel>
            <Panel title="Active Capabilities">{activeGroups + activeCustomCount}</Panel>
            <Panel title="Needs Setup">{needsSetupGroups}</Panel>
            <Panel title="Approval Mode">Ask before external actions</Panel>
            <Panel title="Configured Profiles">{stats.configuredProfileCount}</Panel>
          </div>
        </section>
      ) : null}

      {!isLoading ? (
        <section className="capability-groups">
          <h2 className="integrations-section__title">Capability groups</h2>
          <div className="capability-groups-grid">
            {CAPABILITY_GROUPS.map((group) => (
              <CapabilityGroupCard
                key={group.id}
                label={group.label}
                description={group.description}
                status={resolveGroupStatus(group.agentKeys, configuredKeys, registry, aiConfigured)}
                canManage={canManage}
                customCapabilities={customByDepartment.get(group.id) ?? []}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!aiConfigured ? (
        <EmptyState
          title="AI Provider Not Configured"
          description="Configure an AI provider before AURA can coordinate specialist capabilities."
          action={
            <Link href="/integrations">
              <Button variant="secondary">Integration Settings</Button>
            </Link>
          }
        />
      ) : null}

      {viewMode === 'advanced' && canAdvanced ? (
        <section className="integrations-advanced">
          <button
            type="button"
            className="integrations-advanced__toggle"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
          >
            {advancedOpen ? 'Hide' : 'Show'} Advanced Administration
          </button>

          {advancedOpen ? (
            <div className="integrations-advanced__content">
              <Panel title="Agent Registry">
                <p className="page-muted">
                  Individual agent profiles, tool grants and execution rules. AURA maintains safe
                  defaults — adjust only when required.
                </p>
                <div className="panel-actions">
                  <Link href="/aura/agents/new">
                    <Button size="sm" variant="secondary">
                      Review and optimise agent configuration
                    </Button>
                  </Link>
                </div>
                <div className="agents-registry-grid agents-registry-grid--compact">
                  {registry.map((entry) => (
                    <article key={entry.agentKey} className="agents-registry-card">
                      <h3>{entry.name}</h3>
                      <p className="page-muted">{entry.description}</p>
                      <p className="page-muted">
                        {configuredKeys.has(entry.agentKey) ? 'Configured' : 'Not configured'}
                      </p>
                    </article>
                  ))}
                </div>
              </Panel>

              {profiles.length > 0 ? (
                <Panel title="Configured Profiles">
                  <div className="agents-table-wrap">
                    <table className="agents-table">
                      <thead>
                        <tr>
                          <th>Profile</th>
                          <th>Agent type</th>
                          <th>Status</th>
                          <th>Tools</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profiles.map((profile: AgentProfileSummary) => (
                          <tr key={profile.id}>
                            <td>
                              <Link href={`/aura/agents/${profile.id}`} className="agents-link">
                                {profile.name}
                              </Link>
                            </td>
                            <td>{formatAgentKey(profile.agentKey)}</td>
                            <td>{formatAgentProfileStatus(profile.status)}</td>
                            <td>{profile.enabledToolCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              ) : null}

              {tenantCapabilities.length > 0 ? (
                <Panel title="Tenant Capabilities">
                  <p className="page-muted">
                    Custom capabilities created for this business. Each entry is tenant-scoped with
                    version history and audit logging.
                  </p>
                  <div className="agents-table-wrap">
                    <table className="agents-table">
                      <thead>
                        <tr>
                          <th>Capability</th>
                          <th>Department</th>
                          <th>Status</th>
                          <th>Version</th>
                          <th>Risk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenantCapabilities.map((capability) => (
                          <tr key={capability.id}>
                            <td>{capability.name}</td>
                            <td>{capability.department}</td>
                            <td>{capability.status.replace(/_/g, ' ')}</td>
                            <td>v{capability.version}</td>
                            <td>{capability.riskLevel}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
