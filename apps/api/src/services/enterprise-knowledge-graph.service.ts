import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { hasAnyPermission } from '@titan/auth';
import type {
  CreateKnowledgeGraphActionRequest,
  CreateKnowledgeSavedSearchRequest,
  CreateOrganizationalMemoryRequest,
  EnterpriseKnowledgeGraphAuraContext,
  EnterpriseKnowledgeGraphDashboard,
  KnowledgeGovernanceSummary,
  KnowledgeGraphCoverage,
  KnowledgeGraphEntitySummary,
  KnowledgeGraphPlatformActionSummary,
  KnowledgeGraphRecommendationSummary,
  KnowledgeGraphRelationshipSummary,
  KnowledgeGraphTraversalResult,
  KnowledgeSavedSearchSummary,
  KnowledgeSearchActivitySummary,
  KnowledgeSemanticSearchResult,
  OrganizationalMemorySummary,
  SemanticSearchRequest,
  TraverseKnowledgeGraphRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  communications,
  customers,
  digitalTwinStateSnapshots,
  documents,
  integrationConnections,
  inventoryItems,
  invoices,
  jobs,
  knowledgeArticles,
  knowledgeGraphAccessAudit,
  knowledgeGraphEntities,
  knowledgeGraphPlatformActions,
  knowledgeGraphRecommendations,
  knowledgeGraphRelationshipHistory,
  knowledgeGraphRelationships,
  knowledgeGovernancePolicies,
  knowledgeSavedSearches,
  knowledgeSearchAudit,
  knowledgeSemanticIndex,
  organizationalMemoryEntries,
  users,
  vehicles,
  workflows,
} from '@titan/db';
import type { KnowledgeService } from './knowledge.service.js';

export class EnterpriseKnowledgeGraphError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseKnowledgeGraphError';
  }
}

type StaffScope = { companyId: string; userId: string };

type EnterpriseKnowledgeGraphDeps = {
  db: DatabaseClient;
  knowledgeService: KnowledgeService;
};

export class EnterpriseKnowledgeGraphService {
  constructor(private readonly deps: EnterpriseKnowledgeGraphDeps) {}

  async getExecutiveDashboard(companyId: string): Promise<EnterpriseKnowledgeGraphDashboard> {
    const [
      knowledgeStats,
      entities,
      relationships,
      memoryEntries,
      indexRows,
      searchActivity,
      recommendations,
      pendingActions,
      coverage,
    ] = await Promise.all([
      this.deps.knowledgeService.getStats(companyId),
      this.listEntities(companyId),
      this.listRelationships(companyId),
      this.listOrganizationalMemory(companyId),
      this.deps.db.query.knowledgeSemanticIndex.findMany({
        where: eq(knowledgeSemanticIndex.companyId, companyId),
        limit: 5000,
      }),
      this.listSearchActivity(companyId),
      this.listRecommendations(companyId),
      this.listActions(companyId, 'pending_approval'),
      this.computeCoverage(companyId),
    ]);

    return {
      summary: `${entities.length} graph entit${entities.length === 1 ? 'y' : 'ies'}, ${relationships.length} relationship(s), ${memoryEntries.length} memory entr${memoryEntries.length === 1 ? 'y' : 'ies'}, ${indexRows.length} indexed record(s).`,
      knowledgeStats,
      entityCount: entities.length,
      relationshipCount: relationships.length,
      memoryEntryCount: memoryEntries.length,
      indexedCount: indexRows.length,
      searchActivityCount: searchActivity.length,
      coverage,
      recentEntities: entities.slice(0, 15),
      recentRelationships: relationships.slice(0, 15),
      recentMemory: memoryEntries.slice(0, 10),
      recommendations: recommendations.slice(0, 15),
      pendingActionCount: pendingActions.length,
    };
  }

