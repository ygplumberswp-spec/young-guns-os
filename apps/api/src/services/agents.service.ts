import { and, desc, eq, sql } from 'drizzle-orm';
import {
  AGENT_REGISTRY,
  AGENT_TOOL_REGISTRY,
  getAgentRegistryEntry,
  getAgentToolDefinition,
  type AgentExecutionSummary,
  type AgentProfileDetail,
  type AgentProfileSummary,
  type AgentProfileToolSummary,
  type AgentRegistryEntry,
  type AgentsStats,
  type AgentToolDefinition,
  type CreateAgentProfileRequest,
  type SetAgentProfilePermissionsRequest,
  type SetAgentProfileToolsRequest,
  type UpdateAgentProfileRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  agentExecutions,
  agentProfilePermissions,
  agentProfileTools,
  agentProfiles,
  users,
} from '@titan/db';

export class AgentsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AgentsError';
  }
}

export type AuraAgentsContext = {
  availableAgentCount: number;
  configuredProfileCount: number;
  activeProfileCount: number;
  executionCount: number;
  registry: Array<{
    agentKey: string;
    name: string;
    configured: boolean;
    foundationOnly: boolean;
  }>;
  profiles: Array<{
    name: string;
    agentKey: string;
    status: string;
    permissionCount: number;
    enabledToolCount: number;
  }>;
  recentExecutions: Array<{
    agentProfileName: string | null;
    agentKey: string | null;
    status: string;
    executionMode: string;
    startedAt: string;
    errorMessage: string | null;
  }>;
  focusedProfile: {
    name: string;
    agentKey: string;
    status: string;
    description: string | null;
    permissions: string[];
    enabledTools: string[];
    foundationOnly: boolean;
  } | null;
  minimalOverview?: boolean;
};

type TenantScope = {
  companyId: string;
  userId: string;
};

export class AgentsService {
  constructor(private readonly db: DatabaseClient) {}

  getRegistry(): AgentRegistryEntry[] {
    return AGENT_REGISTRY;
  }

  getToolCatalog(): AgentToolDefinition[] {
    return AGENT_TOOL_REGISTRY;
  }

  async listProfiles(companyId: string): Promise<AgentProfileSummary[]> {
    const rows = await this.db.query.agentProfiles.findMany({
      where: eq(agentProfiles.companyId, companyId),
      with: { createdBy: true },
      orderBy: [desc(agentProfiles.updatedAt)],
    });

    const [permissionCounts, toolCounts, executionCounts] = await Promise.all([
      this.getProfileChildCounts(companyId, 'permissions'),
      this.getProfileEnabledToolCounts(companyId),
      this.getProfileChildCounts(companyId, 'executions'),
    ]);

    return rows.map((row) => toProfileSummary(row, permissionCounts, toolCounts, executionCounts));
  }

  async getProfile(companyId: string, profileId: string): Promise<AgentProfileDetail | null> {
    const row = await this.db.query.agentProfiles.findFirst({
      where: and(eq(agentProfiles.id, profileId), eq(agentProfiles.companyId, companyId)),
      with: {
        createdBy: true,
        permissions: true,
        tools: true,
      },
    });

    if (!row) {
      return null;
    }

    const registry = getAgentRegistryEntry(row.agentKey);

    if (!registry) {
      return null;
    }

    const [permissionCounts, toolCounts, executionCounts] = await Promise.all([
      this.getProfileChildCounts(companyId, 'permissions'),
      this.getProfileEnabledToolCounts(companyId),
      this.getProfileChildCounts(companyId, 'executions'),
    ]);

    return {
      ...toProfileSummary(row, permissionCounts, toolCounts, executionCounts),
      config: row.config ?? {},
      permissions: row.permissions.map((item) => item.permission),
      tools: buildProfileTools(row.tools, registry),
      registry,
    };
  }

