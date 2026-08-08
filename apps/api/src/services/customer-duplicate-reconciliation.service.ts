/**
 * Row 85 — Customer Duplicate Detection / Safe Xero Contact Reconciliation.
 * Staging-only safe workflow over M7 candidates + Row 83 associations.
 * Draft → Approve → Execute. No silent merge. No Xero writes. No finance ownership moves.
 */
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  customerDuplicateCandidates,
  customerDuplicateReconciliations,
  customerPeople,
  customerSourceAssociations,
  customers,
  quotes,
  securityAuditLogs,
  xeroCustomerMappings,
} from '@titan/db';
import {
  CUSTOMER_DUPLICATE_RECONCILIATION_CRC,
  assertCrcRowanNotDestructivelyMerged,
  assertCrcRowanRegression,
  assertPreviewHashMatches,
  assertReconciliationLifecycleTransition,
  assertTechnicianDeniedDuplicateReconciliation,
  buildReconciliationPreviewHash,
  canExecuteDuplicateReconciliation,
  classifyDuplicateCandidate,
  orderCustomerPairIds,
  planSameCompanyDifferentPersonAction,
  planTrueDuplicateCanonicalization,
  type DuplicateConfidenceLabel,
  type DuplicateResolutionType,
  type ReconciliationLifecycleStatus,
} from '@titan/shared';
import {
  CustomerDuplicateMergeError,
  CustomerDuplicateMergeService,
  type DuplicateMergeActor,
} from './customer-duplicate-merge.service.js';
import { Customer360Service, type Customer360Actor } from './customer-360.service.js';

export class CustomerDuplicateReconciliationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CustomerDuplicateReconciliationError';
  }
}

export type ReconciliationActor = DuplicateMergeActor;

function toC360Actor(actor: ReconciliationActor): Customer360Actor {
  return {
    companyId: actor.companyId,
    userId: actor.userId,
    roleName: actor.roleName,
    permissions: actor.permissions,
  };
}

