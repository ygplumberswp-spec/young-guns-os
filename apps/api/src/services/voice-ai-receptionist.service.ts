import { and, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import {
  buildVairBookingDraft,
  buildVairCallStats,
  buildVairLeadDraft,
  buildVairProviderSnapshot,
  canAccessVoiceAiReceptionist,
  canApproveVairDrafts,
  canManageVairSettings,
  canWriteVoiceAiReceptionist,
  defaultVairSettings,
  listVairConnections,
  normalizePhoneDigits,
  VAIR_PRODUCT_COPY,
  type CompleteVairCallSessionRequest,
  type CreateVairBookingDraftRequest,
  type CreateVairLeadDraftRequest,
  type DecideVairApprovalRequest,
  type LookupVairCustomerRequest,
  type RecordVairIncomingCallRequest,
  type ReleaseVairTakeoverRequest,
  type RequestVairTakeoverRequest,
  type UpdateVairSettingsRequest,
  type UpsertVairRoutingRuleRequest,
  type VairApprovalDraftSummary,
  type VairCallSessionSummary,
  type VairCustomerLookupResult,
  type VairOwnerDashboard,
  type VairRoutingRuleSummary,
  type VairSettings,
  type VairTakeoverEventSummary,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  customers,
  jobs,
  leads,
  securityAuditLogs,
  vairApprovalDrafts,
  vairCallSessions,
  vairRoutingRules,
  vairSettings,
  vairTakeoverEvents,
  voiceSessions,
  vrTelephonyProviderConfigs,
} from '@titan/db';

export class VoiceAiReceptionistError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'VoiceAiReceptionistError';
  }
}