  async createProfile(
    scope: TenantScope,
    input: CreateAgentProfileRequest,
  ): Promise<AgentProfileDetail> {
    const registry = getAgentRegistryEntry(input.agentKey);

    if (!registry) {
      throw new AgentsError('INVALID_AGENT_KEY', 'Unknown agent type');
    }

    const name = input.name.trim();

    if (!name) {
      throw new AgentsError('VALIDATION_ERROR', 'Profile name is required');
    }

    const existing = await this.db.query.agentProfiles.findFirst({
      where: and(
        eq(agentProfiles.companyId, scope.companyId),
        eq(agentProfiles.agentKey, input.agentKey),
      ),
    });

    if (existing) {
      throw new AgentsError(
        'PROFILE_ALREADY_EXISTS',
        'A profile already exists for this agent type',
      );
    }

    const [created] = await this.db
      .insert(agentProfiles)
      .values({
        companyId: scope.companyId,
        createdByUserId: scope.userId,
        agentKey: input.agentKey,
        name,
        description: normalizeOptionalText(input.description),
        status: input.status ?? 'draft',
        config: input.config ?? {},
      })
      .returning();

    if (!created) {
      throw new AgentsError('CREATE_FAILED', 'Unable to create agent profile');
    }

    const permissions = input.permissions ?? registry.suggestedPermissions;
    await this.replacePermissions(scope.companyId, created.id, permissions);

    const enabledToolKeys = new Set(input.enabledToolKeys ?? registry.suggestedToolKeys);
    await this.replaceTools(
      scope.companyId,
      created.id,
      AGENT_TOOL_REGISTRY.map((tool) => ({
        toolKey: tool.toolKey,
        enabled: enabledToolKeys.has(tool.toolKey),
        config: {},
      })),
    );

    const profile = await this.getProfile(scope.companyId, created.id);

    if (!profile) {
      throw new AgentsError('CREATE_FAILED', 'Unable to load agent profile');
    }

    return profile;
  }

  async updateProfile(
    companyId: string,
    profileId: string,
    input: UpdateAgentProfileRequest,
  ): Promise<AgentProfileDetail> {
    const existing = await this.db.query.agentProfiles.findFirst({
      where: and(eq(agentProfiles.id, profileId), eq(agentProfiles.companyId, companyId)),
    });

    if (!existing) {
      throw new AgentsError('PROFILE_NOT_FOUND', 'Agent profile not found');
    }

    const name = input.name?.trim();

    if (input.name !== undefined && !name) {
      throw new AgentsError('VALIDATION_ERROR', 'Profile name is required');
    }

    const [updated] = await this.db
      .update(agentProfiles)
      .set({
        name: name ?? existing.name,
        description:
          input.description !== undefined
            ? normalizeOptionalText(input.description)
            : existing.description,
        status: input.status ?? existing.status,
        config: input.config ?? existing.config,
        updatedAt: new Date(),
      })
      .where(and(eq(agentProfiles.id, profileId), eq(agentProfiles.companyId, companyId)))
      .returning();

    if (!updated) {
      throw new AgentsError('UPDATE_FAILED', 'Unable to update agent profile');
    }

    const profile = await this.getProfile(companyId, profileId);

    if (!profile) {
      throw new AgentsError('UPDATE_FAILED', 'Unable to load agent profile');
    }

    return profile;
  }

  async setProfilePermissions(
    companyId: string,
    profileId: string,
    input: SetAgentProfilePermissionsRequest,
  ): Promise<AgentProfileDetail> {
    await this.ensureProfileBelongsToCompany(companyId, profileId);
    await this.replacePermissions(companyId, profileId, input.permissions);

    const profile = await this.getProfile(companyId, profileId);

    if (!profile) {
      throw new AgentsError('UPDATE_FAILED', 'Unable to load agent profile');
    }

    return profile;
  }

  async setProfileTools(
    companyId: string,
    profileId: string,
    input: SetAgentProfileToolsRequest,
  ): Promise<AgentProfileDetail> {
    await this.ensureProfileBelongsToCompany(companyId, profileId);

    for (const tool of input.tools) {
      if (!getAgentToolDefinition(tool.toolKey)) {
        throw new AgentsError('INVALID_TOOL_KEY', `Unknown tool: ${tool.toolKey}`);
      }
    }

    await this.replaceTools(companyId, profileId, input.tools);

    const profile = await this.getProfile(companyId, profileId);

    if (!profile) {
      throw new AgentsError('UPDATE_FAILED', 'Unable to load agent profile');
    }

    return profile;
  }

  async listExecutions(companyId: string): Promise<AgentExecutionSummary[]> {
    const rows = await this.db.query.agentExecutions.findMany({
      where: eq(agentExecutions.companyId, companyId),
      with: { agentProfile: true },
      orderBy: [desc(agentExecutions.startedAt)],
    });

    return rows.map(toExecutionSummary);
  }

  async listProfileExecutions(
    companyId: string,
    profileId: string,
  ): Promise<AgentExecutionSummary[]> {
    await this.ensureProfileBelongsToCompany(companyId, profileId);

    const rows = await this.db.query.agentExecutions.findMany({
      where: and(
        eq(agentExecutions.companyId, companyId),
        eq(agentExecutions.agentProfileId, profileId),
      ),
      with: { agentProfile: true },
      orderBy: [desc(agentExecutions.startedAt)],
    });

    return rows.map(toExecutionSummary);
  }

