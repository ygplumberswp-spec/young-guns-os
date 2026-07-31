import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  BuyerClassification,
  BuyerClassificationEvidenceItem,
  BuyerClassificationSummary,
  ContactVerificationState,
  CorrectCustomerContactRequest,
  CreateMarketingAudienceRequestInput,
  CreateXeroSyncBackRequestInput,
  CustomerContactCorrectionSummary,
  CustomerContactFieldSummary,
  CustomerMarketingConsentSummary,
  MarketingAudienceRequestSummary,
  ReactivationEligibilityCounts,
  ReactivationEligibilityReason,
  ReactivationEligibilityStatus,
  ReactivationEligibilitySummary,
  UpsertMarketingConsentRequest,
  XeroContactSyncBackRequestSummary,
} from '@titan/shared';
import {
  classifyBuyerFromEvidence,
  HUMAN_QUALITY_CONTENT_STANDARD,
  isMarketingConsentGranted,
  isPlaceholderEmail,
  isValidEmailAddress,
  normalizeSaPhone,
} from '@titan/shared';
import { isCompanyOwnerRole } from '@titan/auth';
import type { DatabaseClient } from '@titan/db';
import {
  customerBuyerClassifications,
  customerContactCorrections,
  customerContactFields,
  customerMarketingConsentAudits,
  customerMarketingConsents,
  customerSupportConversations,
  customers,
  integrationConnections,
  invoices,
  marketingAudienceRequests,
  marketingReactivationEligibility,
  xeroContactSyncBackRequests,
  xeroCustomerMappings,
} from '@titan/db';

export class MarketingEligibilityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MarketingEligibilityError';
  }
}

export type MarketingEligibilityScope = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

const PAID_BUYER_PRIMARY_CLASSIFICATIONS = new Set<BuyerClassification>([
  'paid_buyer',
  'repeat_buyer',
  'inactive_reactivation_candidate',
]);

export class MarketingEligibilityService {
  constructor(private readonly db: DatabaseClient) {}

  // --- Classification (Decision 3 / UX-H) ------------------------------------

