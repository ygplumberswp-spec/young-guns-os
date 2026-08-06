import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { isCompanyOwnerRole } from '@titan/auth';
import type { DatabaseClient } from '@titan/db';
import {
  communications,
  customerActivities,
  customerDuplicateCandidates,
  customers,
  cxCustomerProperties,
  documents,
  invoices,
  jobs,
  leads,
  payments,
  portalCustomerRequests,
  portalSessions,
  portalUserInvites,
  portalUsers,
  quotes,
  securityAuditLogs,
  xeroCustomerMappings,
} from '@titan/db';
import {
  emptyCustomerMergeLinkCounts,
  isCustomerDuplicateCandidate,
  normalizeCustomerEmailKey,
  normalizeCustomerNameKey,
  normalizeCustomerPhoneKey,
  orderCustomerPairIds,
  scoreCustomerDuplicateEvidence,
  type CustomerDuplicateCandidateSummary,
  type CustomerDuplicateMatchEvidence,
  type CustomerMergeConflict,
  type CustomerMergeFieldKey,
  type CustomerMergeFieldSelection,
  type CustomerMergeLinkCounts,
  type CustomerMergePreview,
  type CustomerMergeRequest,
  type CustomerMergeResult,
  type CustomerMergeSideSnapshot,
} from '@titan/shared';

export class CustomerDuplicateMergeError extends Error {
  constructor(
    public readonly code:
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'VALIDATION'
      | 'CONFLICT'
      | 'INVALID_STATE',
    message: string,
  ) {
    super(message);
    this.name = 'CustomerDuplicateMergeError';
  }
}

export type DuplicateMergeActor = {
  userId: string;
  companyId: string;
  roleName: string;
  permissions: string[];
};

type Tx = Parameters<Parameters<DatabaseClient['transaction']>[0]>[0];
type CustomerRow = typeof customers.$inferSelect;

/** Operational tables that store a direct customer_id FK and must be repointed. */
const REPOINT_TABLES = [
  'jobs',
  'quotes',
  'invoices',
  'documents',
  'communications',
  'customer_activities',
  'leads',
  'cx_customer_properties',
  'cx_customer_documents',
  'cx_appointment_bookings',
  'cx_reviews_feedback',
  'cx_engagement_preferences',
  'portal_sessions',
  'portal_user_invites',
  'portal_customer_requests',
  'job_document_packs',
  'boq_documents',
  'company_day_plan_follow_ups',
  'customer_marketing_consents',
  'customer_marketing_consent_audits',
  'customer_contact_fields',
  'customer_contact_corrections',
  'customer_contact_sources',
  'marketing_reactivation_eligibility',
  'whatsapp_messages',
  'whatsapp_match_reviews',
  'sales_opportunities',
  'sales_activities',
  'customer_support_conversations',
  'customer_support_escalations',
  'customer_support_feedback',
  'customer_support_messages',
  'xero_contact_sync_back_requests',
] as const;

function canReview(actor: DuplicateMergeActor): boolean {
  return (
    actor.permissions.includes('*') ||
    actor.permissions.includes('customers:read') ||
    actor.permissions.includes('customers:write') ||
    isCompanyOwnerRole({ roleName: actor.roleName, permissions: actor.permissions })
  );
}

function assertCanReview(actor: DuplicateMergeActor): void {
  if (!canReview(actor)) {
    throw new CustomerDuplicateMergeError(
      'FORBIDDEN',
      'You do not have permission to review customer duplicates',
    );
  }
}

function assertOwner(actor: DuplicateMergeActor): void {
  if (!isCompanyOwnerRole({ roleName: actor.roleName, permissions: actor.permissions })) {
    throw new CustomerDuplicateMergeError(
      'FORBIDDEN',
      'Only Company Owner may dismiss or execute customer merges',
    );
  }
}

