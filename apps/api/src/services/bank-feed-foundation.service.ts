import { createHash } from 'node:crypto';
import { and, count, desc, eq } from 'drizzle-orm';
import {
  bankAccounts,
  bankFeedConnections,
  bankFeedIntakeEvents,
  bankStatementImportBatches,
  bankTransactions,
  companyPricebookRuleSets,
  integrationConnections,
  securityAuditLogs,
  xeroBankTransactions,
  type DatabaseClient,
} from '@titan/db';
import {
  assertBankFeedIntakeSafety,
  assertNoForbiddenBankCredentials,
  assertRow108SafetyGates,
  assertXlsxStatementIntakeUnavailable,
  bankFeedIdempotencyKey,
  buildBankFeedConnection,
  canManageBankFeedFoundation,
  canViewBankFeedFoundation,
  projectBankConnectionCard,
  redactBankFeedSecretsForApi,
  resolveBankFeedCapability,
  validateStatementIntakeUpload,
} from '@titan/shared';

export class BankFeedFoundationServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'BankFeedFoundationServiceError';
  }
}

export type BankFeedFoundationActor = {
  companyId: string;
  userId?: string | null;
  roleName?: string | null;
  permissions?: string[] | null;
};

export class BankFeedFoundationService {
  constructor(private readonly db: DatabaseClient) {}

  private assertView(actor: BankFeedFoundationActor) {
    const role = (actor.roleName ?? '').toLowerCase();
    if (role.includes('client') || role === 'technician' || role.includes('tech')) {
      throw new BankFeedFoundationServiceError('FORBIDDEN', 'Bank feed foundation denied', 403);
    }
    if (!canViewBankFeedFoundation(actor)) {
      throw new BankFeedFoundationServiceError('FORBIDDEN', 'Bank feed foundation denied', 403);
    }
  }

  private assertManage(actor: BankFeedFoundationActor) {
    const role = (actor.roleName ?? '').toLowerCase();
    if (role.includes('client') || role === 'technician' || role.includes('tech')) {
      throw new BankFeedFoundationServiceError('FORBIDDEN', 'Bank feed manage denied', 403);
    }
    if (!canManageBankFeedFoundation(actor)) {
      throw new BankFeedFoundationServiceError('FORBIDDEN', 'Bank feed manage denied', 403);
    }
  }

  private async assertSafe(companyId: string) {
    const [rule] = await this.db
      .select({ globalAutomationEnabled: companyPricebookRuleSets.globalAutomationEnabled })
      .from(companyPricebookRuleSets)
      .where(eq(companyPricebookRuleSets.companyId, companyId))
      .orderBy(desc(companyPricebookRuleSets.version))
      .limit(1);
    assertRow108SafetyGates({
      row92AutomationEnabled: rule?.globalAutomationEnabled === true,
      rows109to116Started: false,
      row117OcrStarted: false,
      xeroWrites: 0,
      customerSends: 0,
      productionWrites: 0,
      moneyMovement: 0,
    });
    assertBankFeedIntakeSafety();
  }