  async buildKnowledgeGraphAuraContext(companyId: string): Promise<EnterpriseKnowledgeGraphAuraContext> {
    const dashboard = await this.getExecutiveDashboard(companyId);
    return {
      summary: dashboard.summary,
      entityCount: dashboard.entityCount,
      relationshipCount: dashboard.relationshipCount,
      memoryEntryCount: dashboard.memoryEntryCount,
      indexedCount: dashboard.indexedCount,
      pendingRecommendationCount: dashboard.recommendations.filter((r) => r.status === 'pending').length,
      pendingActionCount: dashboard.pendingActionCount,
    };
  }

  async syncGraphFromModules(companyId: string): Promise<{ entityCount: number; relationshipCount: number }> {
    const entityIdByKey = new Map<string, string>();
    const db = this.deps.db;
    let relationshipCount = 0;

    const upsertEntity = async (
      entityType: KnowledgeGraphEntitySummary['entityType'],
      sourceEntityId: string,
      label: string,
      summary: string | null,
      metadata: Record<string, unknown>,
      requiredPermissions: string[] = [],
    ) => {
      const existing = await db.query.knowledgeGraphEntities.findFirst({
        where: and(
          eq(knowledgeGraphEntities.companyId, companyId),
          eq(knowledgeGraphEntities.entityType, entityType),
          eq(knowledgeGraphEntities.sourceEntityId, sourceEntityId),
        ),
      });

      const values = {
        companyId,
        entityType,
        sourceEntityId,
        label,
        summary,
        metadata,
        requiredPermissions,
        indexedAt: new Date(),
        updatedAt: new Date(),
      };

      let graphEntityId: string;
      if (existing) {
        const [updated] = await db
          .update(knowledgeGraphEntities)
          .set(values)
          .where(eq(knowledgeGraphEntities.id, existing.id))
          .returning();
        graphEntityId = updated!.id;
      } else {
        const [created] = await db.insert(knowledgeGraphEntities).values(values).returning();
        graphEntityId = created!.id;
      }

      entityIdByKey.set(`${entityType}:${sourceEntityId}`, graphEntityId);

      await db.delete(knowledgeSemanticIndex).where(
        and(
          eq(knowledgeSemanticIndex.companyId, companyId),
          eq(knowledgeSemanticIndex.entityType, entityType),
          eq(knowledgeSemanticIndex.sourceEntityId, sourceEntityId),
        ),
      );

      await db.insert(knowledgeSemanticIndex).values({
        companyId,
        entityType,
        sourceEntityId,
        graphEntityId,
        title: label,
        searchableText: [label, summary ?? '', JSON.stringify(metadata)].join(' ').slice(0, 10000),
        keywords: [],
        requiredPermissions,
      });

      return graphEntityId;
    };

    const [
      customerRows,
      jobRows,
      vehicleRows,
      inventoryRows,
      invoiceRows,
      documentRows,
      workflowRows,
      userRows,
      integrationRows,
      snapshotRows,
      communicationRows,
      articleRows,
    ] = await Promise.all([
      this.deps.db.query.customers.findMany({ where: eq(customers.companyId, companyId), limit: 200 }),
      this.deps.db.query.jobs.findMany({ where: eq(jobs.companyId, companyId), limit: 200 }),
      this.deps.db.query.vehicles.findMany({ where: eq(vehicles.companyId, companyId), limit: 200 }),
      this.deps.db.query.inventoryItems.findMany({ where: eq(inventoryItems.companyId, companyId), limit: 200 }),
      this.deps.db.query.invoices.findMany({ where: eq(invoices.companyId, companyId), limit: 200 }),
      this.deps.db.query.documents.findMany({ where: eq(documents.companyId, companyId), limit: 200 }),
      this.deps.db.query.workflows.findMany({ where: eq(workflows.companyId, companyId), limit: 100 }),
      this.deps.db.query.users.findMany({ where: eq(users.companyId, companyId), limit: 100 }),
      this.deps.db.query.integrationConnections.findMany({ where: eq(integrationConnections.companyId, companyId), limit: 50 }),
      this.deps.db.query.digitalTwinStateSnapshots.findMany({
        where: eq(digitalTwinStateSnapshots.companyId, companyId),
        limit: 50,
      }),
      this.deps.db.query.communications.findMany({ where: eq(communications.companyId, companyId), limit: 100 }),
      this.deps.db.query.knowledgeArticles.findMany({
        where: and(eq(knowledgeArticles.companyId, companyId), eq(knowledgeArticles.status, 'published')),
        limit: 100,
      }),
    ]);

    for (const row of customerRows) {
      await upsertEntity('customer', row.id, row.name, row.notes, { status: row.status }, ['customers:read']);
    }

    for (const row of userRows) {
      await upsertEntity(
        'technician',
        row.id,
        `${row.firstName} ${row.lastName}`,
        row.email,
        { role: 'technician' },
        ['team:read'],
      );
    }

    for (const row of jobRows) {
      await upsertEntity('job', row.id, row.title, row.description, { status: row.status }, ['jobs:read']);
      if (row.customerId) {
        const customerGraphId = entityIdByKey.get(`customer:${row.customerId}`);
        const jobGraphId = entityIdByKey.get(`job:${row.id}`);
        if (customerGraphId && jobGraphId) {
          relationshipCount += await this.upsertRelationship(
            companyId,
            jobGraphId,
            customerGraphId,
            'belongs_to',
            'Job customer',
          );
        }
      }
      if (row.assignedUserId) {
        const techGraphId = entityIdByKey.get(`technician:${row.assignedUserId}`);
        const jobGraphId = entityIdByKey.get(`job:${row.id}`);
        if (techGraphId && jobGraphId) {
          relationshipCount += await this.upsertRelationship(
            companyId,
            jobGraphId,
            techGraphId,
            'assigned_to',
            'Assigned technician',
          );
        }
      }
    }

    for (const row of vehicleRows) {
      await upsertEntity('vehicle', row.id, row.name, row.licensePlate, { status: row.status }, ['fleet:read']);
    }

    for (const row of inventoryRows) {
      await upsertEntity('inventory', row.id, row.name, row.sku, { unit: row.unit }, ['inventory:read']);
    }

    for (const row of invoiceRows) {
      await upsertEntity('invoice', row.id, row.title, row.notes, { status: row.status, invoiceNumber: row.invoiceNumber }, ['finance:read']);
      if (row.customerId) {
        const customerGraphId = entityIdByKey.get(`customer:${row.customerId}`);
        const invoiceGraphId = entityIdByKey.get(`invoice:${row.id}`);
        if (customerGraphId && invoiceGraphId) {
          relationshipCount += await this.upsertRelationship(
            companyId,
            invoiceGraphId,
            customerGraphId,
            'belongs_to',
            'Invoice customer',
          );
        }
      }
    }

    for (const row of documentRows) {
      await upsertEntity('document', row.id, row.title, row.description, {}, ['documents:read']);
    }

    for (const row of workflowRows) {
      await upsertEntity('workflow', row.id, row.name, row.description, { status: row.status }, ['automation:read']);
    }

    for (const row of integrationRows) {
      await upsertEntity(
        'integration',
        row.id,
        row.provider,
        row.status,
        { provider: row.provider },
        ['integrations:read'],
      );
    }

    for (const row of snapshotRows) {
      await upsertEntity(
        'digital_twin_snapshot',
        row.id,
        row.label ?? 'Digital twin snapshot',
        row.summary,
        {},
        ['executive:read'],
      );
    }

    for (const row of communicationRows) {
      await upsertEntity(
        'communication',
        row.id,
        row.subject ?? 'Communication',
        row.body?.slice(0, 200) ?? null,
        { channel: row.channel },
        ['communications:read'],
      );
    }

    for (const row of articleRows) {
      await upsertEntity(
        'organizational_memory',
        row.id,
        row.title,
        row.summary,
        { articleType: row.articleType },
        row.requiredPermissions,
      );
    }

    return { entityCount: entityIdByKey.size, relationshipCount };
  }

