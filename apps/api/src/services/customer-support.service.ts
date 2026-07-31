import { and, desc, eq, inArray } from 'drizzle-orm';
import { emitBusinessEvent } from '../lib/automation-events.js';
import type {
  CreateCustomerSupportConversationRequest,
  CreateCustomerSupportEscalationRequest,
  CreateCustomerSupportFeedbackRequest,
  CreateCustomerSupportMessageRequest,
  CustomerJobStatusSummary,
  CustomerSupportAuraContext,
  CustomerSupportConversationSummary,
  CustomerSupportEscalationSummary,
  CustomerSupportFeedbackSummary,
  CustomerSupportInsight,
  CustomerSupportMessageSummary,
  CustomerSupportStats,
  UpdateCustomerSupportConversationRequest,
  UpdateCustomerSupportEscalationRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  customerSupportConversations,
  customerSupportEscalations,
  customerSupportFeedback,
  customerSupportMessages,
  customers,
  invoices,
  jobs,
  quotes,
} from '@titan/db';

export class CustomerSupportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CustomerSupportError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
};

export class CustomerSupportService {
  constructor(private readonly db: DatabaseClient) {}

  async getStats(companyId: string): Promise<CustomerSupportStats> {
    const [conversations, escalations, feedbackRows] = await Promise.all([
      this.db.query.customerSupportConversations.findMany({
        where: eq(customerSupportConversations.companyId, companyId),
      }),
      this.db.query.customerSupportEscalations.findMany({
        where: and(
          eq(customerSupportEscalations.companyId, companyId),
          inArray(customerSupportEscalations.status, ['pending', 'assigned', 'in_progress']),
        ),
      }),
      this.db.query.customerSupportFeedback.findMany({
        where: eq(customerSupportFeedback.companyId, companyId),
      }),
    ]);

    const open = conversations.filter((row) =>
      ['open', 'in_progress', 'waiting_customer', 'escalated'].includes(row.status),
    );
    const unresolved = conversations.filter((row) => row.resolutionStatus === 'unresolved');

    const ratings = feedbackRows
      .map((row) => row.rating)
      .filter((rating): rating is number => typeof rating === 'number');

    const sentimentScores = feedbackRows.map((row) =>
      row.sentiment === 'positive' ? 1 : row.sentiment === 'negative' ? -1 : 0,
    );

    const averageSentimentScore =
      sentimentScores.length > 0
        ? Math.round(
            (sentimentScores.reduce((sum, score) => sum + score, 0) / sentimentScores.length) * 100,
          ) / 100
        : ratings.length > 0
          ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) /
            10
          : null;