  private async audit(
    actor: BankFeedFoundationActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action,
      entityType: 'bank_feed_foundation',
      entityId,
      userId: actor.userId ?? null,
      metadata: {
        ...metadata,
        xeroWrites: 0,
        moneyMovement: 0,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private async capabilityForCompany(companyId: string) {
    const providers = await this.db
      .select({ provider: integrationConnections.provider })
      .from(integrationConnections)
      .where(eq(integrationConnections.companyId, companyId));
    const providerIds = [...new Set(providers.map((p) => String(p.provider)))];
    // Never invent FNB/Plaid/Stitch feed — only when a real consent client exists in code.
    return resolveBankFeedCapability({
      legitimateProviderFeedConfigured: false,
      providerIdsPresent: providerIds,
    });
  }

  async getCapability(actor: BankFeedFoundationActor) {
    this.assertView(actor);
    await this.assertSafe(actor.companyId);
    const capability = await this.capabilityForCompany(actor.companyId);
    const xlsx = assertXlsxStatementIntakeUnavailable();
    await this.audit(actor, 'bank_feed.capability_read', actor.companyId, {
      mode: capability.mode,
      liveProviderFeedAvailable: capability.liveProviderFeedAvailable,
    });
    return { capability, xlsx };
  }

  async getOrEnsureConnection(actor: BankFeedFoundationActor) {
    this.assertView(actor);
    await this.assertSafe(actor.companyId);
    const companyId = actor.companyId;
    const capability = await this.capabilityForCompany(companyId);

    const [existing] = await this.db
      .select()
      .from(bankFeedConnections)
      .where(eq(bankFeedConnections.companyId, companyId))
      .orderBy(desc(bankFeedConnections.updatedAt))
      .limit(1);

    if (existing) {
      const draft = buildBankFeedConnection({
        companyId,
        bankName: existing.bankName,
        capability,
        accountNumber: null,
        accountCode: existing.maskedAccountIdentity,
        currency: existing.currency,
        consentProviderReference: existing.consentProviderReference,
        serverTokenReference: existing.serverTokenReference,
        lastAttemptedIntakeAt: existing.lastAttemptedIntakeAt?.toISOString() ?? null,
        lastSuccessfulIntakeAt: existing.lastSuccessfulIntakeAt?.toISOString() ?? null,
      });
      const card = projectBankConnectionCard(draft);
      return redactBankFeedSecretsForApi({
        id: existing.id,
        ...draft,
        card,
      } as Record<string, unknown>);
    }

    const draft = buildBankFeedConnection({
      companyId,
      bankName: 'FNB',
      capability,
    });
    const key = bankFeedIdempotencyKey(['bank-feed-foundation', companyId, 'default']);
    const [inserted] = await this.db
      .insert(bankFeedConnections)
      .values({
        companyId,
        bankName: draft.bankName,
        provider: draft.provider,
        mode: draft.mode,
        status: draft.status,
        consentProviderReference: draft.consentProviderReference,
        maskedAccountIdentity: draft.maskedAccountIdentity,
        currency: draft.currency,
        sourceType: draft.sourceType,
        statusReason: draft.statusReason,
        serverTokenReference: null,
        idempotencyKey: key,
        createdBy: actor.userId ?? null,
        updatedBy: actor.userId ?? null,
      })
      .returning();

    await this.audit(actor, 'bank_feed.connection_ensured', inserted.id, {
      status: inserted.status,
      mode: inserted.mode,
    });

    const card = projectBankConnectionCard(draft);
    return redactBankFeedSecretsForApi({
      id: inserted.id,
      ...draft,
      card,
    } as Record<string, unknown>);
  }

  async previewStatementIntake(
    actor: BankFeedFoundationActor,
    input: {
      filename: string;
      mimeType: string;
      contentBase64: string;
      clientActionId?: string | null;
    },
  ) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);
    assertNoForbiddenBankCredentials(input);

    const buf = Buffer.from(input.contentBase64, 'base64');
    const hash = createHash('sha256').update(buf).digest('hex');
    const preview = validateStatementIntakeUpload({
      filename: input.filename,
      mimeType: input.mimeType,
      contentBytes: buf.length,
      fileHashSha256: hash,
      malformed:
        buf.length > 0 &&
        input.filename.toLowerCase().endsWith('.csv') &&
        !buf.toString('utf8').includes(','),
    });

    const connection = await this.getOrEnsureConnection(actor);
    const connectionId = typeof connection.id === 'string' ? connection.id : null;

    const [event] = await this.db
      .insert(bankFeedIntakeEvents)
      .values({
        companyId: actor.companyId,
        connectionId,
        stage: preview.stage,
        filename: preview.filename,
        fileHashSha256: hash,
        mimeType: input.mimeType,
        formatSupported: preview.formatSupported,
        rowCount: preview.rowCount,
        originalFilePreserved: true,
        autoMatchingPerformed: false,
        reconciliationMutated: false,
        jpePosted: false,
        xeroWrites: 0,
        paymentInitiated: false,
        balanceFabricated: false,
        warnings: preview.warnings,
        errorMessage: preview.error,
        actorUserId: actor.userId ?? null,
      })
      .returning();

    if (connectionId) {
      await this.db
        .update(bankFeedConnections)
        .set({
          lastAttemptedIntakeAt: new Date(),
          updatedBy: actor.userId ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bankFeedConnections.id, connectionId),
            eq(bankFeedConnections.companyId, actor.companyId),
          ),
        );
    }