  async recomputeClassifications(
    companyId: string,
    opts: { clientActionId?: string | null } = {},
  ): Promise<BuyerClassificationSummary[]> {
    // Recompute is naturally idempotent (upsert by company+customer, same evidence
    // always yields the same row). clientActionId is accepted for API symmetry /
    // future audit correlation but is not required for idempotency here.
    void opts.clientActionId;

    const customerRows = await this.db.select().from(customers).where(eq(customers.companyId, companyId));
    if (customerRows.length === 0) return [];

    const customerIds = customerRows.map((row) => row.id);

    const invoiceRows = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), inArray(invoices.customerId, customerIds)));

    const mappingRows = await this.db
      .select()
      .from(xeroCustomerMappings)
      .where(
        and(
          eq(xeroCustomerMappings.companyId, companyId),
          inArray(xeroCustomerMappings.customerId, customerIds),
        ),
      );

    const invoicesByCustomer = new Map<string, typeof invoiceRows>();
    for (const invoice of invoiceRows) {
      const list = invoicesByCustomer.get(invoice.customerId) ?? [];
      list.push(invoice);
      invoicesByCustomer.set(invoice.customerId, list);
    }

    const xeroContactByCustomer = new Map<string, string>();
    for (const mapping of mappingRows) {
      if (mapping.xeroContactId) {
        xeroContactByCustomer.set(mapping.customerId, mapping.xeroContactId);
      }
    }

    const results: BuyerClassificationSummary[] = [];

    for (const customer of customerRows) {
      const customerInvoices = invoicesByCustomer.get(customer.id) ?? [];
      const xeroContactId = xeroContactByCustomer.get(customer.id) ?? null;

      const classification = classifyBuyerFromEvidence({
        customerId: customer.id,
        customerName: customer.name,
        customerStatus: customer.status,
        isSupplierOnly: customer.isSupplierOnly,
        xeroContactId,
        invoices: customerInvoices.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          amountCents: invoice.amountCents,
          amountPaidCents: invoice.amountPaidCents,
          totalCents: invoice.totalCents,
          issuedAt: invoice.issuedAt ? invoice.issuedAt.toISOString() : null,
          updatedAt: invoice.updatedAt.toISOString(),
        })),
      });

      const now = new Date();
      const [row] = await this.db
        .insert(customerBuyerClassifications)
        .values({
          companyId,
          customerId: customer.id,
          primaryClassification: classification.primaryClassification,
          isAccrecBuyer: classification.isAccrecBuyer,
          isPaidBuyer: classification.isPaidBuyer,
          isRepeatBuyer: classification.isRepeatBuyer,
          isSupplierOnly: classification.isSupplierOnly,
          qualifyingInvoiceCount: classification.qualifyingInvoiceCount,
          paidInvoiceCount: classification.paidInvoiceCount,
          lastPaidAt: classification.lastPaidAt ? new Date(classification.lastPaidAt) : null,
          lastQualifyingAt: classification.lastQualifyingAt
            ? new Date(classification.lastQualifyingAt)
            : null,
          xeroContactId,
          evidence: classification.evidence,
          reason: classification.reason,
          computedAt: now,
        })
        .onConflictDoUpdate({
          target: [customerBuyerClassifications.companyId, customerBuyerClassifications.customerId],
          set: {
            primaryClassification: classification.primaryClassification,
            isAccrecBuyer: classification.isAccrecBuyer,
            isPaidBuyer: classification.isPaidBuyer,
            isRepeatBuyer: classification.isRepeatBuyer,
            isSupplierOnly: classification.isSupplierOnly,
            qualifyingInvoiceCount: classification.qualifyingInvoiceCount,
            paidInvoiceCount: classification.paidInvoiceCount,
            lastPaidAt: classification.lastPaidAt ? new Date(classification.lastPaidAt) : null,
            lastQualifyingAt: classification.lastQualifyingAt
              ? new Date(classification.lastQualifyingAt)
              : null,
            xeroContactId,
            evidence: classification.evidence,
            reason: classification.reason,
            computedAt: now,
            updatedAt: now,
          },
        })
        .returning();

      results.push(toClassificationSummary(row!, customer.name));
    }

    return results;
  }

  async listClassifications(
    companyId: string,
    filters?: { classification?: string; isPaidBuyer?: boolean },
  ): Promise<BuyerClassificationSummary[]> {
    const rows = await this.db
      .select({ classification: customerBuyerClassifications, customerName: customers.name })
      .from(customerBuyerClassifications)
      .innerJoin(customers, eq(customers.id, customerBuyerClassifications.customerId))
      .where(eq(customerBuyerClassifications.companyId, companyId))
      .orderBy(desc(customerBuyerClassifications.computedAt));

    let filtered = rows;
    if (filters?.classification) {
      filtered = filtered.filter(
        (row) => row.classification.primaryClassification === filters.classification,
      );
    }
    if (filters?.isPaidBuyer !== undefined) {
      filtered = filtered.filter((row) => row.classification.isPaidBuyer === filters.isPaidBuyer);
    }

    return filtered.map((row) => toClassificationSummary(row.classification, row.customerName));
  }

  // --- Contact quality ---------------------------------------------------

  async ensureContactQualityFromCustomer(
    companyId: string,
    customerId: string,
  ): Promise<CustomerContactFieldSummary[]> {
    const customer = await this.getCustomerRow(companyId, customerId);

    const fieldValues: Array<{ fieldKey: 'name' | 'contact_person' | 'email' | 'phone'; value: string | null }> = [
      { fieldKey: 'name', value: customer.name },
      { fieldKey: 'contact_person', value: customer.contactPerson },
      { fieldKey: 'email', value: customer.email },
      { fieldKey: 'phone', value: customer.phone },
    ];

    for (const field of fieldValues) {
      const isEmailPlaceholder = field.fieldKey === 'email' && isPlaceholderEmail(field.value);

      const existingRows = await this.db
        .select()
        .from(customerContactFields)
        .where(
          and(
            eq(customerContactFields.companyId, companyId),
            eq(customerContactFields.customerId, customerId),
            eq(customerContactFields.fieldKey, field.fieldKey),
          ),
        );
      const existing = existingRows[0];

      if (!existing) {
        await this.db.insert(customerContactFields).values({
          companyId,
          customerId,
          fieldKey: field.fieldKey,
          value: field.value,
          source: 'customer_record',
          verificationState: isEmailPlaceholder ? 'placeholder' : 'unknown',
          isSharedCompanyEmail: isEmailPlaceholder,
        });
      } else {
        const valueChanged = existing.value !== field.value;
        const nextVerificationState: ContactVerificationState = isEmailPlaceholder
          ? 'placeholder'
          : valueChanged
            ? 'unknown'
            : existing.verificationState;

        await this.db
          .update(customerContactFields)
          .set({
            value: field.value,
            verificationState: nextVerificationState,
            isSharedCompanyEmail: isEmailPlaceholder,
            updatedAt: new Date(),
          })
          .where(eq(customerContactFields.id, existing.id));
      }
    }

    return this.listContactFields(companyId, customerId);
  }

  async correctContact(
    scope: MarketingEligibilityScope,
    customerId: string,
    input: CorrectCustomerContactRequest,
  ): Promise<CustomerContactFieldSummary> {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new MarketingEligibilityError('VALIDATION_ERROR', 'Correction reason is required');
    }

    const customer = await this.getCustomerRow(scope.companyId, customerId);

    let normalizedValue: string | null = input.value?.trim() ? input.value.trim() : null;

    if (input.fieldKey === 'phone' && normalizedValue) {
      const normalizedPhone = normalizeSaPhone(normalizedValue);
      if (!normalizedPhone) {
        throw new MarketingEligibilityError(
          'VALIDATION_ERROR',
          'Phone must be a valid South African mobile or landline number',
        );
      }
      normalizedValue = normalizedPhone;
    }

    if (input.fieldKey === 'email' && normalizedValue) {
      if (!isValidEmailAddress(normalizedValue)) {
        throw new MarketingEligibilityError('VALIDATION_ERROR', 'Email address is invalid');
      }
      normalizedValue = normalizedValue.toLowerCase();
    }

    const oldValue =
      input.fieldKey === 'name'
        ? customer.name
        : input.fieldKey === 'contact_person'
          ? customer.contactPerson
          : input.fieldKey === 'email'
            ? customer.email
            : customer.phone;

    // Never call Xero from a contact correction — TITAN-side truth only.
    if (input.fieldKey === 'name') {
      if (!normalizedValue) {
        throw new MarketingEligibilityError('VALIDATION_ERROR', 'Customer name cannot be cleared');
      }
      await this.db
        .update(customers)
        .set({ name: normalizedValue, updatedAt: new Date() })
        .where(and(eq(customers.id, customerId), eq(customers.companyId, scope.companyId)));
    } else if (input.fieldKey === 'contact_person') {
      await this.db
        .update(customers)
        .set({ contactPerson: normalizedValue, updatedAt: new Date() })
        .where(and(eq(customers.id, customerId), eq(customers.companyId, scope.companyId)));
    } else if (input.fieldKey === 'email') {
      await this.db
        .update(customers)
        .set({ email: normalizedValue, updatedAt: new Date() })
        .where(and(eq(customers.id, customerId), eq(customers.companyId, scope.companyId)));
    } else {
      await this.db
        .update(customers)
        .set({ phone: normalizedValue, updatedAt: new Date() })
        .where(and(eq(customers.id, customerId), eq(customers.companyId, scope.companyId)));
    }

    const isEmailPlaceholder = input.fieldKey === 'email' && isPlaceholderEmail(normalizedValue);
    const verificationState: ContactVerificationState = isEmailPlaceholder
      ? 'placeholder'
      : input.markVerified
        ? 'verified'
        : 'unverified';

    const existingRows = await this.db
      .select()
      .from(customerContactFields)
      .where(
        and(
          eq(customerContactFields.companyId, scope.companyId),
          eq(customerContactFields.customerId, customerId),
          eq(customerContactFields.fieldKey, input.fieldKey),
        ),
      );
    const existing = existingRows[0];
    const source = input.source?.trim() || 'staff_correction';

    let contactFieldRow: typeof customerContactFields.$inferSelect | undefined;
    if (existing) {
      [contactFieldRow] = await this.db
        .update(customerContactFields)
        .set({
          value: normalizedValue,
          source,
          verificationState,
          isSharedCompanyEmail: isEmailPlaceholder,
          verifiedAt: verificationState === 'verified' ? new Date() : existing.verifiedAt,
          verifiedByUserId: verificationState === 'verified' ? scope.userId : existing.verifiedByUserId,
          updatedAt: new Date(),
        })
        .where(eq(customerContactFields.id, existing.id))
        .returning();
    } else {
      [contactFieldRow] = await this.db
        .insert(customerContactFields)
        .values({
          companyId: scope.companyId,
          customerId,
          fieldKey: input.fieldKey,
          value: normalizedValue,
          source,
          verificationState,
          isSharedCompanyEmail: isEmailPlaceholder,
          verifiedAt: verificationState === 'verified' ? new Date() : null,
          verifiedByUserId: verificationState === 'verified' ? scope.userId : null,
        })
        .returning();
    }

    await this.db.insert(customerContactCorrections).values({
      companyId: scope.companyId,
      customerId,
      fieldKey: input.fieldKey,
      oldValue,
      newValue: normalizedValue,
      reason,
      changedByUserId: scope.userId,
    });

    return toContactFieldSummary(contactFieldRow!);
  }

  async listContactFields(
    companyId: string,
    customerId: string,
  ): Promise<CustomerContactFieldSummary[]> {
    const rows = await this.db
      .select()
      .from(customerContactFields)
      .where(
        and(
          eq(customerContactFields.companyId, companyId),
          eq(customerContactFields.customerId, customerId),
        ),
      );
    return rows.map(toContactFieldSummary);
  }

  async listContactCorrections(
    companyId: string,
    customerId: string,
  ): Promise<CustomerContactCorrectionSummary[]> {
    const rows = await this.db
      .select()
      .from(customerContactCorrections)
      .where(
        and(
          eq(customerContactCorrections.companyId, companyId),
          eq(customerContactCorrections.customerId, customerId),
        ),
      )
      .orderBy(desc(customerContactCorrections.createdAt));
    return rows.map(toContactCorrectionSummary);
  }

  // --- Marketing consent ---------------------------------------------------

  async upsertConsent(
    scope: MarketingEligibilityScope,
    customerId: string,
    input: UpsertMarketingConsentRequest,
  ): Promise<CustomerMarketingConsentSummary> {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new MarketingEligibilityError('VALIDATION_ERROR', 'Consent change reason is required');
    }

    await this.getCustomerRow(scope.companyId, customerId);

    const existingRows = await this.db
      .select()
      .from(customerMarketingConsents)
      .where(
        and(
          eq(customerMarketingConsents.companyId, scope.companyId),
          eq(customerMarketingConsents.customerId, customerId),
          eq(customerMarketingConsents.channel, input.channel),
        ),
      );
    const existing = existingRows[0];
    const previousStatus = existing?.status ?? null;
    const now = new Date();

    const values = {
      companyId: scope.companyId,
      customerId,
      channel: input.channel,
      status: input.status,
      lawfulBasis: input.lawfulBasis?.trim() || null,
      captureSource: input.captureSource?.trim() || null,
      wordingVersion: input.wordingVersion?.trim() || null,
      notes: input.notes?.trim() || null,
      capturedAt: input.status === 'granted' ? now : existing?.capturedAt ?? null,
      capturedByUserId: input.status === 'granted' ? scope.userId : existing?.capturedByUserId ?? null,
      withdrawnAt: input.status === 'withdrawn' ? now : existing?.withdrawnAt ?? null,
      updatedAt: now,
    };

    let row: typeof customerMarketingConsents.$inferSelect | undefined;
    if (existing) {
      [row] = await this.db
        .update(customerMarketingConsents)
        .set(values)
        .where(eq(customerMarketingConsents.id, existing.id))
        .returning();
    } else {
      [row] = await this.db.insert(customerMarketingConsents).values(values).returning();
    }

    await this.db.insert(customerMarketingConsentAudits).values({
      companyId: scope.companyId,
      customerId,
      channel: input.channel,
      previousStatus,
      newStatus: input.status,
      reason,
      changedByUserId: scope.userId,
    });

    return toConsentSummary(row!);
  }

  async listConsents(
    companyId: string,
    customerId?: string,
  ): Promise<CustomerMarketingConsentSummary[]> {
    const conditions = [eq(customerMarketingConsents.companyId, companyId)];
    if (customerId) conditions.push(eq(customerMarketingConsents.customerId, customerId));

    const rows = await this.db
      .select()
      .from(customerMarketingConsents)
      .where(and(...conditions))
      .orderBy(desc(customerMarketingConsents.updatedAt));
    return rows.map(toConsentSummary);
  }

  // --- Reactivation eligibility ---------------------------------------------------

  async recomputeEligibility(companyId: string): Promise<ReactivationEligibilitySummary[]> {
    const customerRows = await this.db.select().from(customers).where(eq(customers.companyId, companyId));
    if (customerRows.length === 0) return [];

    const customerIds = customerRows.map((row) => row.id);

    const classificationRows = await this.db
      .select()
      .from(customerBuyerClassifications)
      .where(
        and(
          eq(customerBuyerClassifications.companyId, companyId),
          inArray(customerBuyerClassifications.customerId, customerIds),
        ),
      );
    const classificationByCustomer = new Map(classificationRows.map((row) => [row.customerId, row]));

    const contactFieldRows = await this.db
      .select()
      .from(customerContactFields)
      .where(
        and(
          eq(customerContactFields.companyId, companyId),
          inArray(customerContactFields.customerId, customerIds),
        ),
      );
    const emailFieldByCustomer = new Map<string, typeof contactFieldRows[number]>();
    const phoneFieldByCustomer = new Map<string, typeof contactFieldRows[number]>();
    for (const row of contactFieldRows) {
      if (row.fieldKey === 'email') emailFieldByCustomer.set(row.customerId, row);
      if (row.fieldKey === 'phone') phoneFieldByCustomer.set(row.customerId, row);
    }

    const consentRows = await this.db
      .select()
      .from(customerMarketingConsents)
      .where(
        and(
          eq(customerMarketingConsents.companyId, companyId),
          inArray(customerMarketingConsents.customerId, customerIds),
        ),
      );
    const consentsByCustomer = new Map<string, typeof consentRows>();
    for (const row of consentRows) {
      const list = consentsByCustomer.get(row.customerId) ?? [];
      list.push(row);
      consentsByCustomer.set(row.customerId, list);
    }

    let sensitiveCustomerIds = new Set<string>();
    try {
      const sensitiveRows = await this.db
        .select({ customerId: customerSupportConversations.customerId })
        .from(customerSupportConversations)
        .where(
          and(
            eq(customerSupportConversations.companyId, companyId),
            eq(customerSupportConversations.status, 'open'),
            inArray(customerSupportConversations.customerId, customerIds),
            sql`(${customerSupportConversations.subject} ILIKE '%complaint%' OR ${customerSupportConversations.subject} ILIKE '%dispute%')`,
          ),
        );
      sensitiveCustomerIds = new Set(sensitiveRows.map((row) => row.customerId));
    } catch {
      // Customer support schema unavailable in this environment — skip the sensitive check.
      sensitiveCustomerIds = new Set();
    }

    const now = new Date();
    const results: ReactivationEligibilitySummary[] = [];

    for (const customer of customerRows) {
      const classification = classificationByCustomer.get(customer.id) ?? null;
      const emailField = emailFieldByCustomer.get(customer.id) ?? null;
      const phoneField = phoneFieldByCustomer.get(customer.id) ?? null;
      const consents = consentsByCustomer.get(customer.id) ?? [];

      const { status, reasons, preferredChannel } = computeEligibilityDecision({
        customer,
        classification,
        emailField,
        phoneField,
        consents,
        isSensitive: sensitiveCustomerIds.has(customer.id),
      });

      const evidence = {
        classification: classification?.primaryClassification ?? null,
        isPaidBuyer: classification?.isPaidBuyer ?? false,
        emailVerificationState: emailField?.verificationState ?? null,
        phoneVerificationState: phoneField?.verificationState ?? null,
        consentChannels: consents.map((consent) => ({ channel: consent.channel, status: consent.status })),
      };

      const [row] = await this.db
        .insert(marketingReactivationEligibility)
        .values({
          companyId,
          customerId: customer.id,
          eligibilityStatus: status,
          preferredChannel,
          reasons,
          evidence,
          computedAt: now,
        })
        .onConflictDoUpdate({
          target: [marketingReactivationEligibility.companyId, marketingReactivationEligibility.customerId],
          set: {
            eligibilityStatus: status,
            preferredChannel,
            reasons,
            evidence,
            computedAt: now,
            updatedAt: now,
          },
        })
        .returning();

      results.push(
        toEligibilitySummary(
          row!,
          customer.name,
          classification?.primaryClassification ?? null,
          classification?.isPaidBuyer ?? false,
          emailField?.verificationState ?? null,
          phoneField?.verificationState ?? null,
          customer.doNotContact,
        ),
      );
    }

    return results;
  }

  async listEligibility(
    companyId: string,
    filters?: { status?: string },
  ): Promise<ReactivationEligibilitySummary[]> {
    const rows = await this.db
      .select({
        eligibility: marketingReactivationEligibility,
        customerName: customers.name,
        customerDoNotContact: customers.doNotContact,
      })
      .from(marketingReactivationEligibility)
      .innerJoin(customers, eq(customers.id, marketingReactivationEligibility.customerId))
      .where(eq(marketingReactivationEligibility.companyId, companyId))
      .orderBy(desc(marketingReactivationEligibility.computedAt));

    const classificationRows = await this.db
      .select()
      .from(customerBuyerClassifications)
      .where(eq(customerBuyerClassifications.companyId, companyId));
    const classificationByCustomer = new Map(classificationRows.map((row) => [row.customerId, row]));

    const contactRows = await this.db
      .select()
      .from(customerContactFields)
      .where(eq(customerContactFields.companyId, companyId));
    const emailByCustomer = new Map<string, typeof contactRows[number]>();
    const phoneByCustomer = new Map<string, typeof contactRows[number]>();
    for (const row of contactRows) {
      if (row.fieldKey === 'email') emailByCustomer.set(row.customerId, row);
      if (row.fieldKey === 'phone') phoneByCustomer.set(row.customerId, row);
    }

    const filtered = filters?.status
      ? rows.filter((row) => row.eligibility.eligibilityStatus === filters.status)
      : rows;

    return filtered.map((row) => {
      const classification = classificationByCustomer.get(row.eligibility.customerId) ?? null;
      return toEligibilitySummary(
        row.eligibility,
        row.customerName,
        classification?.primaryClassification ?? null,
        classification?.isPaidBuyer ?? false,
        emailByCustomer.get(row.eligibility.customerId)?.verificationState ?? null,
        phoneByCustomer.get(row.eligibility.customerId)?.verificationState ?? null,
        row.customerDoNotContact,
      );
    });
  }

  async getEligibilityCounts(companyId: string): Promise<ReactivationEligibilityCounts> {
    const rows = await this.db
      .select({ status: marketingReactivationEligibility.eligibilityStatus })
      .from(marketingReactivationEligibility)
      .where(eq(marketingReactivationEligibility.companyId, companyId));

    const counts: ReactivationEligibilityCounts = {
      eligible: 0,
      excluded: 0,
      blocked: 0,
      awaitingVerification: 0,
      total: rows.length,
    };

    for (const row of rows) {
      if (row.status === 'eligible') counts.eligible += 1;
      else if (row.status === 'excluded') counts.excluded += 1;
      else if (row.status === 'blocked') counts.blocked += 1;
      else if (row.status === 'awaiting_verification') counts.awaitingVerification += 1;
    }

    return counts;
  }

  // --- Audience requests (never provider-sent) ------------------------------------

  async createAudienceRequest(
    scope: MarketingEligibilityScope,
    input: CreateMarketingAudienceRequestInput,
  ): Promise<MarketingAudienceRequestSummary> {
    if (input.clientActionId) {
      const existing = await this.findAudienceRequestByClientActionId(
        scope.companyId,
        input.clientActionId,
      );
      if (existing) return toAudienceRequestSummary(existing, true);
    }

    const name = input.name?.trim();
    if (!name) {
      throw new MarketingEligibilityError('VALIDATION_ERROR', 'Audience request name is required');
    }

    const eligibleRows = await this.db
      .select({ customerId: marketingReactivationEligibility.customerId })
      .from(marketingReactivationEligibility)
      .where(
        and(
          eq(marketingReactivationEligibility.companyId, scope.companyId),
          eq(marketingReactivationEligibility.eligibilityStatus, 'eligible'),
        ),
      );
    const memberIds = eligibleRows.map((row) => row.customerId);

    try {
      const [created] = await this.db
        .insert(marketingAudienceRequests)
        .values({
          companyId: scope.companyId,
          name,
          criteria: input.criteria ?? {},
          exclusions: input.exclusions ?? {},
          memberCustomerIds: memberIds,
          memberCount: memberIds.length,
          status: 'draft',
          deliveryState: 'not_sent',
          requestedByUserId: scope.userId,
          notes: input.notes?.trim() || null,
          clientActionId: input.clientActionId ?? null,
        })
        .returning();

      return toAudienceRequestSummary(created!, false);
    } catch (error) {
      if (input.clientActionId) {
        const existing = await this.findAudienceRequestByClientActionId(
          scope.companyId,
          input.clientActionId,
        );
        if (existing) return toAudienceRequestSummary(existing, true);
      }
      throw error;
    }
  }

  async listAudienceRequests(companyId: string): Promise<MarketingAudienceRequestSummary[]> {
    const rows = await this.db
      .select()
      .from(marketingAudienceRequests)
      .where(eq(marketingAudienceRequests.companyId, companyId))
      .orderBy(desc(marketingAudienceRequests.createdAt));
    return rows.map((row) => toAudienceRequestSummary(row, false));
  }

  async submitAudienceRequestForApproval(
    scope: MarketingEligibilityScope,
    requestId: string,
  ): Promise<MarketingAudienceRequestSummary> {
    const existing = await this.ensureAudienceRequest(scope.companyId, requestId);
    if (existing.status !== 'draft') {
      throw new MarketingEligibilityError(
        'VALIDATION_ERROR',
        'Audience request must be in draft to submit for approval',
      );
    }
    const [updated] = await this.db
      .update(marketingAudienceRequests)
      .set({ status: 'pending_approval', updatedAt: new Date() })
      .where(eq(marketingAudienceRequests.id, requestId))
      .returning();
    return toAudienceRequestSummary(updated!, false);
  }

  async approveAudienceRequest(
    scope: MarketingEligibilityScope,
    requestId: string,
  ): Promise<MarketingAudienceRequestSummary> {
    if (!canApproveAudience(scope)) {
      throw new MarketingEligibilityError(
        'FORBIDDEN',
        'Only Company Owner or marketing_intelligence:manage may approve audience requests',
      );
    }

    const existing = await this.ensureAudienceRequest(scope.companyId, requestId);
    if (existing.status !== 'pending_approval') {
      throw new MarketingEligibilityError(
        'VALIDATION_ERROR',
        'Audience request is not pending approval',
      );
    }

    const [updated] = await this.db
      .update(marketingAudienceRequests)
      .set({
        status: 'approved',
        approvedByUserId: scope.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(marketingAudienceRequests.id, requestId))
      .returning();

    // deliveryState remains 'not_sent' — approval authorizes future sending, it is never itself a send.
    return toAudienceRequestSummary(updated!, false);
  }

  async rejectAudienceRequest(
    scope: MarketingEligibilityScope,
    requestId: string,
    rejectionReason: string,
  ): Promise<MarketingAudienceRequestSummary> {
    const trimmedReason = rejectionReason?.trim();
    if (!trimmedReason) {
      throw new MarketingEligibilityError('VALIDATION_ERROR', 'Rejection reason is required');
    }

    const existing = await this.ensureAudienceRequest(scope.companyId, requestId);
    if (existing.status !== 'pending_approval' && existing.status !== 'draft') {
      throw new MarketingEligibilityError(
        'VALIDATION_ERROR',
        'Audience request cannot be rejected from its current status',
      );
    }

    const [updated] = await this.db
      .update(marketingAudienceRequests)
      .set({ status: 'rejected', rejectionReason: trimmedReason, updatedAt: new Date() })
      .where(eq(marketingAudienceRequests.id, requestId))
      .returning();

    return toAudienceRequestSummary(updated!, false);
  }

  // --- Xero contact sync-back boundary (never calls Xero) ------------------------------

  async createXeroSyncBackRequest(
    scope: MarketingEligibilityScope,
    input: CreateXeroSyncBackRequestInput,
  ): Promise<XeroContactSyncBackRequestSummary> {
    await this.getCustomerRow(scope.companyId, input.customerId);

    if (!input.requestedFields?.length) {
      throw new MarketingEligibilityError(
        'VALIDATION_ERROR',
        'At least one requested field is required',
      );
    }

    if (input.clientActionId) {
      const existingRows = await this.db
        .select()
        .from(xeroContactSyncBackRequests)
        .where(
          and(
            eq(xeroContactSyncBackRequests.companyId, scope.companyId),
            eq(xeroContactSyncBackRequests.clientActionId, input.clientActionId),
          ),
        );
      if (existingRows[0]) return toSyncBackSummary(existingRows[0]);
    }

    const connectedXero = await this.db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.companyId, scope.companyId),
          eq(integrationConnections.provider, 'xero'),
          eq(integrationConnections.status, 'connected'),
        ),
      );
    const status = connectedXero[0] ? 'requested' : 'blocked_no_provider';

    // Honest boundary: TITAN never calls the Xero API from this path, regardless
    // of connection status — this only records the request for a future human/
    // provider-backed sync-back step.
    const [created] = await this.db
      .insert(xeroContactSyncBackRequests)
      .values({
        companyId: scope.companyId,
        customerId: input.customerId,
        requestedFields: input.requestedFields,
        status,
        requestedByUserId: scope.userId,
        notes: input.notes?.trim() || null,
        clientActionId: input.clientActionId ?? null,
      })
      .returning();

    return toSyncBackSummary(created!);
  }

  async listXeroSyncBackRequests(
    companyId: string,
    customerId?: string,
  ): Promise<XeroContactSyncBackRequestSummary[]> {
    const conditions = [eq(xeroContactSyncBackRequests.companyId, companyId)];
    if (customerId) conditions.push(eq(xeroContactSyncBackRequests.customerId, customerId));

    const rows = await this.db
      .select()
      .from(xeroContactSyncBackRequests)
      .where(and(...conditions))
      .orderBy(desc(xeroContactSyncBackRequests.createdAt));
    return rows.map(toSyncBackSummary);
  }

  // --- Human-Quality Content Standard (future marketing requirement) ------------------

  getHumanQualityContentStandard() {
    return HUMAN_QUALITY_CONTENT_STANDARD;
  }

  // --- helpers ---------------------------------------------------

  private async getCustomerRow(companyId: string, customerId: string) {
    const rows = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId)));
    if (!rows[0]) throw new MarketingEligibilityError('NOT_FOUND', 'Customer not found');
    return rows[0];
  }

  private async ensureAudienceRequest(companyId: string, requestId: string) {
    const rows = await this.db
      .select()
      .from(marketingAudienceRequests)
      .where(
        and(eq(marketingAudienceRequests.id, requestId), eq(marketingAudienceRequests.companyId, companyId)),
      );
    if (!rows[0]) throw new MarketingEligibilityError('NOT_FOUND', 'Audience request not found');
    return rows[0];
  }

  private async findAudienceRequestByClientActionId(companyId: string, clientActionId: string) {
    const rows = await this.db
      .select()
      .from(marketingAudienceRequests)
      .where(
        and(
          eq(marketingAudienceRequests.companyId, companyId),
          eq(marketingAudienceRequests.clientActionId, clientActionId),
        ),
      );
    return rows[0] ?? null;
  }
}

