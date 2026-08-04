import { and, desc, eq } from 'drizzle-orm';
import { hasAnyPermission } from '@titan/auth';
import type {
  CreateGsActionDraftRequest,
  CreateGsActivityFeedConfigRequest,
  CreateGsSavedSearchRequest,
  CreateGsSearchSuggestionRequest,
  EnterpriseGlobalSearchAuraContext,
  EnterpriseGlobalSearchDashboard,
  GsActionDraftSummary,
  GsActivityFeedConfigSummary,
  GsActivityFeedItemSummary,
  GsActivityFeedQueryRequest,
  GsAnalyticsSummary,
  GsAuditLogSummary,
  GsEntityType,
  GsGlobalSearchRequest,
  GsPlatformConfigSummary,
  GsRecentSearchSummary,
  GsRelationshipLinkSummary,
  GsRelationshipQueryRequest,
  GsSavedSearchSummary,
  GsSearchAlertSummary,
  GsSearchHealthSummary,
  GsSearchMode,
  GsSearchResultSummary,
  GsSearchSuggestionSummary,
  GsTimelineEntrySummary,
  GsTimelineEventType,
  GsTimelineQueryRequest,
  UpdateGsPlatformConfigRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  gsActionDrafts,
  gsActivityFeedConfigs,
  gsActivityFeedItems,
  gsAnalyticsSnapshots,
  gsAuditLogs,
  gsPlatformConfig,
  gsRecentSearches,
  gsRelationshipLinks,
  gsSavedSearches,
  gsSearchAlerts,
  gsSearchIndexEntries,
  gsSearchSuggestions,
  gsTimelineEntries,
  ucTimelineIndex,
} from '@titan/db';
import type { CrmService } from './crm.service.js';
import type { DocumentsService } from './documents.service.js';
import type { EnterpriseDocumentAiService } from './enterprise-document-ai.service.js';
import type { EnterpriseKnowledgeGraphService } from './enterprise-knowledge-graph.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { FinanceService } from './finance.service.js';
import type { FleetService } from './fleet.service.js';
import type { InventoryService } from './inventory.service.js';
import type { JobsService } from './jobs.service.js';
import type { LeadsService } from './leads.service.js';
import type { ProcurementService } from './procurement.service.js';

export class EnterpriseGlobalSearchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseGlobalSearchError';
  }
}

type StaffScope = { companyId: string; userId: string };

type GlobalSearchDeps = {
  db: DatabaseClient;
  crmService: CrmService;
  jobsService: JobsService;
  financeService: FinanceService;
  leadsService: LeadsService;
  inventoryService: InventoryService;
  fleetService: FleetService;
  procurementService: ProcurementService;
  documentsService: DocumentsService;
  enterpriseDocumentAiService: EnterpriseDocumentAiService;
  enterpriseKnowledgeGraphService: EnterpriseKnowledgeGraphService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
};

function scoreMatch(
  query: string,
  mode: GsSearchMode,
  ...fields: Array<string | null | undefined>
): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const haystack = fields.filter(Boolean).join(' ').toLowerCase();
  if (haystack.includes(q)) return 1;
  if (mode === 'fuzzy' || mode === 'hybrid' || mode === 'natural_language') {
    const words = q.split(/\s+/).filter(Boolean);
    if (words.length > 0 && words.every((word) => haystack.includes(word))) return 0.75;
  }
  return 0;
}

function canAccess(userPermissions: string[], required: string | string[]): boolean {
  const perms = Array.isArray(required) ? required : [required];
  if (perms.length === 0) return true;
  return hasAnyPermission(userPermissions, perms) || userPermissions.includes('*');
}

export class EnterpriseGlobalSearchService {
  constructor(private readonly deps: GlobalSearchDeps) {}

  async getDashboard(companyId: string, userId?: string): Promise<EnterpriseGlobalSearchDashboard> {
    await this.ensurePlatformConfig(companyId);

    const [
      platformConfig,
      indexStats,
      recentSearches,
      savedSearches,
      searchSuggestions,
      timelinePreview,
      activityFeedPreview,
      relationshipPreview,
      analytics,
      alerts,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.getIndexStats(companyId),
      this.listRecentSearches(companyId, userId),
      this.listSavedSearches(companyId, userId),
      this.listSearchSuggestions(companyId),
      this.listTimelineEntries(companyId, { limit: 20 }),
      this.listActivityFeedItems(companyId, { feedScope: 'company', limit: 20 }),
      this.listRelationshipLinks(companyId, { limit: 20 }),
      this.getLatestAnalytics(companyId),
      this.listSearchAlerts(companyId, { status: 'open' }),
    ]);

    void this.deps.enterpriseMissionControlService
      .getMissionControlDashboard(companyId)
      .catch(() => null);

    const searchHealth = this.buildSearchHealth(
      indexStats,
      timelinePreview.length,
      activityFeedPreview.length,
      relationshipPreview.length,
    );
    const criticalAlertCount = alerts.filter((a) => a.severity === 'critical').length;
    const overallSearchHealthStatus =
      criticalAlertCount > 0 || searchHealth.failedIndexCount > 10
        ? 'critical'
        : alerts.length > 0 || searchHealth.pendingIndexCount > 20
          ? 'degraded'
          : 'healthy';