    await this.audit(actor, 'bank_feed.intake_preview', event.id, {
      stage: preview.stage,
      ok: preview.ok,
      fileHashSha256: hash,
      clientActionId: input.clientActionId ?? null,
    });

    return {
      preview,
      intakeEventId: event.id,
      note: 'Preview only — confirm via existing /finance/bank-statements import. No match/reconcile/JPE/Xero.',
      xeroWrites: 0,
      moneyMovement: 0,
    };
  }

  async stagingAudit(actor: BankFeedFoundationActor) {
    this.assertView(actor);
    await this.assertSafe(actor.companyId);
    const companyId = actor.companyId;

    const providerRows = await this.db
      .select({
        provider: integrationConnections.provider,
        status: integrationConnections.status,
      })
      .from(integrationConnections)
      .where(eq(integrationConnections.companyId, companyId));

    const [[accounts], [txs], [xeroTxs], [batches], [connections], [events]] = await Promise.all([
      this.db.select({ c: count() }).from(bankAccounts).where(eq(bankAccounts.companyId, companyId)),
      this.db
        .select({ c: count() })
        .from(bankTransactions)
        .where(eq(bankTransactions.companyId, companyId)),
      this.db
        .select({ c: count() })
        .from(xeroBankTransactions)
        .where(eq(xeroBankTransactions.companyId, companyId)),
      this.db
        .select({ c: count() })
        .from(bankStatementImportBatches)
        .where(eq(bankStatementImportBatches.companyId, companyId)),
      this.db
        .select({ c: count() })
        .from(bankFeedConnections)
        .where(eq(bankFeedConnections.companyId, companyId)),
      this.db
        .select({ c: count() })
        .from(bankFeedIntakeEvents)
        .where(eq(bankFeedIntakeEvents.companyId, companyId)),
    ]);

    const capability = await this.capabilityForCompany(companyId);
    const providerPresence = providerRows.map((r) => ({
      provider: String(r.provider),
      status: String(r.status),
      tokenPresent: false as const,
    }));

    const bankProviders = providerPresence.filter((p) =>
      ['stitch', 'plaid', 'open_banking', 'fnb_feed', 'fnb'].includes(p.provider.toLowerCase()),
    );

    return {
      bankIntegrationProviderConfigs: providerPresence,
      bankProviderCapabilityPresent: bankProviders.length > 0,
      legitimateFnbOrOpenBankingFeed: false,
      bankAccountRecords: Number(accounts.c),
      importedBankTransactions: Number(txs.c),
      xeroBankTransactions: Number(xeroTxs.c),
      statementImportBatches: Number(batches.c),
      bankFeedConnections: Number(connections.c),
      bankFeedIntakeEvents: Number(events.c),
      supportedIntakeModes: ['CONTROLLED_STATEMENT_IMPORT'] as const,
      foundationMode: capability.mode,
      operatingMode: capability.csvImportAvailable
        ? ('CONTROLLED_STATEMENT_IMPORT' as const)
        : ('NOT_CONFIGURED' as const),
      note: 'READ-ONLY; no real bank connect; secrets not returned',
      xeroWrites: 0,
      moneyMovement: 0,
    };
  }
}