  async semanticSearch(
    scope: StaffScope,
    input: SemanticSearchRequest,
    userPermissions: string[],
  ): Promise<KnowledgeSemanticSearchResult[]> {
    const query = input.query.trim().toLowerCase();
    if (!query) return [];

    const limit = Math.min(input.limit ?? 20, 50);
    const mode = input.mode ?? 'hybrid';
    const results: KnowledgeSemanticSearchResult[] = [];

    if (mode === 'keyword' || mode === 'hybrid') {
      const knowledgeResults = await this.deps.knowledgeService.searchKnowledge(
        scope.companyId,
        { query: input.query, limit },
        userPermissions,
      );
      for (const row of knowledgeResults) {
        const mappedType: KnowledgeSemanticSearchResult['resultType'] =
          row.resultType === 'article' || row.resultType === 'training'
            ? 'knowledge_article'
            : row.resultType === 'sop' || row.resultType === 'policy' || row.resultType === 'document'
              ? row.resultType
              : 'graph_entity';
        results.push({
          resultType: mappedType,
          id: row.id,
          title: row.title,
          summary: row.summary,
          entityType: row.resultType,
          relevanceScore: row.relevanceScore,
          searchMode: 'keyword',
        });
      }
    }

    if (mode === 'semantic' || mode === 'hybrid') {
      const indexRows = await this.deps.db.query.knowledgeSemanticIndex.findMany({
        where: eq(knowledgeSemanticIndex.companyId, scope.companyId),
        limit: 500,
      });

      for (const row of indexRows) {
        if (input.entityTypes && !input.entityTypes.includes(row.entityType)) continue;
        if (!this.canAccess(row.requiredPermissions, userPermissions)) continue;
        const score = scoreHybridMatch(query, row.title, row.searchableText, row.keywords);
        if (score > 0) {
          results.push({
            resultType: 'graph_entity',
            id: row.sourceEntityId,
            title: row.title,
            summary: row.searchableText.slice(0, 200),
            entityType: row.entityType,
            relevanceScore: score,
            searchMode: mode === 'hybrid' ? 'hybrid' : 'semantic',
          });
        }
      }

      const memoryRows = await this.deps.db.query.organizationalMemoryEntries.findMany({
        where: eq(organizationalMemoryEntries.companyId, scope.companyId),
        limit: 200,
      });

      for (const row of memoryRows) {
        if (!this.canAccess(row.requiredPermissions, userPermissions)) continue;
        const score = scoreHybridMatch(query, row.title, row.content, []);
        if (score > 0) {
          results.push({
            resultType: 'organizational_memory',
            id: row.id,
            title: row.title,
            summary: row.summary,
            entityType: row.memoryType,
            relevanceScore: score,
            searchMode: mode === 'hybrid' ? 'hybrid' : 'semantic',
          });
        }
      }
    }

    const merged = dedupeResults(results).sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, limit);