  async getStats(companyId: string): Promise<AgentsStats> {
    const [profileCountRow, activeProfileCountRow, executionCountRow] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(agentProfiles)
        .where(eq(agentProfiles.companyId, companyId)),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(agentProfiles)
        .where(and(eq(agentProfiles.companyId, companyId), eq(agentProfiles.status, 'active'))),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(agentExecutions)
        .where(eq(agentExecutions.companyId, companyId)),
    ]);

    return {
      configuredProfileCount: profileCountRow[0]?.count ?? 0,
      activeProfileCount: activeProfileCountRow[0]?.count ?? 0,
      availableAgentCount: AGENT_REGISTRY.length,
      executionCount: executionCountRow[0]?.count ?? 0,
    };
  }

  async buildAuraContextSummary(companyId: string): Promise<AuraAgentsContext> {
    const stats = await this.getStats(companyId);

    return {
      availableAgentCount: stats.availableAgentCount,
      configuredProfileCount: stats.configuredProfileCount,
      activeProfileCount: stats.activeProfileCount,
      executionCount: stats.executionCount,
      registry: [],
      profiles: [],
      recentExecutions: [],
      focusedProfile: null,
      minimalOverview: true,
    };
  }

  async buildAuraContext(companyId: string, agentProfileId?: string): Promise<AuraAgentsContext> {
    const stats = await this.getStats(companyId);
    const profiles = await this.listProfiles(companyId);
    const configuredKeys = new Set(profiles.map((profile) => profile.agentKey));

    const executionRows = await this.db.query.agentExecutions.findMany({
      where: eq(agentExecutions.companyId, companyId),
      with: { agentProfile: true },
      orderBy: [desc(agentExecutions.startedAt)],
      limit: 10,
    });

    let focusedProfile: AuraAgentsContext['focusedProfile'] = null;

    if (agentProfileId) {
      const focused = await this.getProfile(companyId, agentProfileId);

      if (focused) {
        focusedProfile = {
          name: focused.name,
          agentKey: focused.agentKey,
          status: focused.status,
          description: focused.description,
          permissions: focused.permissions,
          enabledTools: focused.tools.filter((tool) => tool.enabled).map((tool) => tool.toolKey),
          foundationOnly: focused.foundationOnly,
        };
      }
    }

    return {
      availableAgentCount: stats.availableAgentCount,
      configuredProfileCount: stats.configuredProfileCount,
      activeProfileCount: stats.activeProfileCount,
      executionCount: stats.executionCount,
      registry: AGENT_REGISTRY.map((entry) => ({
        agentKey: entry.agentKey,
        name: entry.name,
        configured: configuredKeys.has(entry.agentKey),
        foundationOnly: Boolean(entry.foundationOnly),
      })),
      profiles: profiles.map((profile) => ({
        name: profile.name,
        agentKey: profile.agentKey,
        status: profile.status,
        permissionCount: profile.permissionCount,
        enabledToolCount: profile.enabledToolCount,
      })),
      recentExecutions: executionRows.map((row) => ({
        agentProfileName: row.agentProfile?.name ?? null,
        agentKey: row.agentProfile?.agentKey ?? null,
        status: row.status,
        executionMode: row.executionMode,
        startedAt: row.startedAt.toISOString(),
        errorMessage: row.errorMessage,
      })),
      focusedProfile,
    };
  }

  private async replacePermissions(companyId: string, profileId: string, permissions: string[]) {
    const uniquePermissions = [
      ...new Set(permissions.map((permission) => permission.trim()).filter(Boolean)),
    ];

    await this.db
      .delete(agentProfilePermissions)
      .where(
        and(
          eq(agentProfilePermissions.companyId, companyId),
          eq(agentProfilePermissions.agentProfileId, profileId),
        ),
      );

    if (uniquePermissions.length === 0) {
      return;
    }

    await this.db.insert(agentProfilePermissions).values(
      uniquePermissions.map((permission) => ({
        companyId,
        agentProfileId: profileId,
        permission,
      })),
    );

    await this.touchProfile(profileId);
  }

  private async replaceTools(
    companyId: string,
    profileId: string,
    tools: SetAgentProfileToolsRequest['tools'],
  ) {
    await this.db
      .delete(agentProfileTools)
      .where(
        and(
          eq(agentProfileTools.companyId, companyId),
          eq(agentProfileTools.agentProfileId, profileId),
        ),
      );

    if (tools.length === 0) {
      return;
    }

    await this.db.insert(agentProfileTools).values(
      tools.map((tool) => ({
        companyId,
        agentProfileId: profileId,
        toolKey: tool.toolKey,
        enabled: tool.enabled,
        config: tool.config ?? {},
      })),
    );

    await this.touchProfile(profileId);
  }

  private async touchProfile(profileId: string) {
    await this.db
      .update(agentProfiles)
      .set({ updatedAt: new Date() })
      .where(eq(agentProfiles.id, profileId));
  }

  private async ensureProfileBelongsToCompany(companyId: string, profileId: string) {
    const profile = await this.db.query.agentProfiles.findFirst({
      where: and(eq(agentProfiles.id, profileId), eq(agentProfiles.companyId, companyId)),
    });

    if (!profile) {
      throw new AgentsError('PROFILE_NOT_FOUND', 'Agent profile not found');
    }
  }

  private async getProfileChildCounts(
    companyId: string,
    kind: 'permissions' | 'executions',
  ): Promise<Map<string, number>> {
    const table = kind === 'permissions' ? agentProfilePermissions : agentExecutions;

    const rows = await this.db
      .select({
        agentProfileId: table.agentProfileId,
        count: sql<number>`count(*)::int`,
      })
      .from(table)
      .where(eq(table.companyId, companyId))
      .groupBy(table.agentProfileId);

    const counts = new Map<string, number>();

    for (const row of rows) {
      if (row.agentProfileId) {
        counts.set(row.agentProfileId, row.count);
      }
    }

    return counts;
  }

  private async getProfileEnabledToolCounts(companyId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        agentProfileId: agentProfileTools.agentProfileId,
        count: sql<number>`count(*)::int`,
      })
      .from(agentProfileTools)
      .where(and(eq(agentProfileTools.companyId, companyId), eq(agentProfileTools.enabled, true)))
      .groupBy(agentProfileTools.agentProfileId);

    const counts = new Map<string, number>();

    for (const row of rows) {
      counts.set(row.agentProfileId, row.count);
    }

    return counts;
  }
}

