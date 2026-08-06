import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  customers,
  integrationConnections,
  securityAuditLogs,
  xeroCustomerMappings,
} from '@titan/db';
import type {
  XeroCustomerMappingCandidate,
  XeroCustomerMappingReport,
  XeroContactLookup,
} from '@titan/shared';
import {
  classifyCustomerMapping,
  normalizeDisplayName,
  normalizeContactEmail,
  normalizeContactPhone,
  summarizeCustomerMappingReport,
} from '@titan/shared';

export class XeroCustomerMappingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'XeroCustomerMappingError';
  }
}

export class XeroCustomerMappingService {
  constructor(private readonly db: DatabaseClient) {}

  static create(db: DatabaseClient): XeroCustomerMappingService {
    return new XeroCustomerMappingService(db);
  }

  async buildMappingReport(companyId: string): Promise<XeroCustomerMappingReport> {
    const connection = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, companyId),
        eq(integrationConnections.provider, 'xero'),
      ),
    });

    if (!connection) {
      throw new XeroCustomerMappingError('NOT_CONNECTED', 'Xero is not connected for this company.');
    }

    const [customerRows, mappingRows] = await Promise.all([
      this.db.query.customers.findMany({
        where: eq(customers.companyId, companyId),
        columns: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      }),
      this.db.query.xeroCustomerMappings.findMany({
        where: eq(xeroCustomerMappings.companyId, companyId),
      }),
    ]);

    const mappingByCustomerId = new Map(mappingRows.map((m) => [m.customerId, m]));

    const xeroContactDirectory = this.buildXeroContactDirectory(customerRows, mappingRows);

    const items: XeroCustomerMappingCandidate[] = customerRows.map((customer) => {
      const mapping = mappingByCustomerId.get(customer.id);
      const email = customer.email ?? null;
      const phone = customer.phone ?? null;
      const normEmail = normalizeContactEmail(email);
      const normPhone = normalizeContactPhone(phone);
      const normName = normalizeDisplayName(customer.name);

      const emailMatches = normEmail
        ? xeroContactDirectory.filter((c) => normalizeContactEmail(c.email) === normEmail)
        : [];
      const phoneMatches = normPhone
        ? xeroContactDirectory.filter((c) => normalizeContactPhone(c.phone) === normPhone)
        : [];
      const exactNameMatches = normName
        ? xeroContactDirectory.filter((c) => normalizeDisplayName(c.name) === normName)
        : [];

      return classifyCustomerMapping({
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: email,
        customerPhone: phone,
        existingXeroContactId: mapping?.xeroContactId ?? null,
        emailMatches,
        phoneMatches,
        exactNameMatches,
      });
    });

    return {
      ...summarizeCustomerMappingReport(items),
      items,
    };
  }

  async listReviewQueue(companyId: string): Promise<XeroCustomerMappingCandidate[]> {
    const report = await this.buildMappingReport(companyId);
    return report.items.filter((item) => item.reviewRequired);
  }

  async applyDeterministicMappings(input: {
    companyId: string;
    userId: string;
    dryRun: boolean;
  }): Promise<{
    dryRun: boolean;
    appliedCount: number;
    skippedCount: number;
    beforeUnmapped: number;
    afterUnmapped: number;
    items: XeroCustomerMappingCandidate[];
  }> {
    const connection = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, input.companyId),
        eq(integrationConnections.provider, 'xero'),
      ),
    });

    if (!connection) {
      throw new XeroCustomerMappingError('NOT_CONNECTED', 'Xero is not connected.');
    }

    const beforeReport = await this.buildMappingReport(input.companyId);
    const beforeUnmapped = beforeReport.unmappedCustomers;

    const candidates = beforeReport.items.filter(
      (item) => item.classification === 'safe_deterministic_match' && item.xeroContactId,
    );

    if (!input.dryRun) {
      for (const candidate of candidates) {
        const existing = await this.db.query.xeroCustomerMappings.findFirst({
          where: and(
            eq(xeroCustomerMappings.companyId, input.companyId),
            eq(xeroCustomerMappings.customerId, candidate.customerId),
          ),
        });

        if (existing?.xeroContactId) {
          continue;
        }

        if (existing) {
          await this.db
            .update(xeroCustomerMappings)
            .set({
              xeroContactId: candidate.xeroContactId,
              syncStatus: 'synced',
              lastSyncedAt: new Date(),
              lastSuccessfulSyncAt: new Date(),
              conflictMetadata: {
                mappingDecision: 'safe_deterministic_match',
                matchReason: candidate.matchReason,
                appliedAt: new Date().toISOString(),
                appliedByUserId: input.userId,
              },
              updatedAt: new Date(),
            })
            .where(eq(xeroCustomerMappings.id, existing.id));
        } else {
          await this.db.insert(xeroCustomerMappings).values({
            companyId: input.companyId,
            integrationConnectionId: connection.id,
            customerId: candidate.customerId,
            xeroContactId: candidate.xeroContactId!,
            syncStatus: 'synced',
            lastSyncedAt: new Date(),
            lastSuccessfulSyncAt: new Date(),
            conflictMetadata: {
              mappingDecision: 'safe_deterministic_match',
              matchReason: candidate.matchReason,
              appliedAt: new Date().toISOString(),
              appliedByUserId: input.userId,
            },
          });
        }

        await this.db.insert(securityAuditLogs).values({
          companyId: input.companyId,
          userId: input.userId,
          category: 'integrations',
          action: 'xero_customer_mapping_applied',
          entityType: 'xero_customer_mapping',
          entityId: candidate.customerId,
          metadata: {
            xeroContactId: candidate.xeroContactId,
            matchReason: candidate.matchReason,
          },
        });
      }
    }

    const afterReport = input.dryRun
      ? beforeReport
      : await this.buildMappingReport(input.companyId);

    return {
      dryRun: input.dryRun,
      appliedCount: input.dryRun ? 0 : candidates.length,
      skippedCount: beforeReport.items.length - candidates.length,
      beforeUnmapped,
      afterUnmapped: input.dryRun ? beforeUnmapped - candidates.length : afterReport.unmappedCustomers,
      items: candidates,
    };
  }

  async countUnmappedCustomers(companyId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .leftJoin(
        xeroCustomerMappings,
        and(
          eq(xeroCustomerMappings.customerId, customers.id),
          eq(xeroCustomerMappings.companyId, companyId),
        ),
      )
      .where(
        and(
          eq(customers.companyId, companyId),
          or(isNull(xeroCustomerMappings.id), isNull(xeroCustomerMappings.xeroContactId)),
        ),
      );

    return result[0]?.count ?? 0;
  }

  private buildXeroContactDirectory(
    customerRows: Array<{ id: string; name: string; email: string | null; phone: string | null }>,
    mappingRows: Array<{ customerId: string; xeroContactId: string | null }>,
  ): XeroContactLookup[] {
    const customerById = new Map(customerRows.map((c) => [c.id, c]));
    const directory: XeroContactLookup[] = [];

    for (const mapping of mappingRows) {
      if (!mapping.xeroContactId) continue;
      const customer = customerById.get(mapping.customerId);
      if (!customer) continue;
      directory.push({
        xeroContactId: mapping.xeroContactId,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        isArchived: false,
      });
    }

    return directory;
  }
}