    await this.deps.db.insert(knowledgeSearchAudit).values({
      companyId: scope.companyId,
      userId: scope.userId,
      query: input.query,
      resultCount: merged.length,
      searchMode: mode,
    });

    return merged;
  }

  async traverseGraph(
    companyId: string,
    input: TraverseKnowledgeGraphRequest,
  ): Promise<KnowledgeGraphTraversalResult> {
    const root = await this.deps.db.query.knowledgeGraphEntities.findFirst({
      where: and(eq(knowledgeGraphEntities.companyId, companyId), eq(knowledgeGraphEntities.id, input.entityId)),
    });

    if (!root) {
      throw new EnterpriseKnowledgeGraphError('NOT_FOUND', 'Graph entity not found');
    }

    const depth = Math.min(input.depth ?? 1, 3);
    const relationships = await this.deps.db.query.knowledgeGraphRelationships.findMany({
      where: and(
        eq(knowledgeGraphRelationships.companyId, companyId),
        or(
          eq(knowledgeGraphRelationships.sourceEntityId, root.id),
          eq(knowledgeGraphRelationships.targetEntityId, root.id),
        ),
      ),
      limit: 100,
    });

    const connectedIds = new Set<string>();
    for (const rel of relationships) {
      connectedIds.add(rel.sourceEntityId);
      connectedIds.add(rel.targetEntityId);
    }
    connectedIds.delete(root.id);

    const connectedRows =
      connectedIds.size > 0
        ? await this.deps.db.query.knowledgeGraphEntities.findMany({
            where: inArray(knowledgeGraphEntities.id, [...connectedIds]),
          })
        : [];

    const labelById = new Map(connectedRows.map((row) => [row.id, row.label]));
    labelById.set(root.id, root.label);

    return {
      rootEntity: toEntitySummary(root),
      relationships: relationships.slice(0, depth * 20).map((row) => ({
        id: row.id,
        sourceEntityId: row.sourceEntityId,
        targetEntityId: row.targetEntityId,
        relationshipType: row.relationshipType,
        label: row.label,
        sourceLabel: labelById.get(row.sourceEntityId) ?? null,
        targetLabel: labelById.get(row.targetEntityId) ?? null,
      })),
      connectedEntities: connectedRows.map(toEntitySummary),
    };
  }

  async listEntities(companyId: string): Promise<KnowledgeGraphEntitySummary[]> {
    const rows = await this.deps.db.query.knowledgeGraphEntities.findMany({
      where: eq(knowledgeGraphEntities.companyId, companyId),
      orderBy: [desc(knowledgeGraphEntities.indexedAt)],
      limit: 100,
    });
    return rows.map(toEntitySummary);
  }

  async listRelationships(companyId: string): Promise<KnowledgeGraphRelationshipSummary[]> {
    const rows = await this.deps.db.query.knowledgeGraphRelationships.findMany({
      where: eq(knowledgeGraphRelationships.companyId, companyId),
      orderBy: [desc(knowledgeGraphRelationships.updatedAt)],
      limit: 100,
    });

    const entityIds = [...new Set(rows.flatMap((row) => [row.sourceEntityId, row.targetEntityId]))];
    const entities =
      entityIds.length > 0
        ? await this.deps.db.query.knowledgeGraphEntities.findMany({
            where: inArray(knowledgeGraphEntities.id, entityIds),
          })
        : [];
    const labelById = new Map(entities.map((row) => [row.id, row.label]));

    return rows.map((row) => ({
      id: row.id,
      sourceEntityId: row.sourceEntityId,
      targetEntityId: row.targetEntityId,
      relationshipType: row.relationshipType,
      label: row.label,
      sourceLabel: labelById.get(row.sourceEntityId) ?? null,
      targetLabel: labelById.get(row.targetEntityId) ?? null,
    }));
  }

  async listOrganizationalMemory(companyId: string): Promise<OrganizationalMemorySummary[]> {
    const rows = await this.deps.db.query.organizationalMemoryEntries.findMany({
      where: eq(organizationalMemoryEntries.companyId, companyId),
      orderBy: [desc(organizationalMemoryEntries.updatedAt)],
      limit: 50,
    });
    return rows.map(toMemorySummary);
  }

  async createOrganizationalMemory(
    scope: StaffScope,
    input: CreateOrganizationalMemoryRequest,
  ): Promise<OrganizationalMemorySummary> {
    const [row] = await this.deps.db
      .insert(organizationalMemoryEntries)
      .values({
        companyId: scope.companyId,
        memoryType: input.memoryType,
        title: input.title,
        content: input.content,
        summary: input.summary ?? null,
        classification: input.classification ?? 'internal',
        requiredPermissions: input.requiredPermissions ?? [],
        relatedEntityIds: input.relatedEntityIds ?? [],
        createdByUserId: scope.userId,
      })
      .returning();

    await this.deps.db.insert(knowledgeSemanticIndex).values({
      companyId: scope.companyId,
      entityType: 'organizational_memory',
      sourceEntityId: row!.id,
      title: row!.title,
      searchableText: [row!.title, row!.content, row!.summary ?? ''].join(' ').slice(0, 10000),
      keywords: [],
      requiredPermissions: row!.requiredPermissions,
    });

    return toMemorySummary(row!);
  }

  async listSavedSearches(companyId: string): Promise<KnowledgeSavedSearchSummary[]> {
    const rows = await this.deps.db.query.knowledgeSavedSearches.findMany({
      where: eq(knowledgeSavedSearches.companyId, companyId),
      orderBy: [desc(knowledgeSavedSearches.updatedAt)],
      limit: 30,
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      query: row.query,
      filters: row.filters,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createSavedSearch(
    scope: StaffScope,
    input: CreateKnowledgeSavedSearchRequest,
  ): Promise<KnowledgeSavedSearchSummary> {
    const [row] = await this.deps.db
      .insert(knowledgeSavedSearches)
      .values({
        companyId: scope.companyId,
        name: input.name,
        query: input.query,
        filters: input.filters ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    return {
      id: row!.id,
      name: row!.name,
      query: row!.query,
      filters: row!.filters,
      createdAt: row!.createdAt.toISOString(),
    };
  }

  async listSearchActivity(companyId: string): Promise<KnowledgeSearchActivitySummary[]> {
    const rows = await this.deps.db.query.knowledgeSearchAudit.findMany({
      where: eq(knowledgeSearchAudit.companyId, companyId),
      orderBy: [desc(knowledgeSearchAudit.searchedAt)],
      limit: 30,
    });
    return rows.map((row) => ({
      id: row.id,
      query: row.query,
      resultCount: row.resultCount,
      searchMode: row.searchMode,
      searchedAt: row.searchedAt.toISOString(),
    }));
  }

  async getGovernanceSummary(companyId: string): Promise<KnowledgeGovernanceSummary> {
    const [policies, auditCount, classifiedCount] = await Promise.all([
      this.deps.db.query.knowledgeGovernancePolicies.findMany({
        where: eq(knowledgeGovernancePolicies.companyId, companyId),
      }),
      this.deps.db
        .select({ count: sql<number>`count(*)::int` })
        .from(knowledgeGraphAccessAudit)
        .where(eq(knowledgeGraphAccessAudit.companyId, companyId)),
      this.deps.db.query.knowledgeGraphEntities.findMany({
        where: and(
          eq(knowledgeGraphEntities.companyId, companyId),
          inArray(knowledgeGraphEntities.classification, ['confidential', 'restricted']),
        ),
        limit: 500,
      }),
    ]);

    return {
      policies: policies.map((row) => ({
        id: row.id,
        name: row.name,
        classification: row.classification,
        retentionDays: row.retentionDays,
        enabled: row.enabled,
      })),
      auditEntryCount: auditCount[0]?.count ?? 0,
      classifiedEntityCount: classifiedCount.length,
    };
  }

  async generateRecommendations(companyId: string): Promise<KnowledgeGraphRecommendationSummary[]> {
    const [stats, entities, relationships, memoryEntries] = await Promise.all([
      this.deps.knowledgeService.getStats(companyId),
      this.listEntities(companyId),
      this.listRelationships(companyId),
      this.listOrganizationalMemory(companyId),
    ]);

    const signals: Array<{ title: string; recommendation: string; priority: string }> = [];

    if (entities.length === 0) {
      signals.push({
        title: 'Knowledge graph not indexed',
        recommendation: 'Run graph sync to index customers, jobs, fleet, inventory, and documents from existing modules.',
        priority: 'high',
      });
    }

    if (stats.publishedArticleCount === 0 && stats.publishedSopCount === 0) {
      signals.push({
        title: 'Missing published documentation',
        recommendation: 'No published articles or SOPs found — create and publish knowledge content for technician and operational reference.',
        priority: 'high',
      });
    }

    if (relationships.length < Math.max(1, Math.floor(entities.length / 4))) {
      signals.push({
        title: 'Sparse relationship coverage',
        recommendation: 'Graph relationships are sparse — sync graph data and link jobs, customers, and technicians for better relationship intelligence.',
        priority: 'medium',
      });
    }

    if (memoryEntries.length === 0) {
      signals.push({
        title: 'No organizational memory entries',
        recommendation: 'Capture business decisions, lessons learned, and project history in organizational memory for semantic search.',
        priority: 'medium',
      });
    }

    if (stats.pendingRecommendationCount > 0) {
      signals.push({
        title: 'Pending knowledge recommendations',
        recommendation: `${stats.pendingRecommendationCount} existing knowledge recommendation(s) from the learning module require review.`,
        priority: 'low',
      });
    }

    const created: KnowledgeGraphRecommendationSummary[] = [];
    for (const signal of signals.slice(0, 8)) {
      const [row] = await this.deps.db
        .insert(knowledgeGraphRecommendations)
        .values({
          companyId,
          title: signal.title,
          recommendation: signal.recommendation,
          priority: signal.priority,
        })
        .returning();
      created.push(toRecommendationSummary(row!));
    }

    return created;
  }

  async listRecommendations(companyId: string): Promise<KnowledgeGraphRecommendationSummary[]> {
    const rows = await this.deps.db.query.knowledgeGraphRecommendations.findMany({
      where: eq(knowledgeGraphRecommendations.companyId, companyId),
      orderBy: [desc(knowledgeGraphRecommendations.createdAt)],
      limit: 50,
    });
    return rows.map(toRecommendationSummary);
  }

  async listActions(
    companyId: string,
    status?: KnowledgeGraphPlatformActionSummary['status'],
  ): Promise<KnowledgeGraphPlatformActionSummary[]> {
    const rows = await this.deps.db.query.knowledgeGraphPlatformActions.findMany({
      where: status
        ? and(eq(knowledgeGraphPlatformActions.companyId, companyId), eq(knowledgeGraphPlatformActions.status, status))
        : eq(knowledgeGraphPlatformActions.companyId, companyId),
      orderBy: [desc(knowledgeGraphPlatformActions.createdAt)],
      limit: 50,
    });
    return rows.map(toActionSummary);
  }

  async createAction(
    scope: StaffScope,
    input: CreateKnowledgeGraphActionRequest,
  ): Promise<KnowledgeGraphPlatformActionSummary> {
    const [row] = await this.deps.db
      .insert(knowledgeGraphPlatformActions)
      .values({
        companyId: scope.companyId,
        actionType: input.actionType,
        subject: input.subject,
        recommendation: input.recommendation,
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    await this.deps.db.insert(knowledgeGraphAccessAudit).values({
      companyId: scope.companyId,
      userId: scope.userId,
      action: 'create_platform_action',
      metadata: { actionType: input.actionType },
    });

    return toActionSummary(row!);
  }

  private async upsertRelationship(
    companyId: string,
    sourceEntityId: string,
    targetEntityId: string,
    relationshipType: KnowledgeGraphRelationshipSummary['relationshipType'],
    label: string,
  ): Promise<number> {
    const existing = await this.deps.db.query.knowledgeGraphRelationships.findFirst({
      where: and(
        eq(knowledgeGraphRelationships.companyId, companyId),
        eq(knowledgeGraphRelationships.sourceEntityId, sourceEntityId),
        eq(knowledgeGraphRelationships.targetEntityId, targetEntityId),
        eq(knowledgeGraphRelationships.relationshipType, relationshipType),
      ),
    });

    if (existing) {
      await this.deps.db
        .update(knowledgeGraphRelationships)
        .set({ label, updatedAt: new Date() })
        .where(eq(knowledgeGraphRelationships.id, existing.id));
      return 0;
    }

    const [created] = await this.deps.db
      .insert(knowledgeGraphRelationships)
      .values({
        companyId,
        sourceEntityId,
        targetEntityId,
        relationshipType,
        label,
      })
      .returning();

    await this.deps.db.insert(knowledgeGraphRelationshipHistory).values({
      companyId,
      relationshipId: created!.id,
      changeType: 'created',
      snapshot: { sourceEntityId, targetEntityId, relationshipType, label },
    });

    return 1;
  }

  private async computeCoverage(companyId: string): Promise<KnowledgeGraphCoverage> {
    const entities = await this.deps.db.query.knowledgeGraphEntities.findMany({
      where: eq(knowledgeGraphEntities.companyId, companyId),
      limit: 5000,
    });
    const relationships = await this.listRelationships(companyId);
    const memoryEntries = await this.listOrganizationalMemory(companyId);
    const indexCount = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(knowledgeSemanticIndex)
      .where(eq(knowledgeSemanticIndex.companyId, companyId));

    const entityTypeCounts: Record<string, number> = {};
    for (const entity of entities) {
      entityTypeCounts[entity.entityType] = (entityTypeCounts[entity.entityType] ?? 0) + 1;
    }

    const moduleTypes = ['customer', 'job', 'vehicle', 'inventory', 'invoice', 'document', 'workflow'];
    const covered = moduleTypes.filter((type) => (entityTypeCounts[type] ?? 0) > 0).length;

    return {
      entityTypeCounts,
      relationshipCount: relationships.length,
      indexedDocumentCount: entityTypeCounts.document ?? 0,
      memoryEntryCount: memoryEntries.length,
      coveragePercent: Math.round((covered / moduleTypes.length) * 100),
      semanticIndexCount: indexCount[0]?.count ?? 0,
    };
  }

  private canAccess(requiredPermissions: string[], userPermissions: string[]): boolean {
    if (requiredPermissions.length === 0) return true;
    return hasAnyPermission(userPermissions, requiredPermissions);
  }
}

function scoreHybridMatch(query: string, title: string, body: string, keywords: string[]): number {
  const haystack = `${title} ${body} ${keywords.join(' ')}`.toLowerCase();
  if (haystack.includes(query)) return 100;
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const matched = tokens.filter((token) => haystack.includes(token)).length;
  return Math.round((matched / tokens.length) * 80);
}

function dedupeResults(results: KnowledgeSemanticSearchResult[]): KnowledgeSemanticSearchResult[] {
  const seen = new Map<string, KnowledgeSemanticSearchResult>();
  for (const result of results) {
    const key = `${result.resultType}:${result.id}`;
    const existing = seen.get(key);
    if (!existing || result.relevanceScore > existing.relevanceScore) {
      seen.set(key, result);
    }
  }
  return [...seen.values()];
}

function toEntitySummary(row: typeof knowledgeGraphEntities.$inferSelect): KnowledgeGraphEntitySummary {
  return {
    id: row.id,
    entityType: row.entityType,
    sourceEntityId: row.sourceEntityId,
    label: row.label,
    summary: row.summary,
    classification: row.classification,
    indexedAt: row.indexedAt.toISOString(),
  };
}

function toMemorySummary(row: typeof organizationalMemoryEntries.$inferSelect): OrganizationalMemorySummary {
  return {
    id: row.id,
    memoryType: row.memoryType,
    title: row.title,
    summary: row.summary,
    classification: row.classification,
    versionNumber: row.versionNumber,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRecommendationSummary(
  row: typeof knowledgeGraphRecommendations.$inferSelect,
): KnowledgeGraphRecommendationSummary {
  return {
    id: row.id,
    title: row.title,
    recommendation: row.recommendation,
    priority: row.priority,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function toActionSummary(row: typeof knowledgeGraphPlatformActions.$inferSelect): KnowledgeGraphPlatformActionSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    status: row.status,
    subject: row.subject,
    recommendation: row.recommendation,
    createdAt: row.createdAt.toISOString(),
  };
}