export class CustomerDuplicateReconciliationService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly mergeService: CustomerDuplicateMergeService,
    private readonly customer360Service: Customer360Service,
  ) {}

  private assertAccess(actor: ReconciliationActor): void {
    const gate = assertTechnicianDeniedDuplicateReconciliation(actor);
    if (!gate.allowed) {
      throw new CustomerDuplicateReconciliationError('FORBIDDEN', gate.reason);
    }
  }

  private assertExecute(actor: ReconciliationActor): void {
    this.assertAccess(actor);
    if (!canExecuteDuplicateReconciliation(actor)) {
      throw new CustomerDuplicateReconciliationError(
        'FORBIDDEN',
        'Execute/canonicalize requires Owner or authorised Admin/Manager write permission.',
      );
    }
  }

  private async audit(
    actor: ReconciliationActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown> = {},
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'crm',
      action,
      entityType: 'customer_duplicate_reconciliation',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        module: 'customer_duplicate_reconciliation',
        xeroWrite: false,
        inventsData: false,
        row86: false,
        productionWrite: false,
      },
    });
  }

  /** Scan via M7 engine, then upsert classified reconciliations (idempotent). */
  async scanAndClassify(actor: ReconciliationActor) {
    this.assertAccess(actor);
    const candidates = await this.mergeService.scanAndUpsertCandidates(actor);
    const classified = [];
    for (const candidate of candidates) {
      const row = await this.upsertClassification(actor, candidate.id, {
        leftCustomerId: candidate.leftCustomerId,
        rightCustomerId: candidate.rightCustomerId,
        leftName: candidate.leftName,
        rightName: candidate.rightName,
        matchReasons: candidate.matchReasons,
      });
      classified.push(row);
    }
    return { candidates, reconciliations: classified };
  }

  async listQueue(
    actor: ReconciliationActor,
    opts?: { status?: ReconciliationLifecycleStatus; confidence?: DuplicateConfidenceLabel },
  ) {
    this.assertAccess(actor);
    const conditions = [eq(customerDuplicateReconciliations.companyId, actor.companyId)];
    if (opts?.status) conditions.push(eq(customerDuplicateReconciliations.status, opts.status));
    if (opts?.confidence) {
      conditions.push(eq(customerDuplicateReconciliations.confidenceLabel, opts.confidence));
    }

    const rows = await this.db
      .select()
      .from(customerDuplicateReconciliations)
      .where(and(...conditions))
      .orderBy(desc(customerDuplicateReconciliations.updatedAt))
      .limit(200);

    // Enrich with names
    const customerIds = [
      ...new Set(rows.flatMap((r) => [r.leftCustomerId, r.rightCustomerId])),
    ];
    const nameMap = new Map<string, string>();
    if (customerIds.length) {
      const custs = await this.db
        .select({ id: customers.id, name: customers.name, companyName: customers.companyName })
        .from(customers)
        .where(and(eq(customers.companyId, actor.companyId), inArray(customers.id, customerIds)));
      for (const c of custs) nameMap.set(c.id, c.companyName?.trim() || c.name);
    }

    return rows.map((r) => ({
      id: r.id,
      candidateId: r.candidateId,
      leftCustomerId: r.leftCustomerId,
      rightCustomerId: r.rightCustomerId,
      leftName: nameMap.get(r.leftCustomerId) ?? r.leftCustomerId.slice(0, 8),
      rightName: nameMap.get(r.rightCustomerId) ?? r.rightCustomerId.slice(0, 8),
      confidenceLabel: r.confidenceLabel,
      suggestedResolution: r.suggestedResolution,
      resolutionType: r.resolutionType,
      status: r.status,
      matchSignals: r.matchSignals,
      differingSignals: r.differingSignals,
      rationale: r.rationale,
      reversible: r.reversible,
      updatedAt: r.updatedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private async upsertClassification(
    actor: ReconciliationActor,
    candidateId: string | null,
    pair: {
      leftCustomerId: string;
      rightCustomerId: string;
      leftName: string;
      rightName: string;
      matchReasons?: Array<{ reason: string; detail: string; weight: number }>;
    },
  ) {
    const [leftId, rightId] = orderCustomerPairIds(pair.leftCustomerId, pair.rightCustomerId);
    const [left] = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.companyId, actor.companyId), eq(customers.id, leftId)))
      .limit(1);
    const [right] = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.companyId, actor.companyId), eq(customers.id, rightId)))
      .limit(1);
    if (!left || !right) {
      throw new CustomerDuplicateReconciliationError('NOT_FOUND', 'Customer pair not found.');
    }

    const leftXero = await this.db
      .select({ xeroContactId: xeroCustomerMappings.xeroContactId })
      .from(xeroCustomerMappings)
      .where(
        and(
          eq(xeroCustomerMappings.companyId, actor.companyId),
          eq(xeroCustomerMappings.customerId, leftId),
        ),
      );
    const rightXero = await this.db
      .select({ xeroContactId: xeroCustomerMappings.xeroContactId })
      .from(xeroCustomerMappings)
      .where(
        and(
          eq(xeroCustomerMappings.companyId, actor.companyId),
          eq(xeroCustomerMappings.customerId, rightId),
        ),
      );

    const [assoc] = await this.db
      .select({ id: customerSourceAssociations.id })
      .from(customerSourceAssociations)
      .where(
        and(
          eq(customerSourceAssociations.companyId, actor.companyId),
          eq(customerSourceAssociations.status, 'active'),
          or(
            and(
              eq(customerSourceAssociations.canonicalCustomerId, leftId),
              eq(customerSourceAssociations.sourceCustomerId, rightId),
            ),
            and(
              eq(customerSourceAssociations.canonicalCustomerId, rightId),
              eq(customerSourceAssociations.sourceCustomerId, leftId),
            ),
          ),
        ),
      )
      .limit(1);

    const classification = classifyDuplicateCandidate({
      leftCustomerId: leftId,
      rightCustomerId: rightId,
      leftName: left.name,
      rightName: right.name,
      leftCompanyName: left.companyName,
      rightCompanyName: right.companyName,
      leftContactPerson: left.contactPerson,
      rightContactPerson: right.contactPerson,
      leftEmail: left.email,
      rightEmail: right.email,
      leftPhone: left.phone,
      rightPhone: right.phone,
      leftVat: left.vatNumber,
      rightVat: right.vatNumber,
      leftBillingAddress: left.billingAddress,
      rightBillingAddress: right.billingAddress,
      leftXeroContactIds: leftXero
        .map((x) => x.xeroContactId)
        .filter((id): id is string => Boolean(id)),
      rightXeroContactIds: rightXero
        .map((x) => x.xeroContactId)
        .filter((id): id is string => Boolean(id)),
      evidence: pair.matchReasons as
        | import('@titan/shared').CustomerDuplicateMatchEvidence[]
        | undefined,
      alreadyAssociated: Boolean(assoc),
    });

    const [existing] = await this.db
      .select()
      .from(customerDuplicateReconciliations)
      .where(
        and(
          eq(customerDuplicateReconciliations.companyId, actor.companyId),
          eq(customerDuplicateReconciliations.leftCustomerId, leftId),
          eq(customerDuplicateReconciliations.rightCustomerId, rightId),
        ),
      )
      .limit(1);

    // Idempotency: do not reopen executed/dismissed unless still unreviewed/draft/deferred
    if (
      existing &&
      (existing.status === 'executed' ||
        existing.status === 'dismissed' ||
        existing.status === 'approved')
    ) {
      return existing;
    }

    if (existing) {
      const [updated] = await this.db
        .update(customerDuplicateReconciliations)
        .set({
          candidateId: candidateId ?? existing.candidateId,
          confidenceLabel: classification.confidenceLabel,
          suggestedResolution: classification.suggestedResolution,
          matchSignals: classification.matchSignals,
          differingSignals: classification.differingSignals,
          rationale: classification.rationale,
          fieldCompares: classification.fieldCompares,
          updatedAt: new Date(),
        })
        .where(eq(customerDuplicateReconciliations.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await this.db
      .insert(customerDuplicateReconciliations)
      .values({
        companyId: actor.companyId,
        candidateId,
        leftCustomerId: leftId,
        rightCustomerId: rightId,
        confidenceLabel: classification.confidenceLabel,
        suggestedResolution: classification.suggestedResolution,
        status: 'unreviewed',
        matchSignals: classification.matchSignals,
        differingSignals: classification.differingSignals,
        rationale: classification.rationale,
        fieldCompares: classification.fieldCompares,
      })
      .returning();

    await this.audit(actor, 'duplicate_candidate_created', created.id, {
      leftCustomerId: leftId,
      rightCustomerId: rightId,
      confidenceLabel: classification.confidenceLabel,
    });

    return created;
  }

  async getSideBySide(actor: ReconciliationActor, reconciliationId: string) {
    this.assertAccess(actor);
    const row = await this.loadReconciliation(actor.companyId, reconciliationId);
    const preview = await this.mergeService.previewMerge(
      actor,
      row.leftCustomerId,
      row.rightCustomerId,
      row.candidateId,
    );

    // Refresh classification against current rows
    await this.upsertClassification(actor, row.candidateId, {
      leftCustomerId: row.leftCustomerId,
      rightCustomerId: row.rightCustomerId,
      leftName: preview.left.name,
      rightName: preview.right.name,
      matchReasons: preview.matchReasons,
    });
    const fresh = await this.loadReconciliation(actor.companyId, reconciliationId);

    const peopleCounts = await this.countPeople(actor.companyId, [
      row.leftCustomerId,
      row.rightCustomerId,
    ]);

    return {
      reconciliation: {
        id: fresh.id,
        status: fresh.status,
        confidenceLabel: fresh.confidenceLabel,
        suggestedResolution: fresh.suggestedResolution,
        resolutionType: fresh.resolutionType,
        matchSignals: fresh.matchSignals,
        differingSignals: fresh.differingSignals,
        rationale: fresh.rationale,
        fieldCompares: fresh.fieldCompares,
        reversible: fresh.reversible,
        irreversibleWarning: fresh.irreversibleWarning,
        previewHash: fresh.previewHash,
        xeroWrites: fresh.xeroWrites,
        movesFinancialOwnership: fresh.movesFinancialOwnership,
      },
      left: {
        ...preview.left,
        peopleCount: peopleCounts.get(row.leftCustomerId) ?? 0,
        vatNumber: (await this.loadCustomer(actor.companyId, row.leftCustomerId)).vatNumber,
        companyName: (await this.loadCustomer(actor.companyId, row.leftCustomerId)).companyName,
        billingAddress: (await this.loadCustomer(actor.companyId, row.leftCustomerId))
          .billingAddress,
      },
      right: {
        ...preview.right,
        peopleCount: peopleCounts.get(row.rightCustomerId) ?? 0,
        vatNumber: (await this.loadCustomer(actor.companyId, row.rightCustomerId)).vatNumber,
        companyName: (await this.loadCustomer(actor.companyId, row.rightCustomerId)).companyName,
        billingAddress: (await this.loadCustomer(actor.companyId, row.rightCustomerId))
          .billingAddress,
      },
      conflicts: preview.conflicts,
      autoMerge: false as const,
      xeroWrites: 0 as const,
      policy: {
        draftApproveExecute: true,
        preserveFinancialOwnership: true,
        noSilentMerge: true,
        row83PeopleReuse: true,
        row83AssociationReuse: true,
      },
    };
  }

  async createDraft(
    actor: ReconciliationActor,
    reconciliationId: string,
    input: {
      resolutionType: DuplicateResolutionType;
      canonicalCustomerId: string;
      personId?: string | null;
      fieldConflictSelections?: Record<string, 'left' | 'right' | 'preserve_both'>;
      notes?: string | null;
    },
  ) {
    this.assertExecute(actor);
    const row = await this.loadReconciliation(actor.companyId, reconciliationId);
    assertReconciliationLifecycleTransition({
      from: row.status as ReconciliationLifecycleStatus,
      to: 'draft',
      resolutionType: input.resolutionType,
    });
    assertCrcRowanNotDestructivelyMerged({
      leftCustomerId: row.leftCustomerId,
      rightCustomerId: row.rightCustomerId,
      resolutionType: input.resolutionType,
    });

    if (
      input.canonicalCustomerId !== row.leftCustomerId &&
      input.canonicalCustomerId !== row.rightCustomerId
    ) {
      throw new CustomerDuplicateReconciliationError(
        'VALIDATION',
        'Canonical customer must be one of the pair.',
      );
    }
    const secondaryCustomerId =
      input.canonicalCustomerId === row.leftCustomerId
        ? row.rightCustomerId
        : row.leftCustomerId;

    const sideBySide = await this.getSideBySide(actor, reconciliationId);
    const left = sideBySide.left;
    const right = sideBySide.right;
    const leftSide = left.id === row.leftCustomerId ? left : right;
    const rightSide = right.id === row.rightCustomerId ? right : left;

    if (input.resolutionType === 'TRUE_DUPLICATE_CANONICALIZE') {
      const plan = planTrueDuplicateCanonicalization({
        leftXeroContactIds: leftSide.xeroContactIds,
        rightXeroContactIds: rightSide.xeroContactIds,
        resolutionAllowed: !sideBySide.reconciliation.confidenceLabel.includes('SAME_COMPANY'),
      });
      if (plan.mode !== 'NON_DESTRUCTIVE_CANONICAL') {
        throw new CustomerDuplicateReconciliationError('CONFLICT', plan.reason);
      }
    }

    const previewHash = buildReconciliationPreviewHash({
      canonicalCustomerId: input.canonicalCustomerId,
      secondaryCustomerId,
      resolutionType: input.resolutionType,
      leftUpdatedAt: leftSide.updatedAt,
      rightUpdatedAt: rightSide.updatedAt,
      leftXeroContactIds: leftSide.xeroContactIds,
      rightXeroContactIds: rightSide.xeroContactIds,
      leftLinkCounts: leftSide.linkCounts,
      rightLinkCounts: rightSide.linkCounts,
    });

    const secondaryCounts =
      secondaryCustomerId === leftSide.id ? leftSide.linkCounts : rightSide.linkCounts;
    const impact = {
      canonicalCustomerId: input.canonicalCustomerId,
      secondaryCustomerId,
      resolutionType: input.resolutionType,
      peopleAffected: await this.countPeopleOne(actor.companyId, secondaryCustomerId),
      propertiesAffected: secondaryCounts.properties,
      jobsAffected: secondaryCounts.jobs,
      leadsAffected: secondaryCounts.leads,
      documentsAffected: secondaryCounts.documents,
      financialRecordsPreserved: true as const,
      sourceIdsPreserved: true as const,
      xeroWrites: 0 as const,
      recordsUntouched: [
        'quotes (ownership preserved)',
        'invoices (ownership preserved)',
        'payments (ownership preserved)',
        'xero_customer_mappings (identity preserved)',
      ],
      reversible: input.resolutionType !== 'TRUE_DUPLICATE_CANONICALIZE' || true,
      irreversibleWarning:
        input.resolutionType === 'TRUE_DUPLICATE_CANONICALIZE'
          ? 'Soft-canonicalization hides the secondary customer via merged_into; finance rows stay on original customer ids. Reversible by clearing merged_into and removing association.'
          : null,
      previewHash,
      fieldConflictSelections: input.fieldConflictSelections ?? {},
    };

    const [updated] = await this.db
      .update(customerDuplicateReconciliations)
      .set({
        status: 'draft',
        resolutionType: input.resolutionType,
        canonicalCustomerId: input.canonicalCustomerId,
        secondaryCustomerId,
        personId: input.personId ?? null,
        fieldConflictSelections: input.fieldConflictSelections ?? {},
        previewHash,
        previewPayload: { left: leftSide, right: rightSide },
        impactSummary: impact,
        reversible: true,
        irreversibleWarning: impact.irreversibleWarning,
        decisionNotes: input.notes ?? null,
        draftedByUserId: actor.userId,
        draftedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customerDuplicateReconciliations.id, reconciliationId))
      .returning();

    await this.audit(actor, 'duplicate_draft_created', reconciliationId, {
      resolutionType: input.resolutionType,
      canonicalCustomerId: input.canonicalCustomerId,
      secondaryCustomerId,
      previewHash,
    });

    return { reconciliation: updated, impact };
  }

  async approve(actor: ReconciliationActor, reconciliationId: string) {
    this.assertExecute(actor);
    const row = await this.loadReconciliation(actor.companyId, reconciliationId);
    if (!row.resolutionType || !row.canonicalCustomerId || !row.secondaryCustomerId) {
      throw new CustomerDuplicateReconciliationError('INVALID_STATE', 'Draft resolution required.');
    }
    assertReconciliationLifecycleTransition({
      from: row.status as ReconciliationLifecycleStatus,
      to: 'approved',
      resolutionType: row.resolutionType as DuplicateResolutionType,
    });

    const currentHash = await this.computePreviewHash(
      actor,
      row.leftCustomerId,
      row.rightCustomerId,
      row.candidateId,
      row.canonicalCustomerId,
      row.secondaryCustomerId,
      row.resolutionType as DuplicateResolutionType,
    );
    try {
      assertPreviewHashMatches({
        draftHash: row.previewHash ?? '',
        currentHash,
      });
    } catch {
      throw new CustomerDuplicateReconciliationError(
        'STALE_PREVIEW',
        'Stale preview — preconditions changed since draft. Re-preview required.',
      );
    }

    const [updated] = await this.db
      .update(customerDuplicateReconciliations)
      .set({
        status: 'approved',
        approvedByUserId: actor.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customerDuplicateReconciliations.id, reconciliationId))
      .returning();

    await this.audit(actor, 'duplicate_approved', reconciliationId, {
      resolutionType: row.resolutionType,
      previewHash: row.previewHash,
    });

    return updated;
  }

  async execute(actor: ReconciliationActor, reconciliationId: string) {
    this.assertExecute(actor);
    const row = await this.loadReconciliation(actor.companyId, reconciliationId);
    if (row.status !== 'approved' || !row.resolutionType || !row.canonicalCustomerId) {
      throw new CustomerDuplicateReconciliationError(
        'INVALID_STATE',
        'Execute requires an approved draft with canonical customer.',
      );
    }
    assertReconciliationLifecycleTransition({
      from: 'approved',
      to: 'executed',
      resolutionType: row.resolutionType as DuplicateResolutionType,
    });
    assertCrcRowanNotDestructivelyMerged({
      leftCustomerId: row.leftCustomerId,
      rightCustomerId: row.rightCustomerId,
      resolutionType: row.resolutionType as DuplicateResolutionType,
    });

    const side = await this.getSideBySide(actor, reconciliationId);
    const leftSide = side.left.id === row.leftCustomerId ? side.left : side.right;
    const rightSide = side.right.id === row.rightCustomerId ? side.right : side.left;
    const currentHash = await this.computePreviewHash(
      actor,
      row.leftCustomerId,
      row.rightCustomerId,
      row.candidateId,
      row.canonicalCustomerId,
      row.secondaryCustomerId!,
      row.resolutionType as DuplicateResolutionType,
    );
    try {
      assertPreviewHashMatches({
        draftHash: row.previewHash ?? '',
        currentHash,
      });
    } catch {
      throw new CustomerDuplicateReconciliationError(
        'STALE_PREVIEW',
        'Stale preview — preconditions changed since approval. Re-draft required.',
      );
    }

    // Capture finance ownership before
    const quoteBefore = await this.quoteOwnership(actor.companyId, [
      row.leftCustomerId,
      row.rightCustomerId,
    ]);

    let associationId: string | null = row.associationId;
    let personId: string | null = row.personId;

    if (row.resolutionType === 'NOT_DUPLICATE') {
      await this.db
        .update(customerDuplicateReconciliations)
        .set({
          status: 'dismissed',
          executedByUserId: actor.userId,
          executedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(customerDuplicateReconciliations.id, reconciliationId));
      if (row.candidateId) {
        await this.db
          .update(customerDuplicateCandidates)
          .set({
            status: 'dismissed',
            decidedByUserId: actor.userId,
            decisionNotes: row.decisionNotes,
            updatedAt: new Date(),
          })
          .where(eq(customerDuplicateCandidates.id, row.candidateId));
      }
      await this.audit(actor, 'duplicate_dismissed_not_duplicate', reconciliationId, {
        leftCustomerId: row.leftCustomerId,
        rightCustomerId: row.rightCustomerId,
      });
      return { executed: true as const, resolutionType: row.resolutionType, xeroWrites: 0 as const };
    }

    if (row.resolutionType === 'DEFER') {
      await this.db
        .update(customerDuplicateReconciliations)
        .set({
          status: 'deferred',
          executedByUserId: actor.userId,
          executedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(customerDuplicateReconciliations.id, reconciliationId));
      await this.audit(actor, 'duplicate_deferred', reconciliationId, {});
      return { executed: true as const, resolutionType: row.resolutionType, xeroWrites: 0 as const };
    }

    if (row.resolutionType === 'SAME_COMPANY_DIFFERENT_PERSON') {
      const plan = planSameCompanyDifferentPersonAction({
        canonicalCustomerId: row.canonicalCustomerId,
        sourceCustomerId: row.secondaryCustomerId!,
        personIdentityKnown: Boolean(row.personId),
      });
      if (plan.action === 'REVIEW_REQUIRED') {
        throw new CustomerDuplicateReconciliationError('INVALID_STATE', plan.reason);
      }

      const secondary = await this.loadCustomer(actor.companyId, row.secondaryCustomerId!);
      const [xero] = await this.db
        .select()
        .from(xeroCustomerMappings)
        .where(
          and(
            eq(xeroCustomerMappings.companyId, actor.companyId),
            eq(xeroCustomerMappings.customerId, row.secondaryCustomerId!),
          ),
        )
        .limit(1);

      if (plan.action === 'ASSOCIATE_WITH_PERSON' && row.personId) {
        personId = row.personId;
      } else if (plan.action === 'ASSOCIATE_WITH_PERSON' && !row.personId) {
        // Create person from secondary contact fields only when identity signals exist
        const displayName =
          secondary.contactPerson?.trim() || secondary.name.trim() || 'Associated contact';
        const person = await this.customer360Service.createPerson(
          toC360Actor(actor),
          row.canonicalCustomerId,
          {
            displayName,
            email: secondary.email,
            phone: secondary.phone,
            isSiteContact: true,
            consentStatus: 'unknown',
            linkedSourceCustomerId: secondary.id,
            sourceProvider: xero ? 'xero' : null,
            sourceExternalId: xero?.xeroContactId ?? null,
          },
        );
        personId = person.id;
      }

      const association = await this.customer360Service.associateSource(
        toC360Actor(actor),
        row.canonicalCustomerId,
        {
          sourceCustomerId: row.secondaryCustomerId!,
          personId,
          associationRole: 'related_contact',
          reason: row.decisionNotes ?? 'Row 85 same-company / different-person reconciliation',
          sourceProvider: xero ? 'xero' : null,
          sourceExternalId: xero?.xeroContactId ?? null,
        },
      );
      associationId = association.id;

      await this.audit(actor, 'duplicate_classified_same_company_different_person', reconciliationId, {
        canonicalCustomerId: row.canonicalCustomerId,
        secondaryCustomerId: row.secondaryCustomerId,
        associationId,
        personId,
        reusedCustomerPeople: true,
        reusedSourceAssociations: true,
      });
    }

    if (row.resolutionType === 'TRUE_DUPLICATE_CANONICALIZE') {
      const plan = planTrueDuplicateCanonicalization({
        leftXeroContactIds: leftSide.xeroContactIds,
        rightXeroContactIds: rightSide.xeroContactIds,
        resolutionAllowed: true,
      });
      if (plan.mode !== 'NON_DESTRUCTIVE_CANONICAL') {
        throw new CustomerDuplicateReconciliationError('CONFLICT', plan.reason);
      }

      // Soft-canonicalize: hide secondary via merged_into WITHOUT repointing finance FKs.
      await this.db
        .update(customers)
        .set({
          mergedIntoCustomerId: row.canonicalCustomerId,
          status: 'inactive',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(customers.companyId, actor.companyId),
            eq(customers.id, row.secondaryCustomerId!),
          ),
        );

      // Association for Customer 360 history aggregation
      try {
        const association = await this.customer360Service.associateSource(
          toC360Actor(actor),
          row.canonicalCustomerId,
          {
            sourceCustomerId: row.secondaryCustomerId!,
            associationRole: 'canonicalized_duplicate',
            reason: row.decisionNotes ?? 'Row 85 non-destructive true-duplicate canonicalize',
          },
        );
        associationId = association.id;
      } catch (err) {
        // Already associated is acceptable (idempotent execute)
        if (!(err instanceof Error && /already associated/i.test(err.message))) {
          throw err;
        }
      }

      await this.audit(actor, 'duplicate_executed', reconciliationId, {
        mode: 'NON_DESTRUCTIVE_CANONICAL',
        movesFinancialRows: false,
        hardDeletes: false,
        xeroWrite: false,
        canonicalCustomerId: row.canonicalCustomerId,
        secondaryCustomerId: row.secondaryCustomerId,
      });
    }

    const quoteAfter = await this.quoteOwnership(actor.companyId, [
      row.leftCustomerId,
      row.rightCustomerId,
    ]);
    // Prove ownership unchanged
    const beforeIds = quoteBefore.map((q) => `${q.id}:${q.customerId}`).sort();
    const afterIds = quoteAfter.map((q) => `${q.id}:${q.customerId}`).sort();
    if (beforeIds.join('|') !== afterIds.join('|')) {
      throw new CustomerDuplicateReconciliationError(
        'SNAPSHOT_MUTATION',
        'Execution attempted to move quote ownership — aborted.',
      );
    }

    if (row.candidateId) {
      await this.db
        .update(customerDuplicateCandidates)
        .set({
          status: 'merged',
          survivorCustomerId: row.canonicalCustomerId,
          decidedByUserId: actor.userId,
          decisionNotes: row.decisionNotes,
          updatedAt: new Date(),
        })
        .where(eq(customerDuplicateCandidates.id, row.candidateId));
    }

    const [updated] = await this.db
      .update(customerDuplicateReconciliations)
      .set({
        status: 'executed',
        associationId,
        personId,
        executedByUserId: actor.userId,
        executedAt: new Date(),
        updatedAt: new Date(),
        xeroWrites: 0,
        movesFinancialOwnership: false,
      })
      .where(eq(customerDuplicateReconciliations.id, reconciliationId))
      .returning();

    await this.audit(actor, 'duplicate_executed', reconciliationId, {
      resolutionType: row.resolutionType,
      associationId,
      personId,
      financialOwnershipPreserved: true,
    });

    return {
      executed: true as const,
      resolutionType: row.resolutionType,
      reconciliation: updated,
      associationId,
      personId,
      xeroWrites: 0 as const,
      movesFinancialOwnership: false as const,
    };
  }

  async reverse(actor: ReconciliationActor, reconciliationId: string) {
    this.assertExecute(actor);
    const row = await this.loadReconciliation(actor.companyId, reconciliationId);
    if (row.status !== 'executed' || !row.reversible) {
      throw new CustomerDuplicateReconciliationError(
        'INVALID_STATE',
        'Only reversible executed reconciliations can be reversed.',
      );
    }
    assertReconciliationLifecycleTransition({
      from: 'executed',
      to: 'reversed',
      resolutionType: (row.resolutionType as DuplicateResolutionType) ?? 'DEFER',
    });

    if (row.associationId) {
      await this.customer360Service.removeAssociation(
        toC360Actor(actor),
        row.canonicalCustomerId!,
        row.associationId,
      );
    }

    if (
      row.resolutionType === 'TRUE_DUPLICATE_CANONICALIZE' &&
      row.secondaryCustomerId &&
      row.canonicalCustomerId
    ) {
      await this.db
        .update(customers)
        .set({
          mergedIntoCustomerId: null,
          status: 'active',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(customers.companyId, actor.companyId),
            eq(customers.id, row.secondaryCustomerId),
            eq(customers.mergedIntoCustomerId, row.canonicalCustomerId),
          ),
        );
    }

    if (row.candidateId) {
      await this.db
        .update(customerDuplicateCandidates)
        .set({
          status: 'pending',
          survivorCustomerId: null,
          updatedAt: new Date(),
        })
        .where(eq(customerDuplicateCandidates.id, row.candidateId));
    }

    const [updated] = await this.db
      .update(customerDuplicateReconciliations)
      .set({
        status: 'reversed',
        associationId: null,
        reversedByUserId: actor.userId,
        reversedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customerDuplicateReconciliations.id, reconciliationId))
      .returning();

    await this.audit(actor, 'duplicate_reversed', reconciliationId, {
      resolutionType: row.resolutionType,
      canonicalCustomerId: row.canonicalCustomerId,
      secondaryCustomerId: row.secondaryCustomerId,
    });

    return updated;
  }

  /** Creation-time possible-duplicate warning (no auto-block, no auto-merge). */
  async warnOnCreate(
    actor: ReconciliationActor,
    input: { name: string; email?: string | null; phone?: string | null; vatNumber?: string | null },
  ) {
    this.assertAccess(actor);
    const nameKey = input.name.trim().toLowerCase();
    const rows = await this.db
      .select({
        id: customers.id,
        name: customers.name,
        companyName: customers.companyName,
        email: customers.email,
        phone: customers.phone,
        vatNumber: customers.vatNumber,
      })
      .from(customers)
      .where(
        and(eq(customers.companyId, actor.companyId), isNull(customers.mergedIntoCustomerId)),
      )
      .limit(500);

    const candidates = [];
    for (const row of rows) {
      const classification = classifyDuplicateCandidate({
        leftCustomerId: 'new',
        rightCustomerId: row.id,
        leftName: input.name,
        rightName: row.name,
        leftCompanyName: input.name,
        rightCompanyName: row.companyName,
        leftEmail: input.email,
        rightEmail: row.email,
        leftPhone: input.phone,
        rightPhone: row.phone,
        leftVat: input.vatNumber,
        rightVat: row.vatNumber,
        leftXeroContactIds: [],
        rightXeroContactIds: [],
      });
      if (
        classification.confidenceLabel === 'LIKELY_DIFFERENT' ||
        (classification.confidenceLabel === 'REVIEW_REQUIRED' &&
          classification.score < 20 &&
          !classification.matchSignals.length)
      ) {
        continue;
      }
      if (classification.score < 35 && !classification.matchSignals.length) continue;
      candidates.push({
        id: row.id,
        name: row.companyName?.trim() || row.name,
        confidenceLabel: classification.confidenceLabel,
        matchSignals: classification.matchSignals,
        suggestedResolution: classification.suggestedResolution,
        href: `/crm/${row.id}`,
      });
    }

    return {
      warning: candidates.length > 0,
      message:
        candidates.length > 0
          ? 'Possible existing customer — open existing, continue with confirmation, or associate as different person. Never auto-merge.'
          : null,
      candidates: candidates.slice(0, 10),
      autoMerge: false as const,
      autoBlock: false as const,
      nameKey,
    };
  }

  async proveCrcRowanReadOnly(actor: ReconciliationActor) {
    this.assertAccess(actor);
    const crc = CUSTOMER_DUPLICATE_RECONCILIATION_CRC.canonicalCustomerId;
    const rowan = CUSTOMER_DUPLICATE_RECONCILIATION_CRC.rowanSourceCustomerId;

    const [crcRow] = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.companyId, actor.companyId), eq(customers.id, crc)))
      .limit(1);
    const [rowanRow] = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.companyId, actor.companyId), eq(customers.id, rowan)))
      .limit(1);

    const people = await this.db
      .select()
      .from(customerPeople)
      .where(
        and(
          eq(customerPeople.companyId, actor.companyId),
          eq(customerPeople.customerId, crc),
          eq(customerPeople.linkedSourceCustomerId, rowan),
        ),
      )
      .limit(5);

    const [assoc] = await this.db
      .select()
      .from(customerSourceAssociations)
      .where(
        and(
          eq(customerSourceAssociations.companyId, actor.companyId),
          eq(customerSourceAssociations.canonicalCustomerId, crc),
          eq(customerSourceAssociations.sourceCustomerId, rowan),
          eq(customerSourceAssociations.status, 'active'),
        ),
      )
      .limit(1);

    const [rowanXero] = await this.db
      .select()
      .from(xeroCustomerMappings)
      .where(
        and(
          eq(xeroCustomerMappings.companyId, actor.companyId),
          eq(xeroCustomerMappings.customerId, rowan),
        ),
      )
      .limit(1);

    const [quote] = await this.db
      .select({ id: quotes.id, customerId: quotes.customerId, quoteNumber: quotes.quoteNumber })
      .from(quotes)
      .where(
        and(
          eq(quotes.companyId, actor.companyId),
          eq(quotes.id, CUSTOMER_DUPLICATE_RECONCILIATION_CRC.royalCapeQuoteId),
        ),
      )
      .limit(1);

    const classification = classifyDuplicateCandidate({
      leftCustomerId: crc,
      rightCustomerId: rowan,
      leftName: crcRow?.name ?? 'CRC',
      rightName: rowanRow?.name ?? 'Rowan',
      leftXeroContactIds: [CUSTOMER_DUPLICATE_RECONCILIATION_CRC.xeroContactId],
      rightXeroContactIds: [CUSTOMER_DUPLICATE_RECONCILIATION_CRC.rowanXeroContactId],
      alreadyAssociated: Boolean(assoc),
    });

    assertCrcRowanRegression({
      canonicalCustomerId: crc,
      rowanSourceCustomerId: rowan,
      rowanPersonExists: people.length > 0,
      associationActive: Boolean(assoc),
      rowanXeroContactId: rowanXero?.xeroContactId ?? null,
      royalCapeQuoteCustomerId: quote?.customerId ?? '',
      crcDestructivelyMerged: Boolean(crcRow?.mergedIntoCustomerId),
    });

    return {
      classification: classification.confidenceLabel,
      suggestedResolution: classification.suggestedResolution,
      crcPreserved: !crcRow?.mergedIntoCustomerId,
      rowanPreserved: Boolean(rowanRow) && !rowanRow?.mergedIntoCustomerId,
      personPreserved: people.length > 0,
      associationPreserved: Boolean(assoc),
      rowanXeroContactId: rowanXero?.xeroContactId ?? null,
      royalCapeQuoteNumber: quote?.quoteNumber ?? null,
      royalCapeQuoteCustomerId: quote?.customerId ?? null,
      executeMerge: false as const,
      xeroWrites: 0 as const,
    };
  }

  private async loadReconciliation(companyId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(customerDuplicateReconciliations)
      .where(
        and(
          eq(customerDuplicateReconciliations.companyId, companyId),
          eq(customerDuplicateReconciliations.id, id),
        ),
      )
      .limit(1);
    if (!row) {
      throw new CustomerDuplicateReconciliationError('NOT_FOUND', 'Reconciliation case not found.');
    }
    return row;
  }

  private async loadCustomer(companyId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.companyId, companyId), eq(customers.id, id)))
      .limit(1);
    if (!row) throw new CustomerDuplicateReconciliationError('NOT_FOUND', 'Customer not found.');
    return row;
  }

  private async countPeople(companyId: string, customerIds: string[]) {
    const map = new Map<string, number>();
    if (!customerIds.length) return map;
    const rows = await this.db
      .select({
        customerId: customerPeople.customerId,
        c: sql<number>`count(*)::int`,
      })
      .from(customerPeople)
      .where(
        and(
          eq(customerPeople.companyId, companyId),
          inArray(customerPeople.customerId, customerIds),
        ),
      )
      .groupBy(customerPeople.customerId);
    for (const r of rows) map.set(r.customerId, Number(r.c));
    return map;
  }

  private async countPeopleOne(companyId: string, customerId: string) {
    const m = await this.countPeople(companyId, [customerId]);
    return m.get(customerId) ?? 0;
  }

  private async quoteOwnership(companyId: string, customerIds: string[]) {
    if (!customerIds.length) return [];
    return this.db
      .select({ id: quotes.id, customerId: quotes.customerId })
      .from(quotes)
      .where(and(eq(quotes.companyId, companyId), inArray(quotes.customerId, customerIds)));
  }

  private async computePreviewHash(
    actor: ReconciliationActor,
    leftCustomerId: string,
    rightCustomerId: string,
    candidateId: string | null,
    canonicalCustomerId: string,
    secondaryCustomerId: string,
    resolutionType: DuplicateResolutionType,
  ) {
    const preview = await this.mergeService.previewMerge(
      actor,
      leftCustomerId,
      rightCustomerId,
      candidateId,
    );
    return buildReconciliationPreviewHash({
      canonicalCustomerId,
      secondaryCustomerId,
      resolutionType,
      leftUpdatedAt: preview.left.updatedAt,
      rightUpdatedAt: preview.right.updatedAt,
      leftXeroContactIds: preview.left.xeroContactIds,
      rightXeroContactIds: preview.right.xeroContactIds,
      leftLinkCounts: preview.left.linkCounts,
      rightLinkCounts: preview.right.linkCounts,
    });
  }
}

// Re-export merge error for route mapping convenience
export { CustomerDuplicateMergeError };