function buildEvidence(
  left: CustomerRow,
  right: CustomerRow,
  leftAddressKeys: Set<string>,
  rightAddressKeys: Set<string>,
  leftXeroIds: string[],
  rightXeroIds: string[],
): CustomerDuplicateMatchEvidence[] {
  const evidence: CustomerDuplicateMatchEvidence[] = [];

  const leftPhone = normalizeCustomerPhoneKey(left.phone);
  const rightPhone = normalizeCustomerPhoneKey(right.phone);
  if (leftPhone && rightPhone && leftPhone === rightPhone) {
    evidence.push({
      reason: 'phone',
      detail: `Matching phone ${leftPhone}`,
      weight: 40,
    });
  }

  const leftEmail = normalizeCustomerEmailKey(left.email);
  const rightEmail = normalizeCustomerEmailKey(right.email);
  if (leftEmail && rightEmail && leftEmail === rightEmail) {
    evidence.push({
      reason: 'email',
      detail: `Matching email ${leftEmail}`,
      weight: 35,
    });
  }

  const leftName = normalizeCustomerNameKey(left.name);
  const rightName = normalizeCustomerNameKey(right.name);
  if (leftName && rightName && leftName === rightName) {
    evidence.push({
      reason: 'normalized_name',
      detail: `Matching normalized name “${leftName}”`,
      weight: 20,
    });
  }

  for (const key of leftAddressKeys) {
    if (rightAddressKeys.has(key)) {
      evidence.push({
        reason: 'address_overlap',
        detail: `Overlapping property/address “${key}”`,
        weight: 25,
      });
      break;
    }
  }

  const sharedXero = leftXeroIds.filter((id) => rightXeroIds.includes(id));
  if (sharedXero.length > 0) {
    evidence.push({
      reason: 'xero_mapping',
      detail: `Shared Xero contact mapping (${sharedXero[0]})`,
      weight: 50,
    });
  }

  return evidence;
}

export class CustomerDuplicateMergeService {
  constructor(private readonly db: DatabaseClient) {}