function canApproveAudience(scope: MarketingEligibilityScope): boolean {
  return (
    isCompanyOwnerRole({ roleName: scope.roleName, permissions: scope.permissions }) ||
    scope.permissions.includes('marketing_intelligence:manage') ||
    scope.permissions.includes('*')
  );
}

function computeEligibilityDecision(input: {
  customer: typeof customers.$inferSelect;
  classification: typeof customerBuyerClassifications.$inferSelect | null;
  emailField: typeof customerContactFields.$inferSelect | null;
  phoneField: typeof customerContactFields.$inferSelect | null;
  consents: Array<typeof customerMarketingConsents.$inferSelect>;
  isSensitive: boolean;
}): {
  status: ReactivationEligibilityStatus;
  reasons: ReactivationEligibilityReason[];
  preferredChannel: typeof customerMarketingConsents.$inferSelect.channel | null;
} {
  const { customer, classification, emailField, phoneField, consents, isSensitive } = input;
  const reasons: ReactivationEligibilityReason[] = [];

  const isPaidBuyerClassification = Boolean(
    classification && PAID_BUYER_PRIMARY_CLASSIFICATIONS.has(classification.primaryClassification),
  );

  if (!classification) {
    reasons.push({
      code: 'not_classified',
      detail: 'No buyer classification computed yet — run classification first.',
    });
    return { status: 'excluded', reasons, preferredChannel: null };
  }

  if (customer.isSupplierOnly || classification.isSupplierOnly) {
    reasons.push({
      code: 'supplier_only',
      detail: 'Supplier-only contact — not a sales/marketing audience member.',
    });
    return { status: 'excluded', reasons, preferredChannel: null };
  }

  if (!isPaidBuyerClassification) {
    reasons.push({
      code: `not_paid_buyer_${classification.primaryClassification}`,
      detail: `Classified as ${classification.primaryClassification} — paid ACCREC invoice evidence is required for marketing eligibility.`,
    });
    return { status: 'excluded', reasons, preferredChannel: null };
  }

  if (isSensitive) {
    reasons.push({
      code: 'open_sensitive_conversation',
      detail: 'Open complaint/dispute support conversation — excluded from marketing until resolved.',
    });
    return { status: 'blocked', reasons, preferredChannel: null };
  }

  if (customer.doNotContact || consents.some((consent) => consent.status === 'do_not_contact')) {
    reasons.push({ code: 'do_not_contact', detail: 'Customer marked do-not-contact.' });
    return { status: 'blocked', reasons, preferredChannel: null };
  }

  if (consents.some((consent) => consent.status === 'denied' || consent.status === 'withdrawn')) {
    reasons.push({
      code: 'consent_denied_or_withdrawn',
      detail: 'Marketing consent denied or withdrawn on at least one channel.',
    });
    return { status: 'blocked', reasons, preferredChannel: null };
  }

  const grantedChannels = consents.filter((consent) => isMarketingConsentGranted(consent.status));
  const verifiedGrantedChannel = grantedChannels.find((consent) => {
    if (consent.channel === 'email') return emailField?.verificationState === 'verified';
    return phoneField?.verificationState === 'verified';
  });

  if (verifiedGrantedChannel) {
    reasons.push({
      code: 'eligible_verified_consent',
      detail: `Paid buyer with granted, verified ${verifiedGrantedChannel.channel} consent.`,
    });
    return { status: 'eligible', reasons, preferredChannel: verifiedGrantedChannel.channel };
  }

  if (grantedChannels.length > 0) {
    reasons.push({
      code: 'contact_unverified',
      detail: 'Consent granted but the matching contact channel is unverified or a placeholder.',
    });
    return { status: 'awaiting_verification', reasons, preferredChannel: null };
  }

  reasons.push({
    code: 'consent_unknown',
    detail: 'Missing or unknown marketing consent — not treated as granted.',
  });
  return { status: 'awaiting_verification', reasons, preferredChannel: null };
}