function toProfileSummary(
  row: typeof agentProfiles.$inferSelect & { createdBy: typeof users.$inferSelect | null },
  permissionCounts: Map<string, number>,
  toolCounts: Map<string, number>,
  executionCounts: Map<string, number>,
): AgentProfileSummary {
  const registry = getAgentRegistryEntry(row.agentKey);

  return {
    id: row.id,
    agentKey: row.agentKey,
    registryName: registry?.name ?? row.agentKey,
    name: row.name,
    description: row.description,
    status: row.status,
    permissionCount: permissionCounts.get(row.id) ?? 0,
    enabledToolCount: toolCounts.get(row.id) ?? 0,
    executionCount: executionCounts.get(row.id) ?? 0,
    foundationOnly: Boolean(registry?.foundationOnly),
    createdByUserId: row.createdByUserId,
    createdByName: formatUserName(row.createdBy),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildProfileTools(
  rows: Array<typeof agentProfileTools.$inferSelect>,
  registry: AgentRegistryEntry,
): AgentProfileToolSummary[] {
  const rowMap = new Map(rows.map((row) => [row.toolKey, row]));
  const relevantToolKeys = new Set([
    ...registry.suggestedToolKeys,
    ...rows.map((row) => row.toolKey),
  ]);

  return AGENT_TOOL_REGISTRY.filter((tool) => relevantToolKeys.has(tool.toolKey)).map((tool) => {
    const row = rowMap.get(tool.toolKey);

    return {
      toolKey: tool.toolKey,
      name: tool.name,
      description: tool.description,
      category: tool.category,
      enabled: row?.enabled ?? false,
      config: row?.config ?? {},
    };
  });
}

function toExecutionSummary(
  row: typeof agentExecutions.$inferSelect & {
    agentProfile: typeof agentProfiles.$inferSelect | null;
  },
): AgentExecutionSummary {
  return {
    id: row.id,
    agentProfileId: row.agentProfileId,
    agentProfileName: row.agentProfile?.name ?? null,
    agentKey: row.agentProfile?.agentKey ?? null,
    status: row.status,
    executionMode: row.executionMode,
    inputSummary: row.inputSummary,
    outputSummary: row.outputSummary,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function formatUserName(user: typeof users.$inferSelect | null | undefined): string {
  if (!user) {
    return 'Unknown';
  }

  return `${user.firstName} ${user.lastName}`.trim();
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