    return {
      openConversationCount: open.length,
      escalatedConversationCount: conversations.filter((row) => row.status === 'escalated').length,
      pendingEscalationCount: escalations.length,
      unresolvedConversationCount: unresolved.length,
      averageSentimentScore,
      feedbackCount: feedbackRows.length,
    };
  }

  async listConversations(companyId: string): Promise<CustomerSupportConversationSummary[]> {
    const rows = await this.db.query.customerSupportConversations.findMany({
      where: eq(customerSupportConversations.companyId, companyId),
      with: { customer: true, assignedUser: true, messages: true },
      orderBy: [desc(customerSupportConversations.updatedAt)],
      limit: 100,
    });

    return rows.map((row) => toConversationSummary(row));
  }

  async getConversation(
    companyId: string,
    conversationId: string,
  ): Promise<CustomerSupportConversationSummary | null> {
    const row = await this.db.query.customerSupportConversations.findFirst({
      where: and(
        eq(customerSupportConversations.id, conversationId),
        eq(customerSupportConversations.companyId, companyId),
      ),
      with: { customer: true, assignedUser: true, messages: true },
    });

    return row ? toConversationSummary(row) : null;
  }

  async createConversation(
    scope: TenantScope,
    input: CreateCustomerSupportConversationRequest,
  ): Promise<CustomerSupportConversationSummary> {
    await this.ensureCustomerBelongsToCompany(scope.companyId, input.customerId);

    const subject = input.subject.trim();
    if (!subject) {
      throw new CustomerSupportError('VALIDATION_ERROR', 'Conversation subject is required');
    }

    const [created] = await this.db
      .insert(customerSupportConversations)
      .values({
        companyId: scope.companyId,
        customerId: input.customerId,
        portalUserId: input.portalUserId ?? null,
        assignedUserId: input.assignedUserId ?? null,
        channel: input.channel ?? 'portal',
        status: input.status ?? 'open',
        subject,
        outcome: input.outcome?.trim() || null,
        resolutionStatus: input.resolutionStatus ?? 'unresolved',
        metadata: input.metadata ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    if (!created) {
      throw new CustomerSupportError('CREATE_FAILED', 'Unable to create support conversation');
    }

    return (await this.getConversation(scope.companyId, created.id))!;
  }

  async updateConversation(
    companyId: string,
    conversationId: string,
    input: UpdateCustomerSupportConversationRequest,
  ): Promise<CustomerSupportConversationSummary> {
    const existing = await this.getConversation(companyId, conversationId);
    if (!existing) {
      throw new CustomerSupportError('NOT_FOUND', 'Support conversation not found');
    }

    await this.db
      .update(customerSupportConversations)
      .set({
        assignedUserId: input.assignedUserId !== undefined ? input.assignedUserId : undefined,
        status: input.status,
        subject: input.subject?.trim(),
        outcome: input.outcome !== undefined ? input.outcome?.trim() || null : undefined,
        resolutionStatus: input.resolutionStatus,
        metadata: input.metadata,
        resolvedAt:
          input.resolvedAt !== undefined
            ? input.resolvedAt
              ? new Date(input.resolvedAt)
              : null
            : input.status === 'resolved' || input.status === 'closed'
              ? new Date()
              : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customerSupportConversations.id, conversationId),
          eq(customerSupportConversations.companyId, companyId),
        ),
      );

    return (await this.getConversation(companyId, conversationId))!;
  }

  async listMessages(
    companyId: string,
    conversationId: string,
  ): Promise<CustomerSupportMessageSummary[]> {
    await this.ensureConversationBelongsToCompany(companyId, conversationId);

    const rows = await this.db.query.customerSupportMessages.findMany({
      where: and(
        eq(customerSupportMessages.companyId, companyId),
        eq(customerSupportMessages.conversationId, conversationId),
      ),
      with: { author: true },
      orderBy: [customerSupportMessages.occurredAt],
    });

    return rows.map(toMessageSummary);
  }

  async addMessage(
    scope: TenantScope,
    conversationId: string,
    input: CreateCustomerSupportMessageRequest,
  ): Promise<CustomerSupportMessageSummary> {
    await this.ensureConversationBelongsToCompany(scope.companyId, conversationId);

    const content = input.content.trim();
    if (!content) {
      throw new CustomerSupportError('VALIDATION_ERROR', 'Message content is required');
    }

    const [created] = await this.db
      .insert(customerSupportMessages)
      .values({
        companyId: scope.companyId,
        conversationId,
        role: input.role,
        content,
        authorUserId: input.role === 'agent' ? scope.userId : null,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      })
      .returning();

    if (!created) {
      throw new CustomerSupportError('CREATE_FAILED', 'Unable to add support message');
    }

    await this.db
      .update(customerSupportConversations)
      .set({
        updatedAt: new Date(),
        status: input.role === 'customer' ? 'in_progress' : 'waiting_customer',
      })
      .where(eq(customerSupportConversations.id, conversationId));

    const row = await this.db.query.customerSupportMessages.findFirst({
      where: eq(customerSupportMessages.id, created.id),
      with: { author: true },
    });

    return toMessageSummary(row!);
  }

  async listEscalations(companyId: string): Promise<CustomerSupportEscalationSummary[]> {
    const rows = await this.db.query.customerSupportEscalations.findMany({
      where: eq(customerSupportEscalations.companyId, companyId),
      with: { customer: true, assignedUser: true },
      orderBy: [desc(customerSupportEscalations.updatedAt)],
      limit: 100,
    });

    return rows.map(toEscalationSummary);
  }

  async createEscalation(
    scope: TenantScope,
    conversationId: string,
    input: CreateCustomerSupportEscalationRequest,
  ): Promise<CustomerSupportEscalationSummary> {
    const conversation = await this.getConversation(scope.companyId, conversationId);
    if (!conversation) {
      throw new CustomerSupportError('NOT_FOUND', 'Support conversation not found');
    }

    const reason = input.reason.trim();
    if (!reason) {
      throw new CustomerSupportError('VALIDATION_ERROR', 'Escalation reason is required');
    }

    const [created] = await this.db
      .insert(customerSupportEscalations)
      .values({
        companyId: scope.companyId,
        conversationId,
        customerId: conversation.customerId,
        reason,
        priority: input.priority ?? 'medium',
        assignedUserId: input.assignedUserId ?? null,
        context: input.context ?? {},
      })
      .returning();

    if (!created) {
      throw new CustomerSupportError('CREATE_FAILED', 'Unable to create escalation');
    }

    await this.db
      .update(customerSupportConversations)
      .set({ status: 'escalated', resolutionStatus: 'escalated', updatedAt: new Date() })
      .where(eq(customerSupportConversations.id, conversationId));

    emitBusinessEvent({
      companyId: scope.companyId,
      eventType: 'support.escalated',
      entityType: 'support_escalation',
      entityId: created.id,
      payload: { escalation: { id: created.id, conversationId, priority: created.priority } },
      actorUserId: scope.userId,
    });

    const row = await this.db.query.customerSupportEscalations.findFirst({
      where: eq(customerSupportEscalations.id, created.id),
      with: { customer: true, assignedUser: true },
    });

    return toEscalationSummary(row!);
  }

  async updateEscalation(
    companyId: string,
    escalationId: string,
    input: UpdateCustomerSupportEscalationRequest,
  ): Promise<CustomerSupportEscalationSummary> {
    const existing = await this.db.query.customerSupportEscalations.findFirst({
      where: and(
        eq(customerSupportEscalations.id, escalationId),
        eq(customerSupportEscalations.companyId, companyId),
      ),
    });

    if (!existing) {
      throw new CustomerSupportError('NOT_FOUND', 'Escalation not found');
    }

    await this.db
      .update(customerSupportEscalations)
      .set({
        status: input.status,
        priority: input.priority,
        assignedUserId: input.assignedUserId !== undefined ? input.assignedUserId : undefined,
        resolution: input.resolution !== undefined ? input.resolution?.trim() || null : undefined,
        context: input.context,
        resolvedAt:
          input.resolvedAt !== undefined
            ? input.resolvedAt
              ? new Date(input.resolvedAt)
              : null
            : input.status === 'resolved'
              ? new Date()
              : undefined,
        updatedAt: new Date(),
      })
      .where(eq(customerSupportEscalations.id, escalationId));

    const row = await this.db.query.customerSupportEscalations.findFirst({
      where: eq(customerSupportEscalations.id, escalationId),
      with: { customer: true, assignedUser: true },
    });

    return toEscalationSummary(row!);
  }

  async listFeedback(companyId: string): Promise<CustomerSupportFeedbackSummary[]> {
    const rows = await this.db.query.customerSupportFeedback.findMany({
      where: eq(customerSupportFeedback.companyId, companyId),
      with: { customer: true },
      orderBy: [desc(customerSupportFeedback.createdAt)],
      limit: 100,
    });

    return rows.map(toFeedbackSummary);
  }

  async createFeedback(
    scope: TenantScope,
    conversationId: string,
    input: CreateCustomerSupportFeedbackRequest,
  ): Promise<CustomerSupportFeedbackSummary> {
    const conversation = await this.getConversation(scope.companyId, conversationId);
    if (!conversation) {
      throw new CustomerSupportError('NOT_FOUND', 'Support conversation not found');
    }

    const [created] = await this.db
      .insert(customerSupportFeedback)
      .values({
        companyId: scope.companyId,
        conversationId,
        customerId: conversation.customerId,
        sentiment: input.sentiment ?? 'neutral',
        rating: input.rating ?? null,
        comment: input.comment?.trim() || null,
        context: input.context ?? {},
      })
      .returning();

    if (!created) {
      throw new CustomerSupportError('CREATE_FAILED', 'Unable to create feedback');
    }

    const row = await this.db.query.customerSupportFeedback.findFirst({
      where: eq(customerSupportFeedback.id, created.id),
      with: { customer: true },
    });

    return toFeedbackSummary(row!);
  }

  async getCustomerJobStatus(
    companyId: string,
    customerId: string,
  ): Promise<CustomerJobStatusSummary> {
    await this.ensureCustomerBelongsToCompany(companyId, customerId);

    const [customer, jobRows, invoiceRows, quoteRows] = await Promise.all([
      this.db.query.customers.findFirst({
        where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
      }),
      this.db.query.jobs.findMany({
        where: and(eq(jobs.companyId, companyId), eq(jobs.customerId, customerId)),
        orderBy: [desc(jobs.updatedAt)],
        limit: 10,
      }),
      this.db.query.invoices.findMany({
        where: and(eq(invoices.companyId, companyId), eq(invoices.customerId, customerId)),
      }),
      this.db.query.quotes.findMany({
        where: and(eq(quotes.companyId, companyId), eq(quotes.customerId, customerId)),
      }),
    ]);

    if (!customer) {
      throw new CustomerSupportError('NOT_FOUND', 'Customer not found');
    }

    const openInvoices = invoiceRows.filter((row) =>
      ['draft', 'sent', 'overdue'].includes(row.status),
    );
    const openQuotes = quoteRows.filter((row) => ['draft', 'sent'].includes(row.status));

    const activeJobs = jobRows.filter((row) => !['completed', 'cancelled'].includes(row.status));

    return {
      customerId,
      customerName: customer.name,
      jobs: jobRows.map((job) => ({
        id: job.id,
        title: job.title,
        status: job.status,
        scheduledAt: job.scheduledAt?.toISOString() ?? null,
        completedAt: job.status === 'completed' ? job.updatedAt.toISOString() : null,
      })),
      openInvoiceCount: openInvoices.length,
      openQuoteCount: openQuotes.length,
      summary: `${customer.name} has ${activeJobs.length} active job(s), ${openInvoices.length} open invoice(s), and ${openQuotes.length} open quote(s).`,
    };
  }

  async getAttentionInsights(companyId: string): Promise<CustomerSupportInsight[]> {
    const [openConversations, pendingEscalations, negativeFeedback] = await Promise.all([
      this.db.query.customerSupportConversations.findMany({
        where: and(
          eq(customerSupportConversations.companyId, companyId),
          inArray(customerSupportConversations.status, ['open', 'in_progress', 'escalated']),
        ),
        with: { customer: true },
        orderBy: [desc(customerSupportConversations.updatedAt)],
        limit: 30,
      }),
      this.db.query.customerSupportEscalations.findMany({
        where: and(
          eq(customerSupportEscalations.companyId, companyId),
          inArray(customerSupportEscalations.status, ['pending', 'assigned', 'in_progress']),
        ),
        with: { customer: true },
        limit: 20,
      }),
      this.db.query.customerSupportFeedback.findMany({
        where: and(
          eq(customerSupportFeedback.companyId, companyId),
          eq(customerSupportFeedback.sentiment, 'negative'),
        ),
        with: { customer: true },
        orderBy: [desc(customerSupportFeedback.createdAt)],
        limit: 10,
      }),
    ]);

    const insights: CustomerSupportInsight[] = [];

    if (pendingEscalations.length > 0) {
      insights.push({
        insightType: 'pending_escalations',
        title: 'Unresolved escalations need attention',
        description: `${pendingEscalations.length} support escalation(s) are pending or in progress.`,
        priority: 'high',
        context: { escalationIds: pendingEscalations.map((row) => row.id) },
      });
    }

    const waiting = openConversations.filter((row) => ['open', 'in_progress'].includes(row.status));
    if (waiting.length > 0) {
      insights.push({
        insightType: 'open_conversations',
        title: 'Customers waiting for support',
        description: `${waiting.length} open support conversation(s) may need a response.`,
        priority: 'high',
        context: { conversationIds: waiting.map((row) => row.id) },
      });
    }

    if (negativeFeedback.length > 0) {
      insights.push({
        insightType: 'negative_sentiment',
        title: 'Negative customer sentiment detected',
        description: `${negativeFeedback.length} recent feedback record(s) indicate negative sentiment.`,
        priority: 'medium',
        context: { feedbackIds: negativeFeedback.map((row) => row.id) },
      });
    }

    const escalated = openConversations.filter((row) => row.status === 'escalated');
    if (escalated.length > 0) {
      insights.push({
        insightType: 'escalated_conversations',
        title: 'Escalated conversations require human handling',
        description: `${escalated.length} conversation(s) have been escalated from AI support.`,
        priority: 'high',
        context: { conversationIds: escalated.map((row) => row.id) },
      });
    }

    return insights.slice(0, 12);
  }

  async buildAuraContext(companyId: string): Promise<CustomerSupportAuraContext> {
    const [stats, conversations, insights] = await Promise.all([
      this.getStats(companyId),
      this.listConversations(companyId),
      this.getAttentionInsights(companyId),
    ]);

    return {
      openConversationCount: stats.openConversationCount,
      pendingEscalationCount: stats.pendingEscalationCount,
      unresolvedConversationCount: stats.unresolvedConversationCount,
      recentConversations: conversations.slice(0, 8).map((row) => ({
        id: row.id,
        customerName: row.customerName,
        subject: row.subject,
        status: row.status,
        channel: row.channel,
      })),
      attentionInsights: insights,
      summary: `${stats.openConversationCount} open conversation(s), ${stats.pendingEscalationCount} pending escalation(s), ${stats.unresolvedConversationCount} unresolved.`,
    };
  }

  private async ensureConversationBelongsToCompany(
    companyId: string,
    conversationId: string,
  ): Promise<void> {
    const conversation = await this.getConversation(companyId, conversationId);
    if (!conversation) {
      throw new CustomerSupportError('NOT_FOUND', 'Support conversation not found');
    }
  }

  private async ensureCustomerBelongsToCompany(
    companyId: string,
    customerId: string,
  ): Promise<void> {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });

    if (!customer) {
      throw new CustomerSupportError('NOT_FOUND', 'Customer not found');
    }
  }
}