    return {
      summary: `${searchHealth.indexedCount} indexed record(s), ${recentSearches.length} recent search(es), ${savedSearches.length} saved search(es), ${timelinePreview.length} timeline event(s), ${alerts.length} open alert(s).`,
      platformConfig,
      searchHealth,
      recentSearches,
      savedSearches,
      searchSuggestions,
      timelinePreview,
      activityFeedPreview,
      relationshipPreview,
      analytics,
      recentAlerts: alerts.slice(0, 10),
      openAlertCount: alerts.length,
      overallSearchHealthStatus,
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseGlobalSearchAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      indexedCount: dashboard.searchHealth.indexedCount,
      failedIndexCount: dashboard.searchHealth.failedIndexCount,
      openAlertCount: dashboard.openAlertCount,
      overallSearchHealthStatus: dashboard.overallSearchHealthStatus,
    };
  }

  async globalSearch(
    scope: StaffScope,
    input: GsGlobalSearchRequest,
    userPermissions: string[],
  ): Promise<GsSearchResultSummary[]> {
    const query = input.query.trim();
    if (!query) return [];

    const mode = input.searchMode ?? 'hybrid';
    const limit = Math.min(input.limit ?? 50, 100);
    const entityFilter = input.entityTypes?.length ? new Set(input.entityTypes) : null;
    const results: GsSearchResultSummary[] = [];

    const addResult = (result: GsSearchResultSummary, requiredPermissions: string[]) => {
      if (entityFilter && !entityFilter.has(result.entityType)) return;
      if (!canAccess(userPermissions, requiredPermissions)) return;
      if (result.relevanceScore <= 0) return;
      results.push(result);
    };

    if (canAccess(userPermissions, 'customers:read')) {
      const customers = await this.deps.crmService.listCustomers(scope.companyId);
      for (const customer of customers) {
        const score = scoreMatch(
          query,
          mode,
          customer.name,
          customer.email,
          customer.phone,
          customer.status,
        );
        addResult(
          {
            entityType: 'customer',
            sourceModule: 'crm',
            sourceEntityId: customer.id,
            title: customer.name,
            summary: customer.email ?? customer.phone,
            relevanceScore: score,
            searchMode: mode,
            metadata: { status: customer.status },
          },
          ['customers:read'],
        );
      }
    }

    if (canAccess(userPermissions, 'leads:read')) {
      const leads = await this.deps.leadsService.listLeads(scope.companyId);
      for (const lead of leads) {
        const score = scoreMatch(query, mode, lead.title, lead.contactName, lead.status);
        addResult(
          {
            entityType: 'lead',
            sourceModule: 'leads',
            sourceEntityId: lead.id,
            title: lead.title,
            summary: lead.contactName,
            relevanceScore: score,
            searchMode: mode,
            metadata: { status: lead.status, score: lead.score },
          },
          ['leads:read'],
        );
      }
    }

    if (canAccess(userPermissions, 'jobs:read')) {
      const jobs = await this.deps.jobsService.listJobs(scope.companyId);
      for (const job of jobs) {
        const score = scoreMatch(
          query,
          mode,
          job.jobNumber ?? '',
          job.title,
          job.customerName,
          job.status,
          job.addressDisplay ?? '',
        );
        addResult(
          {
            entityType: 'job',
            sourceModule: 'jobs',
            sourceEntityId: job.id,
            title: job.title,
            summary: `${job.customerName} · ${job.status}`,
            relevanceScore: score,
            searchMode: mode,
            metadata: { customerId: job.customerId, status: job.status },
          },
          ['jobs:read'],
        );
      }
    }

    if (canAccess(userPermissions, 'finance:read')) {
      const [quotes, invoices, payments] = await Promise.all([
        this.deps.financeService.listQuotes(scope.companyId),
        this.deps.financeService.listInvoices(scope.companyId),
        this.deps.financeService.listPayments(scope.companyId),
      ]);

      for (const quote of quotes) {
        const score = scoreMatch(
          query,
          mode,
          quote.displayQuoteNumber,
          quote.quoteNumber,
          quote.customerName,
          quote.status,
        );
        addResult(
          {
            entityType: 'quote',
            sourceModule: 'finance',
            sourceEntityId: quote.id,
            title: `${quote.displayQuoteNumber} — ${quote.customerName}`,
            summary: quote.customerName,
            relevanceScore: score,
            searchMode: mode,
            metadata: { status: quote.status, amountCents: quote.amountCents },
          },
          ['finance:read'],
        );
      }

      for (const invoice of invoices) {
        const score = scoreMatch(
          query,
          mode,
          invoice.displayOfficialInvoiceNumber,
          invoice.invoiceNumber,
          invoice.customerName,
          invoice.status,
        );
        addResult(
          {
            entityType: 'invoice',
            sourceModule: 'finance',
            sourceEntityId: invoice.id,
            title: `${invoice.displayOfficialInvoiceNumber} — ${invoice.customerName}`,
            summary: invoice.customerName,
            relevanceScore: score,
            searchMode: mode,
            metadata: { status: invoice.status, amountCents: invoice.amountCents },
          },
          ['finance:read'],
        );
      }

      for (const payment of payments) {
        const score = scoreMatch(
          query,
          mode,
          payment.invoiceNumber,
          payment.customerName,
          payment.reference ?? '',
        );
        addResult(
          {
            entityType: 'payment',
            sourceModule: 'finance',
            sourceEntityId: payment.id,
            title: `Payment — ${payment.invoiceNumber}`,
            summary: payment.customerName,
            relevanceScore: score,
            searchMode: mode,
            metadata: { amountCents: payment.amountCents },
          },
          ['finance:read'],
        );
      }
    }

    if (canAccess(userPermissions, 'inventory:read')) {
      const items = await this.deps.inventoryService.listItems(scope.companyId);
      for (const item of items) {
        const score = scoreMatch(query, mode, item.sku, item.name, item.status);
        addResult(
          {
            entityType: 'inventory',
            sourceModule: 'inventory',
            sourceEntityId: item.id,
            title: item.name,
            summary: item.sku,
            relevanceScore: score,
            searchMode: mode,
            metadata: { sku: item.sku, status: item.status },
          },
          ['inventory:read'],
        );
      }
    }

    if (canAccess(userPermissions, 'fleet:read')) {
      const vehicles = await this.deps.fleetService.listVehicles(scope.companyId);
      for (const vehicle of vehicles) {
        const score = scoreMatch(
          query,
          mode,
          vehicle.name,
          vehicle.licensePlate,
          vehicle.make,
          vehicle.model,
        );
        addResult(
          {
            entityType: 'vehicle',
            sourceModule: 'fleet',
            sourceEntityId: vehicle.id,
            title: vehicle.name,
            summary: vehicle.licensePlate,
            relevanceScore: score,
            searchMode: mode,
            metadata: { status: vehicle.status },
          },
          ['fleet:read'],
        );
      }
    }

    if (canAccess(userPermissions, 'procurement:read')) {
      const suppliers = await this.deps.procurementService.listSuppliers(scope.companyId);
      for (const supplier of suppliers) {
        const score = scoreMatch(query, mode, supplier.name, supplier.email, supplier.phone);
        addResult(
          {
            entityType: 'supplier',
            sourceModule: 'procurement',
            sourceEntityId: supplier.id,
            title: supplier.name,
            summary: supplier.email,
            relevanceScore: score,
            searchMode: mode,
            metadata: { status: supplier.status },
          },
          ['procurement:read'],
        );
      }
    }

    if (canAccess(userPermissions, 'documents:read')) {
      const documents = await this.deps.documentsService.listDocuments(scope.companyId);
      for (const doc of documents) {
        const score = scoreMatch(
          query,
          mode,
          doc.title,
          doc.fileName,
          doc.categoryName,
          doc.customerName,
          doc.jobTitle,
        );
        addResult(
          {
            entityType: 'document',
            sourceModule: 'documents',
            sourceEntityId: doc.id,
            title: doc.title,
            summary: doc.fileName,
            relevanceScore: score,
            searchMode: mode,
            metadata: { fileType: doc.fileType },
          },
          ['documents:read'],
        );
      }

      if (canAccess(userPermissions, 'document_ai:read')) {
        const ocrResults = await this.deps.enterpriseDocumentAiService.searchDocuments(
          scope.companyId,
          {
            query,
            limit,
          },
        );
        for (const ocr of ocrResults) {
          addResult(
            {
              entityType: 'ocr_content',
              sourceModule: 'document_ai',
              sourceEntityId: ocr.documentId,
              title: ocr.documentTitle ?? ocr.fileName ?? 'Document OCR',
              summary: ocr.matchedText,
              relevanceScore: 0.9,
              searchMode: mode,
              metadata: { classificationKey: ocr.classificationKey },
            },
            ['document_ai:read', 'documents:read'],
          );
        }
      }
    }

    if (canAccess(userPermissions, 'knowledge:read')) {
      const kgResults = await this.deps.enterpriseKnowledgeGraphService.semanticSearch(
        scope,
        { query, mode: mode === 'keyword' ? 'keyword' : 'hybrid', limit },
        userPermissions,
      );
      for (const row of kgResults) {
        addResult(
          {
            entityType: 'knowledge_article',
            sourceModule: 'knowledge_graph',
            sourceEntityId: row.id,
            title: row.title,
            summary: row.summary,
            relevanceScore: row.relevanceScore,
            searchMode: row.searchMode as GsSearchMode,
            metadata: { entityType: row.entityType, resultType: row.resultType },
          },
          ['knowledge:read'],
        );
      }
    }

    const indexRows = await this.deps.db.query.gsSearchIndexEntries.findMany({
      where: eq(gsSearchIndexEntries.companyId, scope.companyId),
      limit: 500,
    });
    for (const row of indexRows) {
      const required = (row.requiredPermissions as string[]) ?? [];
      const tagFields = Array.isArray(row.tags) ? row.tags.map(String) : [];
      const score = scoreMatch(
        query,
        mode,
        row.title,
        row.summary,
        row.searchableText,
        ...tagFields,
      );
      addResult(
        {
          entityType: row.entityType as GsEntityType,
          sourceModule: row.sourceModule,
          sourceEntityId: row.sourceEntityId,
          title: row.title,
          summary: row.summary,
          relevanceScore: score,
          searchMode: mode,
          metadata: row.metadata as Record<string, unknown>,
        },
        required.length > 0 ? required : ['search:read'],
      );
    }

    const sorted = results.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, limit);

    await this.deps.db.insert(gsRecentSearches).values({
      companyId: scope.companyId,
      userId: scope.userId,
      query,
      searchMode: mode,
      resultCount: sorted.length,
    });
    await this.logAudit(scope, 'global_search', 'search', undefined, {
      query,
      resultCount: sorted.length,
      mode,
    });

    return sorted;
  }

  async getTimeline(
    scope: StaffScope,
    input: GsTimelineQueryRequest,
  ): Promise<GsTimelineEntrySummary[]> {
    const limit = Math.min(input.limit ?? 100, 200);
    const entries: GsTimelineEntrySummary[] = [];

    const stored = await this.deps.db.query.gsTimelineEntries.findMany({
      where: and(
        eq(gsTimelineEntries.companyId, scope.companyId),
        eq(gsTimelineEntries.entityType, input.entityType),
        eq(gsTimelineEntries.entityId, input.entityId),
      ),
      orderBy: [desc(gsTimelineEntries.occurredAt)],
      limit,
    });
    entries.push(...stored.map(toTimelineEntrySummary));

    if (input.entityType === 'customer') {
      const customer = await this.deps.crmService.getCustomer(scope.companyId, input.entityId);
      if (customer) {
        for (const activity of customer.activities) {
          entries.push({
            id: activity.id,
            entityType: 'customer',
            entityId: input.entityId,
            eventType: 'note_added',
            title: 'Customer note',
            description: activity.content,
            sourceModule: 'crm',
            sourceEntityId: activity.id,
            occurredAt: activity.createdAt,
          });
        }
      }

      const jobs = (await this.deps.jobsService.listJobs(scope.companyId)).filter(
        (j) => j.customerId === input.entityId,
      );
      for (const job of jobs) {
        entries.push({
          id: job.id,
          entityType: 'customer',
          entityId: input.entityId,
          eventType: job.status === 'completed' ? 'work_completed' : 'job_booked',
          title: job.title,
          description: job.status,
          sourceModule: 'jobs',
          sourceEntityId: job.id,
          occurredAt: job.scheduledAt ?? job.createdAt,
        });
      }

      const ucTimeline = await this.deps.db.query.ucTimelineIndex.findMany({
        where: and(
          eq(ucTimelineIndex.companyId, scope.companyId),
          eq(ucTimelineIndex.customerId, input.entityId),
        ),
        orderBy: [desc(ucTimelineIndex.occurredAt)],
        limit: 50,
      });
      for (const row of ucTimeline) {
        entries.push({
          id: row.id,
          entityType: 'customer',
          entityId: input.entityId,
          eventType: mapUcTimelineEvent(row.entryType),
          title: row.title,
          description: row.summary,
          sourceModule: row.sourceModule,
          sourceEntityId: row.sourceEntityId,
          occurredAt: row.occurredAt.toISOString(),
        });
      }
    }

    return entries
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, limit);
  }

  async getRelationships(
    scope: StaffScope,
    input: GsRelationshipQueryRequest,
  ): Promise<GsRelationshipLinkSummary[]> {
    const limit = Math.min(input.limit ?? 50, 100);
    const links: GsRelationshipLinkSummary[] = [];

    const stored = await this.deps.db.query.gsRelationshipLinks.findMany({
      where: and(
        eq(gsRelationshipLinks.companyId, scope.companyId),
        eq(gsRelationshipLinks.fromEntityType, input.entityType),
        eq(gsRelationshipLinks.fromEntityId, input.entityId),
      ),
      orderBy: [desc(gsRelationshipLinks.createdAt)],
      limit,
    });
    links.push(...stored.map(toRelationshipLinkSummary));

    if (input.entityType === 'customer') {
      const jobs = (await this.deps.jobsService.listJobs(scope.companyId)).filter(
        (j) => j.customerId === input.entityId,
      );
      for (const job of jobs) {
        links.push({
          id: job.id,
          fromEntityType: 'customer',
          fromEntityId: input.entityId,
          toEntityType: 'job',
          toEntityId: job.id,
          relationshipType: 'has_job',
          sourceModule: 'jobs',
          createdAt: job.createdAt,
        });
      }

      const quotes = (await this.deps.financeService.listQuotes(scope.companyId)).filter(
        (q) => q.customerId === input.entityId,
      );
      for (const quote of quotes) {
        links.push({
          id: quote.id,
          fromEntityType: 'customer',
          fromEntityId: input.entityId,
          toEntityType: 'quote',
          toEntityId: quote.id,
          relationshipType: 'has_quote',
          sourceModule: 'finance',
          createdAt: quote.createdAt,
        });
      }

      const invoices = (await this.deps.financeService.listInvoices(scope.companyId)).filter(
        (i) => i.customerId === input.entityId,
      );
      for (const invoice of invoices) {
        links.push({
          id: invoice.id,
          fromEntityType: 'customer',
          fromEntityId: input.entityId,
          toEntityType: 'invoice',
          toEntityId: invoice.id,
          relationshipType: 'has_invoice',
          sourceModule: 'finance',
          createdAt: invoice.createdAt,
        });
      }

      const documents = (await this.deps.documentsService.listDocuments(scope.companyId)).filter(
        (d) => d.customerId === input.entityId,
      );
      for (const doc of documents) {
        links.push({
          id: doc.id,
          fromEntityType: 'customer',
          fromEntityId: input.entityId,
          toEntityType: 'document',
          toEntityId: doc.id,
          relationshipType: 'has_document',
          sourceModule: 'documents',
          createdAt: doc.createdAt,
        });
      }
    }

    return links.slice(0, limit);
  }

  async getActivityFeed(
    scope: StaffScope,
    input: GsActivityFeedQueryRequest,
  ): Promise<GsActivityFeedItemSummary[]> {
    const limit = Math.min(input.limit ?? 50, 100);
    const conditions = [eq(gsActivityFeedItems.companyId, scope.companyId)];

    const rows = await this.deps.db.query.gsActivityFeedItems.findMany({
      where: and(...conditions),
      orderBy: [desc(gsActivityFeedItems.occurredAt)],
      limit: 200,
    });

    let filtered = rows.map(toActivityFeedItemSummary);
    if (input.feedScope) filtered = filtered.filter((r) => r.feedScope === input.feedScope);
    if (input.moduleKey) filtered = filtered.filter((r) => r.moduleKey === input.moduleKey);
    if (input.eventType) filtered = filtered.filter((r) => r.eventType === input.eventType);
    if (input.fromDate) {
      const from = new Date(input.fromDate);
      filtered = filtered.filter((r) => new Date(r.occurredAt) >= from);
    }
    if (input.toDate) {
      const to = new Date(input.toDate);
      filtered = filtered.filter((r) => new Date(r.occurredAt) <= to);
    }

    return filtered.slice(0, limit);
  }

  async getPlatformConfig(companyId: string): Promise<GsPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(
    scope: StaffScope,
    input: UpdateGsPlatformConfigRequest,
  ): Promise<GsPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(gsPlatformConfig)
      .set({
        searchPolicy: input.searchPolicy ?? existing.searchPolicy,
        timelinePolicy: input.timelinePolicy ?? existing.timelinePolicy,
        feedPolicy: input.feedPolicy ?? existing.feedPolicy,
        indexPolicy: input.indexPolicy ?? existing.indexPolicy,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(gsPlatformConfig.companyId, scope.companyId))
      .returning();
    await this.logAudit(scope, 'update_platform_config', 'gs_platform_config', updated?.id);
    return toPlatformConfigSummary(updated ?? existing);
  }

  async listSavedSearches(companyId: string, userId?: string): Promise<GsSavedSearchSummary[]> {
    const rows = await this.deps.db.query.gsSavedSearches.findMany({
      where: eq(gsSavedSearches.companyId, companyId),
      orderBy: [desc(gsSavedSearches.createdAt)],
      limit: 50,
    });
    return rows
      .filter((r) => !userId || r.userId === userId || r.userId === null)
      .map(toSavedSearchSummary);
  }

  async createSavedSearch(
    scope: StaffScope,
    input: CreateGsSavedSearchRequest,
  ): Promise<GsSavedSearchSummary> {
    const [created] = await this.deps.db
      .insert(gsSavedSearches)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        name: input.name.trim(),
        query: input.query.trim(),
        searchMode: input.searchMode ?? 'hybrid',
        filters: input.filters ?? {},
        entityTypes: input.entityTypes ?? [],
      })
      .returning();
    if (!created)
      throw new EnterpriseGlobalSearchError('CREATE_FAILED', 'Unable to create saved search');
    await this.logAudit(scope, 'create_saved_search', 'gs_saved_searches', created.id);
    return toSavedSearchSummary(created);
  }

  async listRecentSearches(companyId: string, userId?: string): Promise<GsRecentSearchSummary[]> {
    const rows = await this.deps.db.query.gsRecentSearches.findMany({
      where: eq(gsRecentSearches.companyId, companyId),
      orderBy: [desc(gsRecentSearches.searchedAt)],
      limit: 20,
    });
    return rows.filter((r) => !userId || r.userId === userId).map(toRecentSearchSummary);
  }

  async listSearchSuggestions(companyId: string): Promise<GsSearchSuggestionSummary[]> {
    const rows = await this.deps.db.query.gsSearchSuggestions.findMany({
      where: eq(gsSearchSuggestions.companyId, companyId),
      orderBy: [desc(gsSearchSuggestions.createdAt)],
      limit: 20,
    });
    return rows.map(toSearchSuggestionSummary);
  }

  async createSearchSuggestion(
    scope: StaffScope,
    input: CreateGsSearchSuggestionRequest,
  ): Promise<GsSearchSuggestionSummary> {
    const [created] = await this.deps.db
      .insert(gsSearchSuggestions)
      .values({
        companyId: scope.companyId,
        suggestionText: input.suggestionText.trim(),
        suggestionType: input.suggestionType ?? 'ai_assisted',
        entityType: input.entityType ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    if (!created)
      throw new EnterpriseGlobalSearchError('CREATE_FAILED', 'Unable to create search suggestion');
    return toSearchSuggestionSummary(created);
  }

  async listSearchAlerts(
    companyId: string,
    filters?: { status?: string },
  ): Promise<GsSearchAlertSummary[]> {
    const rows = await this.deps.db.query.gsSearchAlerts.findMany({
      where: filters?.status
        ? and(
            eq(gsSearchAlerts.companyId, companyId),
            eq(gsSearchAlerts.status, filters.status as never),
          )
        : eq(gsSearchAlerts.companyId, companyId),
      orderBy: [desc(gsSearchAlerts.createdAt)],
      limit: 100,
    });
    return rows.map(toSearchAlertSummary);
  }

  async syncSearchAlerts(scope: StaffScope): Promise<GsSearchAlertSummary[]> {
    const stats = await this.getIndexStats(scope.companyId);
    const alerts: GsSearchAlertSummary[] = [];

    if (stats.failed > 0) {
      alerts.push(
        await this.upsertSearchAlert(scope.companyId, {
          alertType: 'failed_indexing',
          severity: stats.failed > 10 ? 'critical' : 'warning',
          title: 'Failed search indexing detected',
          description: `${stats.failed} index entr${stats.failed === 1 ? 'y' : 'ies'} failed.`,
        }),
      );
    }

    if (stats.pending > 50) {
      alerts.push(
        await this.upsertSearchAlert(scope.companyId, {
          alertType: 'index_backlog',
          severity: 'warning',
          title: 'Search index backlog',
          description: `${stats.pending} pending index entr${stats.pending === 1 ? 'y' : 'ies'}.`,
        }),
      );
    }

    await this.logAudit(scope, 'sync_search_alerts', 'gs_search_alerts');
    return alerts;
  }

  async captureAnalytics(scope: StaffScope): Promise<GsAnalyticsSummary> {
    const stats = await this.getIndexStats(scope.companyId);
    const recent = await this.listRecentSearches(scope.companyId);
    const metrics = {
      indexedCount: stats.indexed,
      pendingIndexCount: stats.pending,
      failedIndexCount: stats.failed,
      recentSearchCount: recent.length,
    };
    const [created] = await this.deps.db
      .insert(gsAnalyticsSnapshots)
      .values({ companyId: scope.companyId, metrics })
      .returning();
    await this.logAudit(scope, 'capture_analytics', 'gs_analytics_snapshots', created?.id);
    return toAnalyticsSummary(created!);
  }

  async listActivityFeedConfigs(
    companyId: string,
    userId?: string,
  ): Promise<GsActivityFeedConfigSummary[]> {
    const rows = await this.deps.db.query.gsActivityFeedConfigs.findMany({
      where: eq(gsActivityFeedConfigs.companyId, companyId),
      orderBy: [desc(gsActivityFeedConfigs.createdAt)],
    });
    return rows
      .filter((r) => !userId || r.userId === userId || r.userId === null)
      .map(toActivityFeedConfigSummary);
  }

  async createActivityFeedConfig(
    scope: StaffScope,
    input: CreateGsActivityFeedConfigRequest,
  ): Promise<GsActivityFeedConfigSummary> {
    const [created] = await this.deps.db
      .insert(gsActivityFeedConfigs)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        feedScope: input.feedScope ?? 'personal',
        name: input.name.trim(),
        filters: input.filters ?? {},
        enabled: input.enabled ?? true,
      })
      .returning();
    if (!created)
      throw new EnterpriseGlobalSearchError('CREATE_FAILED', 'Unable to create feed config');
    await this.logAudit(scope, 'create_feed_config', 'gs_activity_feed_configs', created.id);
    return toActivityFeedConfigSummary(created);
  }

  async listActionDrafts(companyId: string): Promise<GsActionDraftSummary[]> {
    const rows = await this.deps.db.query.gsActionDrafts.findMany({
      where: eq(gsActionDrafts.companyId, companyId),
      orderBy: [desc(gsActionDrafts.createdAt)],
      limit: 50,
    });
    return rows.map(toActionDraftSummary);
  }

  async createActionDraft(
    scope: StaffScope,
    input: CreateGsActionDraftRequest,
  ): Promise<GsActionDraftSummary> {
    const [created] = await this.deps.db
      .insert(gsActionDrafts)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
      })
      .returning();
    if (!created)
      throw new EnterpriseGlobalSearchError('CREATE_FAILED', 'Unable to create action draft');
    await this.logAudit(scope, 'create_action_draft', 'gs_action_drafts', created.id);
    return toActionDraftSummary(created);
  }

  async listAuditLogs(companyId: string): Promise<GsAuditLogSummary[]> {
    const rows = await this.deps.db.query.gsAuditLogs.findMany({
      where: eq(gsAuditLogs.companyId, companyId),
      orderBy: [desc(gsAuditLogs.createdAt)],
      limit: 200,
    });
    return rows.map(toAuditLogSummary);
  }

  async refreshSearchIndex(scope: StaffScope): Promise<{ indexedCount: number }> {
    let count = 0;
    const customers = await this.deps.crmService.listCustomers(scope.companyId);
    for (const customer of customers) {
      await this.upsertIndexEntry(scope.companyId, {
        entityType: 'customer',
        sourceModule: 'crm',
        sourceEntityId: customer.id,
        title: customer.name,
        summary: customer.email,
        searchableText: [customer.name, customer.email, customer.phone, customer.status]
          .filter(Boolean)
          .join(' '),
        requiredPermissions: ['customers:read'],
      });
      count++;
    }
    await this.logAudit(scope, 'refresh_search_index', 'gs_search_index_entries', undefined, {
      indexedCount: count,
    });
    return { indexedCount: count };
  }

  private async listTimelineEntries(companyId: string, opts: { limit?: number }) {
    const rows = await this.deps.db.query.gsTimelineEntries.findMany({
      where: eq(gsTimelineEntries.companyId, companyId),
      orderBy: [desc(gsTimelineEntries.occurredAt)],
      limit: opts.limit ?? 20,
    });
    return rows.map(toTimelineEntrySummary);
  }

  private async listActivityFeedItems(
    companyId: string,
    opts: { feedScope?: string; limit?: number },
  ) {
    const rows = await this.deps.db.query.gsActivityFeedItems.findMany({
      where: eq(gsActivityFeedItems.companyId, companyId),
      orderBy: [desc(gsActivityFeedItems.occurredAt)],
      limit: opts.limit ?? 20,
    });
    return rows
      .filter((r) => !opts.feedScope || r.feedScope === opts.feedScope)
      .map(toActivityFeedItemSummary);
  }

  private async listRelationshipLinks(companyId: string, opts: { limit?: number }) {
    const rows = await this.deps.db.query.gsRelationshipLinks.findMany({
      where: eq(gsRelationshipLinks.companyId, companyId),
      orderBy: [desc(gsRelationshipLinks.createdAt)],
      limit: opts.limit ?? 20,
    });
    return rows.map(toRelationshipLinkSummary);
  }

  private async getIndexStats(companyId: string) {
    const rows = await this.deps.db.query.gsSearchIndexEntries.findMany({
      where: eq(gsSearchIndexEntries.companyId, companyId),
      columns: { id: true, status: true },
      limit: 1000,
    });
    return {
      indexed: rows.filter((r) => r.status === 'indexed').length,
      pending: rows.filter((r) => r.status === 'pending').length,
      failed: rows.filter((r) => r.status === 'failed').length,
    };
  }

  private buildSearchHealth(
    stats: { indexed: number; pending: number; failed: number },
    timelineCount: number,
    feedCount: number,
    relationshipCount: number,
  ): GsSearchHealthSummary {
    return {
      indexStatus: stats.failed > 0 ? 'degraded' : stats.pending > 0 ? 'indexing' : 'healthy',
      indexedCount: stats.indexed,
      pendingIndexCount: stats.pending,
      failedIndexCount: stats.failed,
      timelineEntryCount: timelineCount,
      activityFeedCount: feedCount,
      relationshipLinkCount: relationshipCount,
    };
  }

  private async upsertIndexEntry(
    companyId: string,
    input: {
      entityType: GsEntityType;
      sourceModule: string;
      sourceEntityId: string;
      title: string;
      summary: string | null | undefined;
      searchableText: string;
      requiredPermissions: string[];
    },
  ) {
    const existing = await this.deps.db.query.gsSearchIndexEntries.findFirst({
      where: and(
        eq(gsSearchIndexEntries.companyId, companyId),
        eq(gsSearchIndexEntries.sourceModule, input.sourceModule),
        eq(gsSearchIndexEntries.sourceEntityId, input.sourceEntityId),
      ),
    });
    if (existing) {
      await this.deps.db
        .update(gsSearchIndexEntries)
        .set({
          title: input.title,
          summary: input.summary ?? null,
          searchableText: input.searchableText.slice(0, 10000),
          requiredPermissions: input.requiredPermissions,
          status: 'indexed',
          updatedAt: new Date(),
        })
        .where(eq(gsSearchIndexEntries.id, existing.id));
      return;
    }
    await this.deps.db.insert(gsSearchIndexEntries).values({
      companyId,
      entityType: input.entityType,
      sourceModule: input.sourceModule,
      sourceEntityId: input.sourceEntityId,
      title: input.title,
      summary: input.summary ?? null,
      searchableText: input.searchableText.slice(0, 10000),
      requiredPermissions: input.requiredPermissions,
      status: 'indexed',
    });
  }

  private async upsertSearchAlert(
    companyId: string,
    input: {
      alertType: string;
      severity: 'info' | 'warning' | 'critical';
      title: string;
      description?: string;
    },
  ): Promise<GsSearchAlertSummary> {
    const existing = await this.deps.db.query.gsSearchAlerts.findFirst({
      where: and(
        eq(gsSearchAlerts.companyId, companyId),
        eq(gsSearchAlerts.alertType, input.alertType),
        eq(gsSearchAlerts.status, 'open'),
      ),
    });
    if (existing) {
      const [updated] = await this.deps.db
        .update(gsSearchAlerts)
        .set({
          severity: input.severity,
          title: input.title,
          description: input.description ?? existing.description,
          updatedAt: new Date(),
        })
        .where(eq(gsSearchAlerts.id, existing.id))
        .returning();
      return toSearchAlertSummary(updated ?? existing);
    }
    const [created] = await this.deps.db
      .insert(gsSearchAlerts)
      .values({
        companyId,
        alertType: input.alertType,
        severity: input.severity,
        title: input.title,
        description: input.description ?? null,
      })
      .returning();
    return toSearchAlertSummary(created!);
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.gsPlatformConfig.findFirst({
      where: eq(gsPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db.insert(gsPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async getLatestAnalytics(companyId: string): Promise<GsAnalyticsSummary | null> {
    const row = await this.deps.db.query.gsAnalyticsSnapshots.findFirst({
      where: eq(gsAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(gsAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  private async logAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(gsAuditLogs).values({
      companyId: scope.companyId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      userId: scope.userId,
      metadata: metadata ?? {},
    });
  }
}

function mapUcTimelineEvent(entryType: string): GsTimelineEventType {
  if (entryType.includes('whatsapp')) return 'whatsapp_conversation';
  if (entryType.includes('email')) return 'email_history';
  if (entryType.includes('call')) return 'communication';
  return 'communication';
}

function toPlatformConfigSummary(
  row: typeof gsPlatformConfig.$inferSelect,
): GsPlatformConfigSummary {
  return {
    searchPolicy: row.searchPolicy,
    timelinePolicy: row.timelinePolicy,
    feedPolicy: row.feedPolicy,
    indexPolicy: row.indexPolicy,
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toSavedSearchSummary(row: typeof gsSavedSearches.$inferSelect): GsSavedSearchSummary {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    searchMode: row.searchMode,
    filters: row.filters,
    entityTypes: row.entityTypes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRecentSearchSummary(row: typeof gsRecentSearches.$inferSelect): GsRecentSearchSummary {
  return {
    id: row.id,
    query: row.query,
    searchMode: row.searchMode,
    resultCount: row.resultCount,
    searchedAt: row.searchedAt.toISOString(),
  };
}

function toSearchSuggestionSummary(
  row: typeof gsSearchSuggestions.$inferSelect,
): GsSearchSuggestionSummary {
  return {
    id: row.id,
    suggestionText: row.suggestionText,
    suggestionType: row.suggestionType,
    entityType: row.entityType,
    createdAt: row.createdAt.toISOString(),
  };
}

function toTimelineEntrySummary(
  row: typeof gsTimelineEntries.$inferSelect,
): GsTimelineEntrySummary {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    eventType: row.eventType,
    title: row.title,
    description: row.description,
    sourceModule: row.sourceModule,
    sourceEntityId: row.sourceEntityId,
    occurredAt: row.occurredAt.toISOString(),
  };
}

function toRelationshipLinkSummary(
  row: typeof gsRelationshipLinks.$inferSelect,
): GsRelationshipLinkSummary {
  return {
    id: row.id,
    fromEntityType: row.fromEntityType,
    fromEntityId: row.fromEntityId,
    toEntityType: row.toEntityType,
    toEntityId: row.toEntityId,
    relationshipType: row.relationshipType,
    sourceModule: row.sourceModule,
    createdAt: row.createdAt.toISOString(),
  };
}

function toActivityFeedItemSummary(
  row: typeof gsActivityFeedItems.$inferSelect,
): GsActivityFeedItemSummary {
  return {
    id: row.id,
    feedScope: row.feedScope,
    eventType: row.eventType,
    moduleKey: row.moduleKey,
    title: row.title,
    description: row.description,
    entityType: row.entityType,
    entityId: row.entityId,
    occurredAt: row.occurredAt.toISOString(),
  };
}

function toActivityFeedConfigSummary(
  row: typeof gsActivityFeedConfigs.$inferSelect,
): GsActivityFeedConfigSummary {
  return {
    id: row.id,
    feedScope: row.feedScope,
    name: row.name,
    filters: row.filters,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSearchAlertSummary(row: typeof gsSearchAlerts.$inferSelect): GsSearchAlertSummary {
  return {
    id: row.id,
    alertType: row.alertType,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof gsAnalyticsSnapshots.$inferSelect): GsAnalyticsSummary {
  return {
    id: row.id,
    metrics: row.metrics,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toActionDraftSummary(row: typeof gsActionDrafts.$inferSelect): GsActionDraftSummary {
  return {
    id: row.id,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    aiGenerated: row.aiGenerated,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditLogSummary(row: typeof gsAuditLogs.$inferSelect): GsAuditLogSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}