  async scanAndUpsertCandidates(actor: DuplicateMergeActor): Promise<CustomerDuplicateCandidateSummary[]> {
    assertCanReview(actor);
    const companyId = actor.companyId;

    const rows = await this.db.query.customers.findMany({
      where: and(eq(customers.companyId, companyId), isNull(customers.mergedIntoCustomerId)),
      limit: 2000,
    });

    const properties = await this.db.query.cxCustomerProperties.findMany({
      where: eq(cxCustomerProperties.companyId, companyId),
      limit: 5000,
    });

    const mappings = await this.db.query.xeroCustomerMappings.findMany({
      where: eq(xeroCustomerMappings.companyId, companyId),
      limit: 5000,
    });

    const addressByCustomer = new Map<string, Set<string>>();
    for (const property of properties) {
      const key = [
        property.addressLine1?.trim().toLowerCase() || '',
        property.suburb?.trim().toLowerCase() || '',
        property.postalCode?.trim().toLowerCase() || '',
      ]
        .filter(Boolean)
        .join('|');
      if (!key) continue;
      const set = addressByCustomer.get(property.customerId) ?? new Set<string>();
      set.add(key);
      addressByCustomer.set(property.customerId, set);
    }

    const xeroByCustomer = new Map<string, string[]>();
    for (const mapping of mappings) {
      if (!mapping.xeroContactId) continue;
      const list = xeroByCustomer.get(mapping.customerId) ?? [];
      list.push(mapping.xeroContactId);
      xeroByCustomer.set(mapping.customerId, list);
    }

    const pendingPairs: Array<{
      leftId: string;
      rightId: string;
      confidence: number;
      evidence: CustomerDuplicateMatchEvidence[];
    }> = [];

    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const left = rows[i]!;
        const right = rows[j]!;
        const evidence = buildEvidence(
          left,
          right,
          addressByCustomer.get(left.id) ?? new Set(),
          addressByCustomer.get(right.id) ?? new Set(),
          xeroByCustomer.get(left.id) ?? [],
          xeroByCustomer.get(right.id) ?? [],
        );
        if (!isCustomerDuplicateCandidate(evidence)) continue;
        const [leftId, rightId] = orderCustomerPairIds(left.id, right.id);
        pendingPairs.push({
          leftId,
          rightId,
          confidence: scoreCustomerDuplicateEvidence(evidence),
          evidence,
        });
      }
    }

    for (const pair of pendingPairs) {
      const existing = await this.db.query.customerDuplicateCandidates.findFirst({
        where: and(
          eq(customerDuplicateCandidates.companyId, companyId),
          eq(customerDuplicateCandidates.leftCustomerId, pair.leftId),
          eq(customerDuplicateCandidates.rightCustomerId, pair.rightId),
        ),
      });

      if (existing?.status === 'dismissed' || existing?.status === 'merged') {
        continue;
      }

      if (existing) {
        await this.db
          .update(customerDuplicateCandidates)
          .set({
            confidence: pair.confidence,
            matchReasons: pair.evidence,
            updatedAt: new Date(),
          })
          .where(eq(customerDuplicateCandidates.id, existing.id));
      } else {
        await this.db.insert(customerDuplicateCandidates).values({
          companyId,
          leftCustomerId: pair.leftId,
          rightCustomerId: pair.rightId,
          confidence: pair.confidence,
          matchReasons: pair.evidence,
          status: 'pending',
        });
      }
    }

    return this.listCandidates(actor);
  }

  async listCandidates(actor: DuplicateMergeActor): Promise<CustomerDuplicateCandidateSummary[]> {
    assertCanReview(actor);
    const rows = await this.db.query.customerDuplicateCandidates.findMany({
      where: and(
        eq(customerDuplicateCandidates.companyId, actor.companyId),
        eq(customerDuplicateCandidates.status, 'pending'),
      ),
      orderBy: (table, { desc }) => [desc(table.confidence), desc(table.updatedAt)],
      limit: 200,
    });

    const customerIds = Array.from(
      new Set(rows.flatMap((row) => [row.leftCustomerId, row.rightCustomerId])),
    );
    const customerRows =
      customerIds.length === 0
        ? []
        : await this.db.query.customers.findMany({
            where: and(
              eq(customers.companyId, actor.companyId),
              inArray(customers.id, customerIds),
            ),
          });
    const byId = new Map(customerRows.map((row) => [row.id, row]));

    return rows
      .map((row) => {
        const left = byId.get(row.leftCustomerId);
        const right = byId.get(row.rightCustomerId);
        if (!left || !right || left.mergedIntoCustomerId || right.mergedIntoCustomerId) {
          return null;
        }
        return {
          id: row.id,
          leftCustomerId: row.leftCustomerId,
          rightCustomerId: row.rightCustomerId,
          leftName: left.name,
          rightName: right.name,
          leftCreatedAt: left.createdAt.toISOString(),
          rightCreatedAt: right.createdAt.toISOString(),
          confidence: row.confidence,
          matchReasons: (row.matchReasons ?? []) as CustomerDuplicateMatchEvidence[],
          status: row.status,
          survivorCustomerId: row.survivorCustomerId,
          updatedAt: row.updatedAt.toISOString(),
        } satisfies CustomerDuplicateCandidateSummary;
      })
      .filter((row): row is CustomerDuplicateCandidateSummary => row != null);
  }

  async previewMerge(
    actor: DuplicateMergeActor,
    leftCustomerId: string,
    rightCustomerId: string,
    candidateId?: string | null,
  ): Promise<CustomerMergePreview> {
    assertCanReview(actor);
    const [leftId, rightId] = orderCustomerPairIds(leftCustomerId, rightCustomerId);
    const left = await this.loadSide(actor.companyId, leftId);
    const right = await this.loadSide(actor.companyId, rightId);
    const olderCustomerId =
      new Date(left.createdAt).getTime() <= new Date(right.createdAt).getTime()
        ? left.id
        : right.id;
    const newerCustomerId = olderCustomerId === left.id ? right.id : left.id;

    const leftRow = await this.requireCustomer(actor.companyId, leftId);
    const rightRow = await this.requireCustomer(actor.companyId, rightId);
    const leftProps = await this.db.query.cxCustomerProperties.findMany({
      where: and(
        eq(cxCustomerProperties.companyId, actor.companyId),
        eq(cxCustomerProperties.customerId, leftId),
      ),
    });
    const rightProps = await this.db.query.cxCustomerProperties.findMany({
      where: and(
        eq(cxCustomerProperties.companyId, actor.companyId),
        eq(cxCustomerProperties.customerId, rightId),
      ),
    });
    const toKeys = (props: typeof leftProps) =>
      new Set(
        props
          .map((property) =>
            [
              property.addressLine1?.trim().toLowerCase() || '',
              property.suburb?.trim().toLowerCase() || '',
              property.postalCode?.trim().toLowerCase() || '',
            ]
              .filter(Boolean)
              .join('|'),
          )
          .filter(Boolean),
      );
    const evidence = buildEvidence(
      leftRow,
      rightRow,
      toKeys(leftProps),
      toKeys(rightProps),
      left.xeroContactIds,
      right.xeroContactIds,
    );

    return {
      left,
      right,
      olderCustomerId,
      newerCustomerId,
      confidence: scoreCustomerDuplicateEvidence(evidence),
      matchReasons: evidence,
      conflicts: this.buildConflicts(left, right),
      candidateId: candidateId ?? null,
    };
  }

  async decide(
    actor: DuplicateMergeActor,
    input: CustomerMergeRequest,
  ): Promise<CustomerMergeResult> {
    assertOwner(actor);

    if (input.leftCustomerId === input.rightCustomerId) {
      throw new CustomerDuplicateMergeError('VALIDATION', 'Cannot merge a customer with itself');
    }

    if (input.decision === 'dismiss_not_duplicate') {
      return this.dismiss(actor, input);
    }

    const preview = await this.previewMerge(
      actor,
      input.leftCustomerId,
      input.rightCustomerId,
      input.candidateId,
    );

    if (preview.conflicts.length > 0 && !input.confirmConflicts) {
      throw new CustomerDuplicateMergeError(
        'CONFLICT',
        'Owner confirmation is required for merge conflicts',
      );
    }

    const survivorId =
      input.decision === 'keep_left'
        ? input.leftCustomerId
        : input.decision === 'keep_right'
          ? input.rightCustomerId
          : this.resolveSelectiveSurvivor(input);
    const sourceId =
      survivorId === input.leftCustomerId ? input.rightCustomerId : input.leftCustomerId;

    const distinctXero = Array.from(
      new Set([...preview.left.xeroContactIds, ...preview.right.xeroContactIds]),
    );
    if (
      preview.left.xeroContactIds.length > 0 &&
      preview.right.xeroContactIds.length > 0 &&
      preview.left.xeroContactIds.some((id) => !preview.right.xeroContactIds.includes(id))
    ) {
      if (!input.keepXeroContactId || !distinctXero.includes(input.keepXeroContactId)) {
        throw new CustomerDuplicateMergeError(
          'CONFLICT',
          'Choose which Xero contact mapping to keep before merging',
        );
      }
    }

    const moved = await this.db.transaction(async (tx) => {
      const counts = await this.repointLinkedRecords(tx, actor.companyId, sourceId, survivorId);

      await this.mergeCustomerFields(
        tx,
        actor.companyId,
        survivorId,
        sourceId,
        input.decision,
        input.fieldSelection,
        preview,
      );

      await this.mergeXeroMappings(
        tx,
        actor.companyId,
        survivorId,
        sourceId,
        input.keepXeroContactId ?? null,
      );

      await this.mergePortalUsers(tx, actor.companyId, survivorId, sourceId);

      const sourceNotes = (
        await tx.query.customers.findFirst({
          where: and(eq(customers.id, sourceId), eq(customers.companyId, actor.companyId)),
        })
      )?.notes;

      await tx
        .update(customers)
        .set({
          status: 'inactive',
          mergedIntoCustomerId: survivorId,
          notes: [
            sourceNotes?.trim() || '',
            `[Merged into customer ${survivorId} by Owner ${actor.userId} at ${new Date().toISOString()}]`,
          ]
            .filter(Boolean)
            .join('\n'),
          updatedAt: new Date(),
        })
        .where(and(eq(customers.id, sourceId), eq(customers.companyId, actor.companyId)));

      const [leftId, rightId] = orderCustomerPairIds(input.leftCustomerId, input.rightCustomerId);
      const candidate =
        input.candidateId
          ? await tx.query.customerDuplicateCandidates.findFirst({
              where: and(
                eq(customerDuplicateCandidates.id, input.candidateId),
                eq(customerDuplicateCandidates.companyId, actor.companyId),
              ),
            })
          : await tx.query.customerDuplicateCandidates.findFirst({
              where: and(
                eq(customerDuplicateCandidates.companyId, actor.companyId),
                eq(customerDuplicateCandidates.leftCustomerId, leftId),
                eq(customerDuplicateCandidates.rightCustomerId, rightId),
              ),
            });

      if (candidate) {
        await tx
          .update(customerDuplicateCandidates)
          .set({
            status: 'merged',
            survivorCustomerId: survivorId,
            decidedByUserId: actor.userId,
            decisionNotes: input.notes ?? null,
            updatedAt: new Date(),
          })
          .where(eq(customerDuplicateCandidates.id, candidate.id));
      }

      await tx.insert(securityAuditLogs).values({
        companyId: actor.companyId,
        userId: actor.userId,
        category: 'crm',
        action: 'customer_merged',
        entityType: 'customer',
        entityId: survivorId,
        metadata: {
          decision: input.decision,
          survivorCustomerId: survivorId,
          mergedCustomerId: sourceId,
          confirmConflicts: Boolean(input.confirmConflicts),
          keepXeroContactId: input.keepXeroContactId ?? null,
          fieldSelection: input.fieldSelection ?? null,
          moved: counts,
          conflicts: preview.conflicts.map((item) => item.code),
          notes: input.notes ?? null,
        },
      });

      return { counts, candidateId: candidate?.id ?? null };
    });

    return {
      decision: input.decision,
      survivorCustomerId: survivorId,
      mergedCustomerId: sourceId,
      moved: moved.counts,
      candidateId: moved.candidateId,
    };
  }

  private async dismiss(
    actor: DuplicateMergeActor,
    input: CustomerMergeRequest,
  ): Promise<CustomerMergeResult> {
    const [leftId, rightId] = orderCustomerPairIds(input.leftCustomerId, input.rightCustomerId);
    await this.requireCustomer(actor.companyId, leftId);
    await this.requireCustomer(actor.companyId, rightId);

    const existing = input.candidateId
      ? await this.db.query.customerDuplicateCandidates.findFirst({
          where: and(
            eq(customerDuplicateCandidates.id, input.candidateId),
            eq(customerDuplicateCandidates.companyId, actor.companyId),
          ),
        })
      : await this.db.query.customerDuplicateCandidates.findFirst({
          where: and(
            eq(customerDuplicateCandidates.companyId, actor.companyId),
            eq(customerDuplicateCandidates.leftCustomerId, leftId),
            eq(customerDuplicateCandidates.rightCustomerId, rightId),
          ),
        });

    let candidateId = existing?.id ?? null;
    if (existing) {
      await this.db
        .update(customerDuplicateCandidates)
        .set({
          status: 'dismissed',
          decidedByUserId: actor.userId,
          decisionNotes: input.notes ?? 'Dismissed as not duplicate',
          updatedAt: new Date(),
        })
        .where(eq(customerDuplicateCandidates.id, existing.id));
    } else {
      const inserted = await this.db
        .insert(customerDuplicateCandidates)
        .values({
          companyId: actor.companyId,
          leftCustomerId: leftId,
          rightCustomerId: rightId,
          confidence: 0,
          matchReasons: [],
          status: 'dismissed',
          decidedByUserId: actor.userId,
          decisionNotes: input.notes ?? 'Dismissed as not duplicate',
        })
        .returning({ id: customerDuplicateCandidates.id });
      candidateId = inserted[0]?.id ?? null;
    }

    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      userId: actor.userId,
      category: 'crm',
      action: 'customer_duplicate_dismissed',
      entityType: 'customer',
      entityId: leftId,
      metadata: {
        leftCustomerId: leftId,
        rightCustomerId: rightId,
        candidateId,
        notes: input.notes ?? null,
      },
    });

    return {
      decision: 'dismiss_not_duplicate',
      survivorCustomerId: null,
      mergedCustomerId: null,
      moved: emptyCustomerMergeLinkCounts(),
      candidateId,
    };
  }

  private resolveSelectiveSurvivor(input: CustomerMergeRequest): string {
    if (!input.fieldSelection || Object.keys(input.fieldSelection).length === 0) {
      throw new CustomerDuplicateMergeError(
        'VALIDATION',
        'Selective merge requires fieldSelection and a survivor (use keep_left/keep_right or provide fields)',
      );
    }
    const survivorId = input.survivorCustomerId ?? input.leftCustomerId;
    if (survivorId !== input.leftCustomerId && survivorId !== input.rightCustomerId) {
      throw new CustomerDuplicateMergeError(
        'VALIDATION',
        'survivorCustomerId must be the left or right customer in the pair',
      );
    }
    return survivorId;
  }

  private buildConflicts(
    left: CustomerMergeSideSnapshot,
    right: CustomerMergeSideSnapshot,
  ): CustomerMergeConflict[] {
    const conflicts: CustomerMergeConflict[] = [];
    const leftPhone = normalizeCustomerPhoneKey(left.phone);
    const rightPhone = normalizeCustomerPhoneKey(right.phone);
    if (leftPhone && rightPhone && leftPhone !== rightPhone) {
      conflicts.push({
        code: 'verified_phone_mismatch',
        message: 'Both customers have different phone numbers',
        requiresConfirmation: true,
      });
    }

    const leftEmail = normalizeCustomerEmailKey(left.email);
    const rightEmail = normalizeCustomerEmailKey(right.email);
    if (leftEmail && rightEmail && leftEmail !== rightEmail) {
      conflicts.push({
        code: 'verified_email_mismatch',
        message: 'Both customers have different email addresses',
        requiresConfirmation: true,
      });
    }

    if (
      left.primaryAddressDisplay &&
      right.primaryAddressDisplay &&
      left.primaryAddressDisplay !== right.primaryAddressDisplay
    ) {
      conflicts.push({
        code: 'address_mismatch',
        message: 'Both customers have different primary addresses',
        requiresConfirmation: true,
      });
    }

    if (
      left.xeroContactIds.length > 0 &&
      right.xeroContactIds.length > 0 &&
      left.xeroContactIds.some((id) => !right.xeroContactIds.includes(id))
    ) {
      conflicts.push({
        code: 'separate_xero_mappings',
        message: 'Both customers have separate Xero contact mappings',
        requiresConfirmation: true,
      });
    }

    if (left.hasActiveJobs && right.hasActiveJobs) {
      conflicts.push({
        code: 'active_jobs_both',
        message: 'Both customers have active jobs',
        requiresConfirmation: true,
      });
    }

    if (left.hasUnpaidInvoices && right.hasUnpaidInvoices) {
      conflicts.push({
        code: 'unpaid_invoices_both',
        message: 'Both customers have unpaid invoices',
        requiresConfirmation: true,
      });
    }

    return conflicts;
  }

  private async loadSide(companyId: string, customerId: string): Promise<CustomerMergeSideSnapshot> {
    const row = await this.requireCustomer(companyId, customerId);
    const counts = await this.countLinks(companyId, customerId);
    const properties = await this.db.query.cxCustomerProperties.findMany({
      where: and(
        eq(cxCustomerProperties.companyId, companyId),
        eq(cxCustomerProperties.customerId, customerId),
      ),
      limit: 20,
    });
    const primary =
      properties.find((property) => property.isPrimary) ?? properties[0] ?? null;
    const primaryAddressDisplay = primary
      ? [primary.addressLine1, primary.suburb, primary.city, primary.postalCode]
          .filter(Boolean)
          .join(', ') || null
      : null;

    const mappings = await this.db.query.xeroCustomerMappings.findMany({
      where: and(
        eq(xeroCustomerMappings.companyId, companyId),
        eq(xeroCustomerMappings.customerId, customerId),
      ),
    });

    const activeJobStatuses = ['new', 'scheduled', 'in_progress'] as const;
    const [activeJobs] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(
        and(
          eq(jobs.companyId, companyId),
          eq(jobs.customerId, customerId),
          inArray(jobs.status, [...activeJobStatuses]),
        ),
      );

    const unpaidStatuses = ['sent', 'partial', 'overdue'] as const;
    const [unpaid] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, companyId),
          eq(invoices.customerId, customerId),
          inArray(invoices.status, [...unpaidStatuses]),
        ),
      );

    return {
      id: row.id,
      name: row.name,
      contactPerson: row.contactPerson,
      email: row.email,
      phone: row.phone,
      notes: row.notes,
      status: row.status,
      doNotContact: row.doNotContact,
      isSupplierOnly: row.isSupplierOnly,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      primaryAddressDisplay,
      xeroContactIds: mappings
        .map((mapping) => mapping.xeroContactId)
        .filter((id): id is string => Boolean(id)),
      linkCounts: counts,
      hasActiveJobs: (activeJobs?.count ?? 0) > 0,
      hasUnpaidInvoices: (unpaid?.count ?? 0) > 0,
    };
  }

  private async countLinks(
    companyId: string,
    customerId: string,
  ): Promise<CustomerMergeLinkCounts> {
    const count = async (table: typeof jobs | typeof quotes | typeof invoices | typeof documents | typeof communications | typeof customerActivities | typeof leads | typeof cxCustomerProperties | typeof portalUsers | typeof xeroCustomerMappings) => {
      const [row] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(table)
        .where(and(eq(table.companyId, companyId), eq(table.customerId, customerId)));
      return row?.count ?? 0;
    };

    const invoiceIds = (
      await this.db
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.companyId, companyId), eq(invoices.customerId, customerId)))
    ).map((row) => row.id);

    let paymentCount = 0;
    if (invoiceIds.length > 0) {
      const [row] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(payments)
        .where(and(eq(payments.companyId, companyId), inArray(payments.invoiceId, invoiceIds)));
      paymentCount = row?.count ?? 0;
    }

    return {
      jobs: await count(jobs),
      quotes: await count(quotes),
      invoices: await count(invoices),
      payments: paymentCount,
      properties: await count(cxCustomerProperties),
      documents: await count(documents),
      communications: await count(communications),
      activities: await count(customerActivities),
      leads: await count(leads),
      portalUsers: await count(portalUsers),
      xeroMappings: await count(xeroCustomerMappings),
    };
  }

  private async requireCustomer(companyId: string, customerId: string): Promise<CustomerRow> {
    const row = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });
    if (!row || row.mergedIntoCustomerId) {
      throw new CustomerDuplicateMergeError('NOT_FOUND', 'Customer not found');
    }
    return row;
  }

  private async repointLinkedRecords(
    tx: Tx,
    companyId: string,
    sourceId: string,
    survivorId: string,
  ): Promise<CustomerMergeLinkCounts> {
    const moved = emptyCustomerMergeLinkCounts();

    const coreUpdates: Array<{
      key: keyof CustomerMergeLinkCounts;
      run: () => Promise<unknown[]>;
    }> = [
      {
        key: 'jobs',
        run: () =>
          tx
            .update(jobs)
            .set({ customerId: survivorId })
            .where(and(eq(jobs.companyId, companyId), eq(jobs.customerId, sourceId)))
            .returning({ id: jobs.id }),
      },
      {
        key: 'quotes',
        run: () =>
          tx
            .update(quotes)
            .set({ customerId: survivorId })
            .where(and(eq(quotes.companyId, companyId), eq(quotes.customerId, sourceId)))
            .returning({ id: quotes.id }),
      },
      {
        key: 'invoices',
        run: () =>
          tx
            .update(invoices)
            .set({ customerId: survivorId })
            .where(and(eq(invoices.companyId, companyId), eq(invoices.customerId, sourceId)))
            .returning({ id: invoices.id }),
      },
      {
        key: 'properties',
        run: () =>
          tx
            .update(cxCustomerProperties)
            .set({ customerId: survivorId })
            .where(
              and(
                eq(cxCustomerProperties.companyId, companyId),
                eq(cxCustomerProperties.customerId, sourceId),
              ),
            )
            .returning({ id: cxCustomerProperties.id }),
      },
      {
        key: 'documents',
        run: () =>
          tx
            .update(documents)
            .set({ customerId: survivorId })
            .where(and(eq(documents.companyId, companyId), eq(documents.customerId, sourceId)))
            .returning({ id: documents.id }),
      },
      {
        key: 'communications',
        run: () =>
          tx
            .update(communications)
            .set({ customerId: survivorId })
            .where(
              and(eq(communications.companyId, companyId), eq(communications.customerId, sourceId)),
            )
            .returning({ id: communications.id }),
      },
      {
        key: 'activities',
        run: () =>
          tx
            .update(customerActivities)
            .set({ customerId: survivorId })
            .where(
              and(
                eq(customerActivities.companyId, companyId),
                eq(customerActivities.customerId, sourceId),
              ),
            )
            .returning({ id: customerActivities.id }),
      },
      {
        key: 'leads',
        run: () =>
          tx
            .update(leads)
            .set({ customerId: survivorId })
            .where(and(eq(leads.companyId, companyId), eq(leads.customerId, sourceId)))
            .returning({ id: leads.id }),
      },
    ];

    for (const update of coreUpdates) {
      const rows = await update.run();
      moved[update.key] = rows.length;
    }

    // Best-effort repoint for extended tables that may not exist on every environment.
    for (const tableName of REPOINT_TABLES) {
      if (
        [
          'jobs',
          'quotes',
          'invoices',
          'cx_customer_properties',
          'documents',
          'communications',
          'customer_activities',
          'leads',
        ].includes(tableName)
      ) {
        continue;
      }
      try {
        await tx.execute(sql`
          UPDATE ${sql.identifier(tableName)}
          SET customer_id = ${survivorId}
          WHERE company_id = ${companyId}
            AND customer_id = ${sourceId}
        `);
      } catch {
        // Table may be absent or lack company_id in older staging schemas.
      }
    }

    const invoiceIds = (
      await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.companyId, companyId), eq(invoices.customerId, survivorId)))
    ).map((row) => row.id);
    if (invoiceIds.length > 0) {
      const [row] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(payments)
        .where(and(eq(payments.companyId, companyId), inArray(payments.invoiceId, invoiceIds)));
      moved.payments = row?.count ?? 0;
    }

    const [portalCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(portalUsers)
      .where(and(eq(portalUsers.companyId, companyId), eq(portalUsers.customerId, survivorId)));
    moved.portalUsers = portalCount?.count ?? 0;

    const [xeroCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(xeroCustomerMappings)
      .where(
        and(
          eq(xeroCustomerMappings.companyId, companyId),
          eq(xeroCustomerMappings.customerId, survivorId),
        ),
      );
    moved.xeroMappings = xeroCount?.count ?? 0;

    return moved;
  }

  private async mergeCustomerFields(
    tx: Tx,
    companyId: string,
    survivorId: string,
    sourceId: string,
    _decision: CustomerMergeRequest['decision'],
    fieldSelection: CustomerMergeFieldSelection | undefined,
    preview: CustomerMergePreview,
  ): Promise<void> {
    const survivor = survivorId === preview.left.id ? preview.left : preview.right;
    const source = sourceId === preview.left.id ? preview.left : preview.right;

    const pick = (field: CustomerMergeFieldKey) => {
      if (fieldSelection?.[field]) {
        return fieldSelection[field] === 'left' ? preview.left[field] : preview.right[field];
      }
      // Prefer non-empty survivor value; fill gaps from source
      const survivorValue = survivor[field];
      const sourceValue = source[field];
      if (survivorValue == null || survivorValue === '') return sourceValue;
      return survivorValue;
    };

    const mergedNotes = [survivor.notes?.trim(), source.notes?.trim()]
      .filter(Boolean)
      .join('\n---\n');

    await tx
      .update(customers)
      .set({
        name: String(pick('name') ?? survivor.name),
        contactPerson: (pick('contactPerson') as string | null) ?? null,
        email: (pick('email') as string | null) ?? null,
        phone: (pick('phone') as string | null) ?? null,
        notes: mergedNotes || null,
        status: (pick('status') as 'active' | 'inactive' | 'lead') ?? survivor.status,
        doNotContact: Boolean(pick('doNotContact')),
        isSupplierOnly: Boolean(pick('isSupplierOnly')),
        updatedAt: new Date(),
      })
      .where(and(eq(customers.id, survivorId), eq(customers.companyId, companyId)));
  }

  private async mergeXeroMappings(
    tx: Tx,
    companyId: string,
    survivorId: string,
    sourceId: string,
    keepXeroContactId: string | null,
  ): Promise<void> {
    const mappings = await tx.query.xeroCustomerMappings.findMany({
      where: and(
        eq(xeroCustomerMappings.companyId, companyId),
        or(
          eq(xeroCustomerMappings.customerId, survivorId),
          eq(xeroCustomerMappings.customerId, sourceId),
        ),
      ),
    });

    if (mappings.length === 0) return;

    const preferredContactId =
      keepXeroContactId ||
      mappings.find((mapping) => mapping.customerId === survivorId)?.xeroContactId ||
      mappings.find((mapping) => mapping.xeroContactId)?.xeroContactId ||
      null;

    // Keep one mapping on survivor; drop the rest to prevent duplicate provider mappings.
    const keep =
      mappings.find(
        (mapping) =>
          mapping.customerId === survivorId &&
          (!preferredContactId || mapping.xeroContactId === preferredContactId),
      ) ||
      mappings.find((mapping) => mapping.xeroContactId === preferredContactId) ||
      mappings[0]!;

    for (const mapping of mappings) {
      if (mapping.id === keep.id) {
        await tx
          .update(xeroCustomerMappings)
          .set({
            customerId: survivorId,
            xeroContactId: preferredContactId ?? mapping.xeroContactId,
            updatedAt: new Date(),
            conflictMetadata: null,
          })
          .where(eq(xeroCustomerMappings.id, mapping.id));
      } else {
        await tx
          .delete(xeroCustomerMappings)
          .where(
            and(
              eq(xeroCustomerMappings.id, mapping.id),
              eq(xeroCustomerMappings.companyId, companyId),
            ),
          );
      }
    }
  }

  private async mergePortalUsers(
    tx: Tx,
    companyId: string,
    survivorId: string,
    sourceId: string,
  ): Promise<void> {
    const sourcePortals = await tx.query.portalUsers.findMany({
      where: and(eq(portalUsers.companyId, companyId), eq(portalUsers.customerId, sourceId)),
    });
    const survivorPortals = await tx.query.portalUsers.findMany({
      where: and(eq(portalUsers.companyId, companyId), eq(portalUsers.customerId, survivorId)),
    });

    if (survivorPortals.length > 0) {
      // Survivor already has portal access — move invites/sessions/requests then drop source portal users.
      for (const table of [portalSessions, portalUserInvites, portalCustomerRequests] as const) {
        await tx
          .update(table)
          .set({ customerId: survivorId })
          .where(and(eq(table.companyId, companyId), eq(table.customerId, sourceId)));
      }
      if (sourcePortals.length > 0) {
        await tx
          .delete(portalUsers)
          .where(and(eq(portalUsers.companyId, companyId), eq(portalUsers.customerId, sourceId)));
      }
      return;
    }

    await tx
      .update(portalUsers)
      .set({ customerId: survivorId })
      .where(and(eq(portalUsers.companyId, companyId), eq(portalUsers.customerId, sourceId)));
  }
}
