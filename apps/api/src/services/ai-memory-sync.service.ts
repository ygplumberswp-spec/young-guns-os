import { and, eq } from 'drizzle-orm';
import type { SyncAiMemoryRequest } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { aiMemorySyncRecords } from '@titan/db';
import type { EnterpriseKnowledgeGraphService } from './enterprise-knowledge-graph.service.js';
import type { MemoryService } from './memory.service.js';

type StaffScope = { companyId: string; userId: string };

type AiMemorySyncDeps = {
  db: DatabaseClient;
  memoryService: MemoryService;
  enterpriseKnowledgeGraphService: EnterpriseKnowledgeGraphService;
};

export class AiMemorySyncService {
  constructor(private readonly deps: AiMemorySyncDeps) {}

  async syncApprovedContext(scope: StaffScope, input: SyncAiMemoryRequest) {
    const existing = await this.deps.db.query.aiMemorySyncRecords.findFirst({
      where: and(
        eq(aiMemorySyncRecords.companyId, scope.companyId),
        eq(aiMemorySyncRecords.syncKey, input.syncKey),
      ),
    });

    if (existing) {
      return {
        syncRecordId: existing.id,
        deduplicated: true,
      };
    }

    await this.deps.memoryService.createMemory(scope, {
      category: mapContextTypeToMemoryCategory(input.contextType),
      information: input.content,
      importance:
        input.classification === 'restricted' ? 9 : input.classification === 'confidential' ? 7 : 5,
    });

    await this.deps.enterpriseKnowledgeGraphService.createOrganizationalMemory(scope, {
      memoryType: mapContextTypeToOrganizationalMemoryType(input.contextType),
      title: input.title,
      content: input.content,
      summary: input.summary ?? input.content.slice(0, 500),
      classification: input.classification ?? 'internal',
      requiredPermissions: [],
      relatedEntityIds: [],
    });

    const [record] = await this.deps.db
      .insert(aiMemorySyncRecords)
      .values({
        companyId: scope.companyId,
        contextType: input.contextType,
        syncKey: input.syncKey,
        providerId: input.providerId ?? null,
        metadata: {
          conversationId: input.conversationId ?? null,
          classification: input.classification ?? 'internal',
          title: input.title,
        },
      })
      .returning();

    return {
      syncRecordId: record!.id,
      deduplicated: false,
    };
  }

  sanitizeContextForExternalProvider<T extends Record<string, unknown>>(
    context: T,
    classification: 'public' | 'internal' | 'confidential' | 'restricted' = 'internal',
  ): T {
    if (classification === 'public') {
      return context;
    }

    const sanitized = { ...context } as Record<string, unknown>;

    if (classification === 'restricted' || classification === 'confidential') {
      delete sanitized.finance;
      delete sanitized.security;
      delete sanitized.enterpriseSecurity;
    }

    if (classification === 'restricted') {
      delete sanitized.crm;
      delete sanitized.recruiting;
      delete sanitized.xeroAccounting;
    }

    return sanitized as T;
  }
}

function mapContextTypeToOrganizationalMemoryType(
  contextType: SyncAiMemoryRequest['contextType'],
):
  | 'business_decision'
  | 'policy'
  | 'customer_history'
  | 'ai_insight'
  | 'lesson_learned'
  | 'project_history' {
  switch (contextType) {
    case 'business':
      return 'business_decision';
    case 'finance':
      return 'policy';
    case 'executive':
      return 'business_decision';
    case 'workflow':
      return 'lesson_learned';
    case 'job':
      return 'project_history';
    case 'customer':
      return 'customer_history';
    default:
      return 'ai_insight';
  }
}

function mapContextTypeToMemoryCategory(
  contextType: SyncAiMemoryRequest['contextType'],
): 'business_rule' | 'preference' | 'process' | 'note' {
  switch (contextType) {
    case 'business':
      return 'business_rule';
    case 'workflow':
    case 'job':
      return 'process';
    case 'finance':
    case 'executive':
    case 'customer':
    default:
      return 'note';
  }
}