function toConversationSummary(
  row: typeof customerSupportConversations.$inferSelect & {
    customer?: { name: string } | null;
    assignedUser?: { firstName: string; lastName: string } | null;
    messages?: (typeof customerSupportMessages.$inferSelect)[];
  },
): CustomerSupportConversationSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    portalUserId: row.portalUserId,
    assignedUserId: row.assignedUserId,
    assignedUserName: row.assignedUser
      ? `${row.assignedUser.firstName} ${row.assignedUser.lastName}`.trim()
      : null,
    channel: row.channel,
    status: row.status,
    subject: row.subject,
    outcome: row.outcome,
    resolutionStatus: row.resolutionStatus,
    messageCount: row.messages?.length ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

function toMessageSummary(
  row: typeof customerSupportMessages.$inferSelect & {
    author?: { firstName: string; lastName: string } | null;
  },
): CustomerSupportMessageSummary {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    authorUserId: row.authorUserId,
    authorName: row.author ? `${row.author.firstName} ${row.author.lastName}`.trim() : null,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toEscalationSummary(
  row: typeof customerSupportEscalations.$inferSelect & {
    customer?: { name: string } | null;
    assignedUser?: { firstName: string; lastName: string } | null;
  },
): CustomerSupportEscalationSummary {
  return {
    id: row.id,
    conversationId: row.conversationId,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    reason: row.reason,
    priority: row.priority,
    status: row.status,
    assignedUserId: row.assignedUserId,
    assignedUserName: row.assignedUser
      ? `${row.assignedUser.firstName} ${row.assignedUser.lastName}`.trim()
      : null,
    resolution: row.resolution,
    context: row.context,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

function toFeedbackSummary(
  row: typeof customerSupportFeedback.$inferSelect & {
    customer?: { name: string } | null;
  },
): CustomerSupportFeedbackSummary {
  return {
    id: row.id,
    conversationId: row.conversationId,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    sentiment: row.sentiment,
    rating: row.rating,
    comment: row.comment,
    context: row.context,
    createdAt: row.createdAt.toISOString(),
  };
}