export type VairActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export class VoiceAiReceptionistService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: VairActor): void {
    if (!canAccessVoiceAiReceptionist(actor)) {
      throw new VoiceAiReceptionistError(
        'FORBIDDEN',
        'Voice AI Receptionist requires Owner/Admin or voice/communications access. Technician/Client denied.',
      );
    }
  }

  private assertWrite(actor: VairActor): void {
    this.assertRead(actor);
    if (!canWriteVoiceAiReceptionist(actor)) {
      throw new VoiceAiReceptionistError(
        'FORBIDDEN',
        'Write actions require Owner/Admin or voice/communications write permissions.',
      );
    }
  }

  private assertApprove(actor: VairActor): void {
    this.assertWrite(actor);
    if (!canApproveVairDrafts(actor)) {
      throw new VoiceAiReceptionistError(
        'FORBIDDEN',
        'Only Owner or Admin may approve Voice AI lead/booking drafts.',
      );
    }
  }

  private assertManageSettings(actor: VairActor): void {
    this.assertWrite(actor);
    if (!canManageVairSettings(actor)) {
      throw new VoiceAiReceptionistError(
        'FORBIDDEN',
        'Only Owner or Admin may change Voice AI Receptionist settings.',
      );
    }
  }

  private async recordAudit(
    actor: VairActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'voice_ai_receptionist',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        humanTakeoverAlwaysAvailable: true,
        fakeCalls: false,
        autoExecuted: false,
      },
    });
  }

  private toSettings(row: typeof vairSettings.$inferSelect): VairSettings {
    return defaultVairSettings({
      id: row.id,
      receptionistEnabled: row.receptionistEnabled,
      leadCreateRequiresApproval: row.leadCreateRequiresApproval,
      bookingExecuteRequiresApproval: row.bookingExecuteRequiresApproval,
      defaultLocale: row.defaultLocale,
      preferredVoiceLabel: row.preferredVoiceLabel,
      welcomeMessage: row.welcomeMessage,
      afterHoursMessage: row.afterHoursMessage,
      telephonyProviderKey: row.telephonyProviderKey,
      ttsProviderKey: row.ttsProviderKey,
      sttProviderKey: row.sttProviderKey,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private async ensureSettings(actor: VairActor): Promise<VairSettings> {
    const existing = await this.db.query.vairSettings.findFirst({
      where: eq(vairSettings.companyId, actor.companyId),
    });
    if (existing) return this.toSettings(existing);

    const [created] = await this.db
      .insert(vairSettings)
      .values({
        companyId: actor.companyId,
        receptionistEnabled: true,
        humanTakeoverAlwaysAvailable: true,
        leadCreateRequiresApproval: true,
        bookingExecuteRequiresApproval: true,
        defaultLocale: 'en-ZA',
        updatedByUserId: actor.userId,
      })
      .returning();

    return this.toSettings(created);
  }

  private async customerName(
    companyId: string,
    customerId: string | null | undefined,
  ): Promise<string | null> {
    if (!customerId) return null;
    const [row] = await this.db
      .select({ name: customers.name })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId)))
      .limit(1);
    return row?.name ?? null;
  }

  private toCallSession(
    row: typeof vairCallSessions.$inferSelect,
    customerName: string | null,
  ): VairCallSessionSummary {
    return {
      id: row.id,
      status: row.status,
      direction: row.direction,
      callerPhone: row.callerPhone,
      callerName: row.callerName,
      customerId: row.customerId,
      customerName,
      voiceSessionId: row.voiceSessionId,
      routingDestination: row.routingDestination,
      humanTakeoverActive: row.humanTakeoverActive,
      summary: row.summary,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      invented: false,
    };
  }

  private toRoutingRule(row: typeof vairRoutingRules.$inferSelect): VairRoutingRuleSummary {
    return {
      id: row.id,
      ruleKey: row.ruleKey,
      name: row.name,
      priority: row.priority,
      destination: row.destination,
      matchCriteria: row.matchCriteria ?? {},
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toApproval(row: typeof vairApprovalDrafts.$inferSelect): VairApprovalDraftSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      callSessionId: row.callSessionId,
      customerId: row.customerId,
      leadId: row.leadId,
      jobId: row.jobId,
      autoExecuted: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      executedAt: row.executedAt?.toISOString() ?? null,
    };
  }

  private toTakeover(row: typeof vairTakeoverEvents.$inferSelect): VairTakeoverEventSummary {
    return {
      id: row.id,
      callSessionId: row.callSessionId,
      reason: row.reason,
      notes: row.notes,
      takenOverByUserId: row.takenOverByUserId,
      takenOverAt: row.takenOverAt.toISOString(),
      releasedAt: row.releasedAt?.toISOString() ?? null,
    };
  }

  private async findCustomerByPhone(
    companyId: string,
    phone: string | null | undefined,
  ): Promise<{ id: string; name: string } | null> {
    const normalized = normalizePhoneDigits(phone);
    if (!normalized && !phone?.trim()) return null;

    const rows = await this.db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
      })
      .from(customers)
      .where(eq(customers.companyId, companyId))
      .limit(500);

    for (const row of rows) {
      const rowNorm = normalizePhoneDigits(row.phone);
      if (normalized && rowNorm && rowNorm === normalized) {
        return { id: row.id, name: row.name };
      }
      if (phone?.trim() && row.phone && row.phone.replace(/\s/g, '') === phone.replace(/\s/g, '')) {
        return { id: row.id, name: row.name };
      }
    }
    return null;
  }

  private async resolveRoutingDestination(
    companyId: string,
  ): Promise<typeof vairRoutingRules.$inferSelect['destination'] | null> {
    const rules = await this.db
      .select()
      .from(vairRoutingRules)
      .where(and(eq(vairRoutingRules.companyId, companyId), eq(vairRoutingRules.enabled, true)))
      .orderBy(vairRoutingRules.priority)
      .limit(1);
    return rules[0]?.destination ?? 'ai_receptionist';
  }

  async getOwnerDashboard(actor: VairActor): Promise<VairOwnerDashboard> {
    this.assertRead(actor);
    const settings = await this.ensureSettings(actor);

    const [sessionRows, ruleRows, approvalRows, takeoverRows, enterpriseProviders] =
      await Promise.all([
        this.db
          .select()
          .from(vairCallSessions)
          .where(eq(vairCallSessions.companyId, actor.companyId))
          .orderBy(desc(vairCallSessions.startedAt))
          .limit(50),
        this.db
          .select()
          .from(vairRoutingRules)
          .where(eq(vairRoutingRules.companyId, actor.companyId))
          .orderBy(vairRoutingRules.priority)
          .limit(100),
        this.db
          .select()
          .from(vairApprovalDrafts)
          .where(eq(vairApprovalDrafts.companyId, actor.companyId))
          .orderBy(desc(vairApprovalDrafts.createdAt))
          .limit(50),
        this.db
          .select()
          .from(vairTakeoverEvents)
          .where(eq(vairTakeoverEvents.companyId, actor.companyId))
          .orderBy(desc(vairTakeoverEvents.takenOverAt))
          .limit(50),
        this.db
          .select({
            id: vrTelephonyProviderConfigs.id,
            enabled: vrTelephonyProviderConfigs.enabled,
            providerKey: vrTelephonyProviderConfigs.providerKey,
          })
          .from(vrTelephonyProviderConfigs)
          .where(eq(vrTelephonyProviderConfigs.companyId, actor.companyId))
          .limit(20),
      ]);

    const customerIds = [
      ...new Set(sessionRows.map((s) => s.customerId).filter((id): id is string => Boolean(id))),
    ];
    const customerNameById = new Map<string, string>();
    if (customerIds.length > 0) {
      const custRows = await this.db
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(and(eq(customers.companyId, actor.companyId), inArray(customers.id, customerIds)));
      for (const c of custRows) customerNameById.set(c.id, c.name);
    }

    const activeStatuses = new Set(['ringing', 'active', 'human_takeover']);
    const callStats = buildVairCallStats({
      totalSessions: sessionRows.length,
      activeSessions: sessionRows.filter((s) => activeStatuses.has(s.status)).length,
      humanTakeoverCount: sessionRows.filter((s) => s.humanTakeoverActive || s.status === 'human_takeover')
        .length,
      completedSessions: sessionRows.filter((s) => s.status === 'completed').length,
    });

    const enterpriseTelephonyConfigured = enterpriseProviders.some((p) => p.enabled);
    const provider = buildVairProviderSnapshot({
      telephonyProviderKey: settings.telephonyProviderKey,
      ttsProviderKey: settings.ttsProviderKey,
      sttProviderKey: settings.sttProviderKey,
      enterpriseTelephonyConfigured,
    });

    const pendingApprovals = approvalRows.filter(
      (a) => a.status === 'pending_approval' || a.status === 'draft',
    ).length;

    return {
      summary:
        provider.telephonyStatus === 'not_configured'
          ? 'Voice AI Receptionist foundation is ready. Telephony is not_configured — no live AI media path until a provider connects. Human takeover is always available. No fake calls.'
          : 'Voice AI Receptionist foundation active with recorded provider keys. Call sessions reflect real records only; human takeover remains available.',
      productClarification: {
        voiceFoundation: VAIR_PRODUCT_COPY.voiceFoundation,
        enterpriseVoiceReception: VAIR_PRODUCT_COPY.enterpriseVoiceReception,
        thisLayer: VAIR_PRODUCT_COPY.thisLayer,
        customer360: VAIR_PRODUCT_COPY.customer360,
      },
      policy: {
        fakeCalls: false,
        fakeCustomers: false,
        fakeLeads: false,
        humanTakeoverAlwaysAvailable: true,
        hiddenActions: false,
        leadCreateRequiresApproval: settings.leadCreateRequiresApproval,
        bookingExecuteRequiresApproval: settings.bookingExecuteRequiresApproval,
        ownerControlled: true,
      },
      provider,
      saVoice: {
        defaultLocale: settings.defaultLocale,
        preferredVoiceLabel: settings.preferredVoiceLabel,
        ttsStatus: provider.ttsStatus,
        sttStatus: provider.sttStatus,
        rationale:
          provider.ttsStatus === 'not_configured' && provider.sttStatus === 'not_configured'
            ? `SA locale foundation set to ${settings.defaultLocale}. Live TTS/STT providers are not_configured — voice labels are config only until speech providers connect.`
            : `SA locale ${settings.defaultLocale} with recorded TTS/STT keys. Live speech still depends on real provider connections.`,
      },
      callStats,
      pendingApprovals,
      callSessions: sessionRows.map((row) =>
        this.toCallSession(row, row.customerId ? (customerNameById.get(row.customerId) ?? null) : null),
      ),
      routingRules: ruleRows.map((r) => this.toRoutingRule(r)),
      approvalQueue: approvalRows.map((a) => this.toApproval(a)),
      takeoverEvents: takeoverRows.map((t) => this.toTakeover(t)),
      connections: listVairConnections(),
      settings,
    };
  }

  async lookupCustomer(
    actor: VairActor,
    input: LookupVairCustomerRequest,
  ): Promise<VairCustomerLookupResult> {
    this.assertRead(actor);
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
    const phoneNorm = normalizePhoneDigits(input.phone);
    const email = input.email?.trim().toLowerCase();
    const name = input.name?.trim();

    if (!phoneNorm && !email && !name) {
      return {
        availability: 'unavailable',
        matches: [],
        rationale: 'Provide phone, email, or name to look up real CRM customers — no invented matches.',
        customer360: false,
      };
    }

    const conditions = [eq(customers.companyId, actor.companyId)];
    const orParts = [];
    if (email) orParts.push(ilike(customers.email, email));
    if (name) orParts.push(ilike(customers.name, `%${name}%`));
    if (input.phone?.trim()) orParts.push(ilike(customers.phone, `%${input.phone.trim()}%`));

    const rows = await this.db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        status: customers.status,
      })
      .from(customers)
      .where(orParts.length > 0 ? and(...conditions, or(...orParts)) : and(...conditions))
      .limit(100);

    const matches = rows
      .filter((row) => {
        if (phoneNorm) {
          const rowNorm = normalizePhoneDigits(row.phone);
          if (rowNorm && rowNorm === phoneNorm) return true;
        }
        if (email && row.email?.toLowerCase() === email) return true;
        if (name && row.name.toLowerCase().includes(name.toLowerCase())) return true;
        if (input.phone?.trim() && row.phone?.includes(input.phone.trim())) return true;
        return false;
      })
      .slice(0, limit)
      .map((row) => ({
        customerId: row.id,
        customerName: row.name,
        phone: row.phone,
        email: row.email,
        status: row.status,
      }));

    return {
      availability: matches.length > 0 ? 'available' : 'unavailable',
      matches,
      rationale:
        matches.length > 0
          ? `Matched ${matches.length} real CRM customer(s). Customer 360 module not built — CRM lookup only.`
          : 'No real CRM customers matched — unavailable (not invented).',
      customer360: false,
    };
  }

  async recordIncomingCall(
    actor: VairActor,
    input: RecordVairIncomingCallRequest,
  ): Promise<VairCallSessionSummary> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);

    if (input.voiceSessionId) {
      const voice = await this.db.query.voiceSessions.findFirst({
        where: and(
          eq(voiceSessions.id, input.voiceSessionId),
          eq(voiceSessions.companyId, actor.companyId),
        ),
      });
      if (!voice) {
        throw new VoiceAiReceptionistError(
          'NOT_FOUND',
          'Linked voice session not found for this company.',
        );
      }
    }

    let customerId: string | null = null;
    let customerName: string | null = null;
    if (input.identifyCaller !== false && input.callerPhone) {
      const match = await this.findCustomerByPhone(actor.companyId, input.callerPhone);
      if (match) {
        customerId = match.id;
        customerName = match.name;
      }
    }

    const destination = await this.resolveRoutingDestination(actor.companyId);

    const [created] = await this.db
      .insert(vairCallSessions)
      .values({
        companyId: actor.companyId,
        status: 'active',
        direction: 'inbound',
        callerPhone: input.callerPhone?.trim() || null,
        callerName: input.callerName?.trim() || null,
        normalizedPhone: normalizePhoneDigits(input.callerPhone),
        customerId,
        voiceSessionId: input.voiceSessionId ?? null,
        routingDestination: destination,
        humanTakeoverActive: false,
        summary: input.summary?.trim() || null,
        invented: false,
        createdByUserId: actor.userId,
        metadata: {
          receptionistEnabled: settings.receptionistEnabled,
          telephonyStatus: settings.telephonyProviderKey ? 'configured' : 'not_configured',
        },
      })
      .returning();

    await this.recordAudit(actor, 'vair_incoming_call_recorded', created.id, {
      callerPhone: created.callerPhone,
      customerId,
      routingDestination: destination,
    });

    return this.toCallSession(created, customerName);
  }

  async completeCallSession(
    actor: VairActor,
    sessionId: string,
    input: CompleteVairCallSessionRequest,
  ): Promise<VairCallSessionSummary> {
    this.assertWrite(actor);
    const existing = await this.db.query.vairCallSessions.findFirst({
      where: and(
        eq(vairCallSessions.id, sessionId),
        eq(vairCallSessions.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new VoiceAiReceptionistError('NOT_FOUND', 'Call session not found.');
    }

    const [updated] = await this.db
      .update(vairCallSessions)
      .set({
        status: input.status ?? 'completed',
        summary: input.summary?.trim() ?? existing.summary,
        humanTakeoverActive: false,
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(vairCallSessions.id, sessionId), eq(vairCallSessions.companyId, actor.companyId)),
      )
      .returning();

    await this.recordAudit(actor, 'vair_call_session_completed', sessionId, {
      status: updated.status,
    });

    return this.toCallSession(updated, await this.customerName(actor.companyId, updated.customerId));
  }

  async createLeadDraft(
    actor: VairActor,
    input: CreateVairLeadDraftRequest,
  ): Promise<VairApprovalDraftSummary> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    const draft = buildVairLeadDraft(input);

    if (input.callSessionId) {
      const session = await this.db.query.vairCallSessions.findFirst({
        where: and(
          eq(vairCallSessions.id, input.callSessionId),
          eq(vairCallSessions.companyId, actor.companyId),
        ),
      });
      if (!session) {
        throw new VoiceAiReceptionistError('NOT_FOUND', 'Call session not found for lead draft.');
      }
    }

    const status = settings.leadCreateRequiresApproval
      ? input.submitForApproval === false
        ? 'draft'
        : 'pending_approval'
      : 'pending_approval';

    const [created] = await this.db
      .insert(vairApprovalDrafts)
      .values({
        companyId: actor.companyId,
        kind: 'lead_create',
        status,
        title: draft.title,
        body: draft.body,
        callSessionId: input.callSessionId ?? null,
        autoExecuted: false,
        payload: {
          contactName: input.contactName.trim(),
          contactPhone: input.contactPhone?.trim() || null,
          contactEmail: input.contactEmail?.trim() || null,
          serviceType: input.serviceType?.trim() || null,
          notes: input.notes?.trim() || null,
        },
        createdByUserId: actor.userId,
      })
      .returning();

    await this.recordAudit(actor, 'vair_lead_draft_created', created.id, {
      status: created.status,
      requiresApproval: settings.leadCreateRequiresApproval,
    });

    return this.toApproval(created);
  }

  async createBookingDraft(
    actor: VairActor,
    input: CreateVairBookingDraftRequest,
  ): Promise<VairApprovalDraftSummary> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    const draft = buildVairBookingDraft(input);

    if (input.customerId) {
      const customer = await this.db.query.customers.findFirst({
        where: and(eq(customers.id, input.customerId), eq(customers.companyId, actor.companyId)),
      });
      if (!customer) {
        throw new VoiceAiReceptionistError('NOT_FOUND', 'Customer not found for booking draft.');
      }
    }

    if (input.callSessionId) {
      const session = await this.db.query.vairCallSessions.findFirst({
        where: and(
          eq(vairCallSessions.id, input.callSessionId),
          eq(vairCallSessions.companyId, actor.companyId),
        ),
      });
      if (!session) {
        throw new VoiceAiReceptionistError(
          'NOT_FOUND',
          'Call session not found for booking draft.',
        );
      }
    }

    const status = settings.bookingExecuteRequiresApproval
      ? input.submitForApproval === false
        ? 'draft'
        : 'pending_approval'
      : 'pending_approval';

    const [created] = await this.db
      .insert(vairApprovalDrafts)
      .values({
        companyId: actor.companyId,
        kind: 'booking_draft',
        status,
        title: draft.title,
        body: draft.body,
        callSessionId: input.callSessionId ?? null,
        customerId: input.customerId ?? null,
        autoExecuted: false,
        payload: {
          preferredAt: input.preferredAt ?? null,
          serviceType: input.serviceType?.trim() || null,
          notes: input.notes?.trim() || null,
        },
        createdByUserId: actor.userId,
      })
      .returning();

    await this.recordAudit(actor, 'vair_booking_draft_created', created.id, {
      status: created.status,
      neverAutoSchedule: true,
    });

    return this.toApproval(created);
  }

  async decideApproval(
    actor: VairActor,
    draftId: string,
    input: DecideVairApprovalRequest,
  ): Promise<VairApprovalDraftSummary> {
    this.assertApprove(actor);

    const existing = await this.db.query.vairApprovalDrafts.findFirst({
      where: and(
        eq(vairApprovalDrafts.id, draftId),
        eq(vairApprovalDrafts.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new VoiceAiReceptionistError('NOT_FOUND', 'Approval draft not found.');
    }
    if (!['draft', 'pending_approval', 'approved'].includes(existing.status)) {
      throw new VoiceAiReceptionistError(
        'INVALID_STATE',
        `Cannot decide draft in status ${existing.status}.`,
      );
    }

    if (input.decision === 'reject') {
      const [updated] = await this.db
        .update(vairApprovalDrafts)
        .set({
          status: 'rejected',
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          decisionNotes: input.notes?.trim() || null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(vairApprovalDrafts.id, draftId),
            eq(vairApprovalDrafts.companyId, actor.companyId),
          ),
        )
        .returning();
      await this.recordAudit(actor, 'vair_approval_rejected', draftId, { kind: existing.kind });
      return this.toApproval(updated);
    }

    if (input.decision === 'cancel') {
      const [updated] = await this.db
        .update(vairApprovalDrafts)
        .set({
          status: 'cancelled',
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          decisionNotes: input.notes?.trim() || null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(vairApprovalDrafts.id, draftId),
            eq(vairApprovalDrafts.companyId, actor.companyId),
          ),
        )
        .returning();
      await this.recordAudit(actor, 'vair_approval_cancelled', draftId, { kind: existing.kind });
      return this.toApproval(updated);
    }

    // approve
    let leadId = existing.leadId;
    let nextStatus: 'approved' | 'executed' = 'approved';
    let executedAt: Date | null = null;

    if (existing.kind === 'lead_create' && input.execute !== false) {
      const payload = existing.payload as {
        contactName?: string;
        contactPhone?: string | null;
        contactEmail?: string | null;
        serviceType?: string | null;
        notes?: string | null;
      };
      const contactName = (payload.contactName ?? '').trim();
      if (!contactName) {
        throw new VoiceAiReceptionistError(
          'VALIDATION_ERROR',
          'Lead draft missing contact name — cannot execute.',
        );
      }

      const title = [
        payload.serviceType?.trim() || 'Voice enquiry',
        contactName,
      ]
        .filter(Boolean)
        .join(' — ')
        .slice(0, 200);

      const [lead] = await this.db
        .insert(leads)
        .values({
          companyId: actor.companyId,
          customerId: existing.customerId,
          status: 'new',
          title,
          contactName,
          contactEmail: payload.contactEmail ?? null,
          contactPhone: payload.contactPhone ?? null,
          contactPhoneE164: normalizePhoneDigits(payload.contactPhone),
          serviceType: payload.serviceType ?? null,
          notes: payload.notes
            ? `${payload.notes}\n\n[Created via Voice AI Receptionist approval ${draftId}]`
            : `[Created via Voice AI Receptionist approval ${draftId}]`,
          metadata: {
            source: 'voice_ai_receptionist',
            approvalDraftId: draftId,
            callSessionId: existing.callSessionId,
          },
          createdByUserId: actor.userId,
        })
        .returning();

      leadId = lead.id;
      nextStatus = 'executed';
      executedAt = new Date();
    }

    // booking_draft: approve records intent only — never auto-schedule
    const [updated] = await this.db
      .update(vairApprovalDrafts)
      .set({
        status: nextStatus,
        leadId,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes?.trim() || null,
        executedAt,
        autoExecuted: false,
        updatedAt: new Date(),
        metadata: {
          ...(existing.metadata ?? {}),
          bookingAutoScheduled: false,
          schedulingExecute: existing.kind === 'booking_draft' ? 'manual_operator' : undefined,
        },
      })
      .where(
        and(eq(vairApprovalDrafts.id, draftId), eq(vairApprovalDrafts.companyId, actor.companyId)),
      )
      .returning();

    await this.recordAudit(actor, `vair_approval_${nextStatus}`, draftId, {
      kind: existing.kind,
      leadId,
      bookingAutoScheduled: false,
    });

    return this.toApproval(updated);
  }

  async requestTakeover(
    actor: VairActor,
    input: RequestVairTakeoverRequest,
  ): Promise<{ session: VairCallSessionSummary; event: VairTakeoverEventSummary }> {
    this.assertWrite(actor);

    const session = await this.db.query.vairCallSessions.findFirst({
      where: and(
        eq(vairCallSessions.id, input.callSessionId),
        eq(vairCallSessions.companyId, actor.companyId),
      ),
    });
    if (!session) {
      throw new VoiceAiReceptionistError('NOT_FOUND', 'Call session not found.');
    }

    const [updated] = await this.db
      .update(vairCallSessions)
      .set({
        status: 'human_takeover',
        humanTakeoverActive: true,
        routingDestination: 'human_queue',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vairCallSessions.id, input.callSessionId),
          eq(vairCallSessions.companyId, actor.companyId),
        ),
      )
      .returning();

    const [event] = await this.db
      .insert(vairTakeoverEvents)
      .values({
        companyId: actor.companyId,
        callSessionId: input.callSessionId,
        reason: input.reason ?? 'operator_initiated',
        notes: input.notes?.trim() || null,
        takenOverByUserId: actor.userId,
      })
      .returning();

    await this.recordAudit(actor, 'vair_human_takeover_requested', input.callSessionId, {
      reason: event.reason,
      alwaysAvailable: true,
    });

    return {
      session: this.toCallSession(
        updated,
        await this.customerName(actor.companyId, updated.customerId),
      ),
      event: this.toTakeover(event),
    };
  }

  async releaseTakeover(
    actor: VairActor,
    input: ReleaseVairTakeoverRequest,
  ): Promise<VairCallSessionSummary> {
    this.assertWrite(actor);

    const session = await this.db.query.vairCallSessions.findFirst({
      where: and(
        eq(vairCallSessions.id, input.callSessionId),
        eq(vairCallSessions.companyId, actor.companyId),
      ),
    });
    if (!session) {
      throw new VoiceAiReceptionistError('NOT_FOUND', 'Call session not found.');
    }

    const openEvents = await this.db
      .select()
      .from(vairTakeoverEvents)
      .where(
        and(
          eq(vairTakeoverEvents.companyId, actor.companyId),
          eq(vairTakeoverEvents.callSessionId, input.callSessionId),
          isNull(vairTakeoverEvents.releasedAt),
        ),
      );

    for (const event of openEvents) {
      await this.db
        .update(vairTakeoverEvents)
        .set({
          releasedAt: new Date(),
          notes: input.notes?.trim()
            ? `${event.notes ?? ''}\nRelease: ${input.notes.trim()}`.trim()
            : event.notes,
        })
        .where(
          and(
            eq(vairTakeoverEvents.id, event.id),
            eq(vairTakeoverEvents.companyId, actor.companyId),
          ),
        );
    }

    const [updated] = await this.db
      .update(vairCallSessions)
      .set({
        status: 'active',
        humanTakeoverActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vairCallSessions.id, input.callSessionId),
          eq(vairCallSessions.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.recordAudit(actor, 'vair_human_takeover_released', input.callSessionId, {});

    return this.toCallSession(
      updated,
      await this.customerName(actor.companyId, updated.customerId),
    );
  }

  async upsertRoutingRule(
    actor: VairActor,
    input: UpsertVairRoutingRuleRequest,
  ): Promise<VairRoutingRuleSummary> {
    this.assertWrite(actor);

    const existing = await this.db.query.vairRoutingRules.findFirst({
      where: and(
        eq(vairRoutingRules.companyId, actor.companyId),
        eq(vairRoutingRules.ruleKey, input.ruleKey.trim()),
      ),
    });

    if (existing) {
      const [updated] = await this.db
        .update(vairRoutingRules)
        .set({
          name: input.name.trim(),
          priority: input.priority ?? existing.priority,
          destination: input.destination,
          matchCriteria: input.matchCriteria ?? existing.matchCriteria,
          enabled: input.enabled ?? existing.enabled,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(vairRoutingRules.id, existing.id),
            eq(vairRoutingRules.companyId, actor.companyId),
          ),
        )
        .returning();
      await this.recordAudit(actor, 'vair_routing_rule_updated', updated.id, {
        ruleKey: updated.ruleKey,
      });
      return this.toRoutingRule(updated);
    }

    const [created] = await this.db
      .insert(vairRoutingRules)
      .values({
        companyId: actor.companyId,
        ruleKey: input.ruleKey.trim(),
        name: input.name.trim(),
        priority: input.priority ?? 100,
        destination: input.destination,
        matchCriteria: input.matchCriteria ?? {},
        enabled: input.enabled ?? true,
        createdByUserId: actor.userId,
      })
      .returning();

    await this.recordAudit(actor, 'vair_routing_rule_created', created.id, {
      ruleKey: created.ruleKey,
    });
    return this.toRoutingRule(created);
  }

  async updateSettings(
    actor: VairActor,
    input: UpdateVairSettingsRequest,
  ): Promise<VairSettings> {
    this.assertManageSettings(actor);
    await this.ensureSettings(actor);

    const [updated] = await this.db
      .update(vairSettings)
      .set({
        receptionistEnabled: input.receptionistEnabled,
        leadCreateRequiresApproval: input.leadCreateRequiresApproval,
        bookingExecuteRequiresApproval: input.bookingExecuteRequiresApproval,
        defaultLocale: input.defaultLocale,
        preferredVoiceLabel:
          input.preferredVoiceLabel === undefined
            ? undefined
            : input.preferredVoiceLabel?.trim() || null,
        welcomeMessage:
          input.welcomeMessage === undefined ? undefined : input.welcomeMessage?.trim() || null,
        afterHoursMessage:
          input.afterHoursMessage === undefined
            ? undefined
            : input.afterHoursMessage?.trim() || null,
        telephonyProviderKey:
          input.telephonyProviderKey === undefined
            ? undefined
            : input.telephonyProviderKey?.trim() || null,
        ttsProviderKey:
          input.ttsProviderKey === undefined ? undefined : input.ttsProviderKey?.trim() || null,
        sttProviderKey:
          input.sttProviderKey === undefined ? undefined : input.sttProviderKey?.trim() || null,
        notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
        humanTakeoverAlwaysAvailable: true,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(vairSettings.companyId, actor.companyId))
      .returning();

    await this.recordAudit(actor, 'vair_settings_updated', updated.id, {
      humanTakeoverAlwaysAvailable: true,
    });

    return this.toSettings(updated);
  }

  async listCustomerJobs(
    actor: VairActor,
    customerId: string,
  ): Promise<Array<{ jobId: string; title: string | null; status: string }>> {
    this.assertRead(actor);
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, actor.companyId)),
    });
    if (!customer) {
      throw new VoiceAiReceptionistError('NOT_FOUND', 'Customer not found.');
    }

    const rows = await this.db
      .select({
        jobId: jobs.id,
        title: jobs.title,
        status: jobs.status,
      })
      .from(jobs)
      .where(and(eq(jobs.companyId, actor.companyId), eq(jobs.customerId, customerId)))
      .orderBy(desc(jobs.createdAt))
      .limit(20);

    return rows.map((r) => ({
      jobId: r.jobId,
      title: r.title,
      status: r.status,
    }));
  }
}