function toClassificationSummary(
  row: typeof customerBuyerClassifications.$inferSelect,
  customerName: string,
): BuyerClassificationSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName,
    primaryClassification: row.primaryClassification,
    isAccrecBuyer: row.isAccrecBuyer,
    isPaidBuyer: row.isPaidBuyer,
    isRepeatBuyer: row.isRepeatBuyer,
    isSupplierOnly: row.isSupplierOnly,
    qualifyingInvoiceCount: row.qualifyingInvoiceCount,
    paidInvoiceCount: row.paidInvoiceCount,
    lastPaidAt: row.lastPaidAt ? row.lastPaidAt.toISOString() : null,
    lastQualifyingAt: row.lastQualifyingAt ? row.lastQualifyingAt.toISOString() : null,
    xeroContactId: row.xeroContactId,
    evidence: row.evidence as BuyerClassificationEvidenceItem[],
    reason: row.reason,
    computedAt: row.computedAt.toISOString(),
  };
}

function toContactFieldSummary(
  row: typeof customerContactFields.$inferSelect,
): CustomerContactFieldSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    fieldKey: row.fieldKey,
    value: row.value,
    source: row.source,
    verificationState: row.verificationState,
    isSharedCompanyEmail: row.isSharedCompanyEmail,
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    verifiedByUserId: row.verifiedByUserId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toContactCorrectionSummary(
  row: typeof customerContactCorrections.$inferSelect,
): CustomerContactCorrectionSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    fieldKey: row.fieldKey,
    oldValue: row.oldValue,
    newValue: row.newValue,
    reason: row.reason,
    changedByUserId: row.changedByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toConsentSummary(
  row: typeof customerMarketingConsents.$inferSelect,
): CustomerMarketingConsentSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    channel: row.channel,
    status: row.status,
    lawfulBasis: row.lawfulBasis,
    captureSource: row.captureSource,
    wordingVersion: row.wordingVersion,
    capturedAt: row.capturedAt ? row.capturedAt.toISOString() : null,
    capturedByUserId: row.capturedByUserId,
    withdrawnAt: row.withdrawnAt ? row.withdrawnAt.toISOString() : null,
    notes: row.notes,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toEligibilitySummary(
  row: typeof marketingReactivationEligibility.$inferSelect,
  customerName: string,
  classification: BuyerClassification | null,
  isPaidBuyer: boolean,
  emailVerificationState: ContactVerificationState | null,
  phoneVerificationState: ContactVerificationState | null,
  doNotContact: boolean,
): ReactivationEligibilitySummary {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName,
    eligibilityStatus: row.eligibilityStatus,
    preferredChannel: row.preferredChannel,
    reasons: row.reasons as ReactivationEligibilityReason[],
    evidence: row.evidence,
    computedAt: row.computedAt.toISOString(),
    classification,
    isPaidBuyer,
    emailVerificationState,
    phoneVerificationState,
    doNotContact,
  };
}

function toAudienceRequestSummary(
  row: typeof marketingAudienceRequests.$inferSelect,
  idempotentReplay: boolean,
): MarketingAudienceRequestSummary {
  return {
    id: row.id,
    name: row.name,
    criteria: row.criteria,
    exclusions: row.exclusions,
    memberCount: row.memberCount,
    status: row.status,
    deliveryState: 'not_sent',
    requestedByUserId: row.requestedByUserId,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    rejectionReason: row.rejectionReason,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    idempotentReplay,
  };
}

function toSyncBackSummary(
  row: typeof xeroContactSyncBackRequests.$inferSelect,
): XeroContactSyncBackRequestSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    requestedFields: row.requestedFields,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    providerCalled: false,
  };
}
