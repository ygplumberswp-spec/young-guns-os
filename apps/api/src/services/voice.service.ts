import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { emitBusinessEvent } from '../lib/automation-events.js';
import type {
  CreateVoiceConversationRequest,
  CreateVoiceOutcomeRequest,
  CreateVoiceSessionRequest,
  UpdateVoiceFollowUpRequest,
  UpdateVoiceSessionRequest,
  VoiceAppointmentAssistance,
  VoiceAuraContext,
  VoiceCallSummary,
  VoiceConversationSummary,
  VoiceFollowUpSummary,
  VoiceInsight,
  VoiceOutcomeSummary,
  VoiceQualificationResult,
  VoiceSessionSummary,
  VoiceStats,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  customers,
  jobs,
  leads,
  voiceConversations,
  voiceFollowUps,
  voiceOutcomes,
  voiceSessions,
} from '@titan/db';

export class VoiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'VoiceError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
};

export class VoiceService {
  constructor(private readonly db: DatabaseClient) {}

  async getStats(companyId: string): Promise<VoiceStats> {
    const [sessions, followUps] = await Promise.all([
      this.db.query.voiceSessions.findMany({ where: eq(voiceSessions.companyId, companyId) }),
      this.db.query.voiceFollowUps.findMany({
        where: and(eq(voiceFollowUps.companyId, companyId), eq(voiceFollowUps.status, 'pending')),
      }),
    ]);

    return {
      totalSessionCount: sessions.length,
      activeSessionCount: sessions.filter((row) => row.status === 'active').length,
      completedSessionCount: sessions.filter((row) => row.status === 'completed').length,
      followUpRequiredCount: sessions.filter((row) => row.followUpRequired).length,
      pendingFollowUpCount: followUps.length,
      appointmentRequestCount: sessions.filter((row) => row.enquiryType === 'appointment_request')
        .length,
      quoteRequestCount: sessions.filter((row) => row.enquiryType === 'quote_request').length,
    };
  }

  async listSessions(companyId: string): Promise<VoiceSessionSummary[]> {
    const rows = await this.db.query.voiceSessions.findMany({
      where: eq(voiceSessions.companyId, companyId),
      with: { customer: true },
      orderBy: [desc(voiceSessions.startedAt)],
      limit: 100,
    });

    return rows.map(toSessionSummary);
  }

  async getSession(companyId: string, sessionId: string): Promise<VoiceSessionSummary | null> {
    const row = await this.db.query.voiceSessions.findFirst({
      where: and(eq(voiceSessions.id, sessionId), eq(voiceSessions.companyId, companyId)),
      with: { customer: true },
    });

    return row ? toSessionSummary(row) : null;
  }

  async createSession(
    scope: TenantScope,
    input: CreateVoiceSessionRequest,
  ): Promise<VoiceSessionSummary> {
    if (input.customerId) {
      await this.ensureCustomerBelongsToCompany(scope.companyId, input.customerId);
    }

    const [created] = await this.db
      .insert(voiceSessions)
      .values({
        companyId: scope.companyId,
        customerId: input.customerId ?? null,
        agentProfileId: input.agentProfileId ?? null,
        status: input.status ?? 'active',
        channel: input.channel ?? 'phone',
        enquiryType: input.enquiryType ?? 'other',
        callerName: input.callerName?.trim() || null,
        callerPhone: input.callerPhone?.trim() || null,
        callerEmail: input.callerEmail?.trim() || null,
        durationSeconds: input.durationSeconds ?? null,
        summary: input.summary?.trim() || null,
        followUpRequired: input.followUpRequired ?? false,
        qualification: input.qualification ?? {},
        metadata: input.metadata ?? {},
        startedAt: input.startedAt ? new Date(input.startedAt) : new Date(),
        endedAt: input.endedAt ? new Date(input.endedAt) : null,
        createdByUserId: scope.userId,
      })
      .returning();

    if (!created) {
      throw new VoiceError('CREATE_FAILED', 'Unable to create voice session');
    }

    return (await this.getSession(scope.companyId, created.id))!;
  }

  async updateSession(
    companyId: string,
    sessionId: string,
    input: UpdateVoiceSessionRequest,
  ): Promise<VoiceSessionSummary> {
    const existing = await this.getSession(companyId, sessionId);
    if (!existing) {
      throw new VoiceError('NOT_FOUND', 'Voice session not found');
    }

    if (input.customerId) {
      await this.ensureCustomerBelongsToCompany(companyId, input.customerId);
    }

    await this.db
      .update(voiceSessions)
      .set({
        customerId: input.customerId !== undefined ? input.customerId : undefined,
        agentProfileId: input.agentProfileId !== undefined ? input.agentProfileId : undefined,
        status: input.status,
        channel: input.channel,
        enquiryType: input.enquiryType,
        callerName: input.callerName !== undefined ? input.callerName?.trim() || null : undefined,
        callerPhone:
          input.callerPhone !== undefined ? input.callerPhone?.trim() || null : undefined,
        callerEmail:
          input.callerEmail !== undefined ? input.callerEmail?.trim() || null : undefined,
        durationSeconds: input.durationSeconds !== undefined ? input.durationSeconds : undefined,
        summary: input.summary !== undefined ? input.summary?.trim() || null : undefined,
        followUpRequired: input.followUpRequired,
        qualification: input.qualification,
        metadata: input.metadata,
        startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
        endedAt:
          input.endedAt !== undefined
            ? input.endedAt
              ? new Date(input.endedAt)
              : null
            : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(voiceSessions.id, sessionId), eq(voiceSessions.companyId, companyId)));

    if (input.status === 'completed' && existing.status !== 'completed') {
      emitBusinessEvent({
        companyId,
        eventType: 'voice.call.completed',
        entityType: 'voice_session',
        entityId: sessionId,
        payload: {
          session: { id: sessionId, status: 'completed', enquiryType: existing.enquiryType },
        },
      });
    }

    return (await this.getSession(companyId, sessionId))!;
  }

  async listConversations(
    companyId: string,
    sessionId: string,
  ): Promise<VoiceConversationSummary[]> {
    await this.ensureSessionBelongsToCompany(companyId, sessionId);

    const rows = await this.db.query.voiceConversations.findMany({
      where: and(
        eq(voiceConversations.companyId, companyId),
        eq(voiceConversations.sessionId, sessionId),
      ),
      orderBy: [voiceConversations.occurredAt],
    });

    return rows.map(toConversationSummary);
  }

  async addConversationTurn(
    scope: TenantScope,
    sessionId: string,
    input: CreateVoiceConversationRequest,
  ): Promise<VoiceConversationSummary> {
    await this.ensureSessionBelongsToCompany(scope.companyId, sessionId);

    const content = input.content.trim();
    if (!content) {
      throw new VoiceError('VALIDATION_ERROR', 'Conversation content is required');
    }

    const [created] = await this.db
      .insert(voiceConversations)
      .values({
        companyId: scope.companyId,
        sessionId,
        speaker: input.speaker,
        content,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      })
      .returning();

    if (!created) {
      throw new VoiceError('CREATE_FAILED', 'Unable to add conversation turn');
    }

    return toConversationSummary(created);
  }

  async listOutcomes(companyId: string, sessionId?: string): Promise<VoiceOutcomeSummary[]> {
    const rows = await this.db.query.voiceOutcomes.findMany({
      where: sessionId
        ? and(eq(voiceOutcomes.companyId, companyId), eq(voiceOutcomes.sessionId, sessionId))
        : eq(voiceOutcomes.companyId, companyId),
      orderBy: [desc(voiceOutcomes.createdAt)],
      limit: 100,
    });

    return rows.map(toOutcomeSummary);
  }

  async createOutcome(
    scope: TenantScope,
    sessionId: string,
    input: CreateVoiceOutcomeRequest,
  ): Promise<VoiceOutcomeSummary> {
    await this.ensureSessionBelongsToCompany(scope.companyId, sessionId);

    const title = input.title.trim();
    const description = input.description.trim();
    if (!title || !description) {
      throw new VoiceError('VALIDATION_ERROR', 'Outcome title and description are required');
    }

    const [created] = await this.db
      .insert(voiceOutcomes)
      .values({
        companyId: scope.companyId,
        sessionId,
        outcomeType: input.outcomeType,
        title,
        description,
        context: input.context ?? {},
      })
      .returning();

    if (!created) {
      throw new VoiceError('CREATE_FAILED', 'Unable to create voice outcome');
    }

    if (input.outcomeType === 'follow_up_required') {
      await this.db
        .update(voiceSessions)
        .set({ followUpRequired: true, updatedAt: new Date() })
        .where(eq(voiceSessions.id, sessionId));
    }

    return toOutcomeSummary(created);
  }

  async listFollowUps(companyId: string): Promise<VoiceFollowUpSummary[]> {
    const rows = await this.db.query.voiceFollowUps.findMany({
      where: and(
        eq(voiceFollowUps.companyId, companyId),
        inArray(voiceFollowUps.status, ['pending', 'accepted']),
      ),
      orderBy: [desc(voiceFollowUps.updatedAt)],
      limit: 50,
    });

    return rows.map(toFollowUpSummary);
  }

  async generateFollowUpRecommendations(companyId: string): Promise<VoiceFollowUpSummary[]> {
    const sessions = await this.db.query.voiceSessions.findMany({
      where: and(eq(voiceSessions.companyId, companyId), eq(voiceSessions.followUpRequired, true)),
      with: { outcomes: true },
      orderBy: [desc(voiceSessions.startedAt)],
      limit: 30,
    });

    const existing = await this.listFollowUps(companyId);
    const existingSessionIds = new Set(existing.map((row) => row.sessionId));

    const recommendations: Array<{
      sessionId: string;
      customerId: string | null;
      followUpType: VoiceFollowUpSummary['followUpType'];
      title: string;
      description: string;
      priority: string;
      payload: Record<string, unknown>;
    }> = [];

    for (const session of sessions) {
      if (existingSessionIds.has(session.id)) continue;

      const callerLabel = session.callerName ?? session.callerPhone ?? 'Unknown caller';

      if (session.enquiryType === 'appointment_request') {
        recommendations.push({
          sessionId: session.id,
          customerId: session.customerId,
          followUpType: 'appointment_request',
          title: `Appointment request — ${callerLabel}`,
          description: `Caller requested an appointment. Review availability and approve booking draft.`,
          priority: 'high',
          payload: { enquiryType: session.enquiryType, qualification: session.qualification },
        });
      } else if (session.enquiryType === 'quote_request') {
        recommendations.push({
          sessionId: session.id,
          customerId: session.customerId,
          followUpType: 'sales_follow_up',
          title: `Quote follow-up — ${callerLabel}`,
          description: `Caller requested a quote. Draft sales follow-up for approval.`,
          priority: 'high',
          payload: { enquiryType: session.enquiryType },
        });
      } else if (session.enquiryType === 'new_enquiry' && !session.customerId) {
        recommendations.push({
          sessionId: session.id,
          customerId: null,
          followUpType: 'lead_draft',
          title: `New lead from call — ${callerLabel}`,
          description: `New enquiry from voice session. Draft lead record for approval.`,
          priority: 'medium',
          payload: {
            callerName: session.callerName,
            callerPhone: session.callerPhone,
            callerEmail: session.callerEmail,
          },
        });
      } else if (session.customerId) {
        recommendations.push({
          sessionId: session.id,
          customerId: session.customerId,
          followUpType: 'customer_note',
          title: `Customer note — ${callerLabel}`,
          description: `Follow-up required from voice session. Draft CRM note for approval.`,
          priority: 'medium',
          payload: { summary: session.summary },
        });
      } else {
        recommendations.push({
          sessionId: session.id,
          customerId: null,
          followUpType: 'communication_draft',
          title: `Follow-up — ${callerLabel}`,
          description: `Voice session requires follow-up. Draft communication for approval.`,
          priority: 'medium',
          payload: { summary: session.summary },
        });
      }
    }

    const created: VoiceFollowUpSummary[] = [];
    for (const item of recommendations.slice(0, 20)) {
      const [row] = await this.db
        .insert(voiceFollowUps)
        .values({
          companyId,
          sessionId: item.sessionId,
          customerId: item.customerId,
          followUpType: item.followUpType,
          title: item.title,
          description: item.description,
          priority: item.priority,
          payload: item.payload,
        })
        .returning();

      if (row) {
        created.push(toFollowUpSummary(row));
      }
    }

    return created;
  }

  async updateFollowUp(
    companyId: string,
    followUpId: string,
    input: UpdateVoiceFollowUpRequest,
  ): Promise<VoiceFollowUpSummary> {
    const existing = await this.db.query.voiceFollowUps.findFirst({
      where: and(eq(voiceFollowUps.id, followUpId), eq(voiceFollowUps.companyId, companyId)),
    });

    if (!existing) {
      throw new VoiceError('NOT_FOUND', 'Voice follow-up not found');
    }

    await this.db
      .update(voiceFollowUps)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(voiceFollowUps.id, followUpId));

    const row = await this.db.query.voiceFollowUps.findFirst({
      where: eq(voiceFollowUps.id, followUpId),
    });

    return toFollowUpSummary(row!);
  }

  async getCallHistory(companyId: string): Promise<VoiceSessionSummary[]> {
    return this.listSessions(companyId);
  }

  async summarizeCall(companyId: string, sessionId: string): Promise<VoiceCallSummary> {
    const session = await this.getSession(companyId, sessionId);
    if (!session) {
      throw new VoiceError('NOT_FOUND', 'Voice session not found');
    }

    const turns = await this.listConversations(companyId, sessionId);
    const callerTurns = turns.filter((turn) => turn.speaker === 'caller');
    const agentTurns = turns.filter((turn) => turn.speaker === 'agent');

    const keyTopics = extractKeyTopics(turns.map((turn) => turn.content));

    let summary = session.summary;
    if (!summary && turns.length > 0) {
      const preview = turns
        .slice(0, 6)
        .map((turn) => `${turn.speaker}: ${turn.content.slice(0, 120)}`)
        .join(' | ');
      summary = `Call with ${session.callerName ?? 'caller'} (${session.enquiryType.replace(/_/g, ' ')}). ${preview}`;
    } else if (!summary) {
      summary = `Voice session (${session.status}) — no conversation recorded yet.`;
    }

    return {
      sessionId,
      summary,
      turnCount: turns.length,
      callerTurnCount: callerTurns.length,
      agentTurnCount: agentTurns.length,
      keyTopics,
      followUpRequired: session.followUpRequired,
    };
  }

  async analyzeQualification(
    companyId: string,
    sessionId: string,
  ): Promise<VoiceQualificationResult> {
    const session = await this.getSession(companyId, sessionId);
    if (!session) {
      throw new VoiceError('NOT_FOUND', 'Voice session not found');
    }

    const qualification = session.qualification;
    let isExistingCustomer = Boolean(session.customerId);

    if (session.customerId) {
      const customer = await this.db.query.customers.findFirst({
        where: and(eq(customers.id, session.customerId), eq(customers.companyId, companyId)),
      });
      isExistingCustomer = Boolean(customer);
    }

    const serviceType =
      typeof qualification.serviceType === 'string'
        ? qualification.serviceType
        : typeof qualification.service === 'string'
          ? qualification.service
          : null;

    const urgency = normalizeUrgency(qualification.urgency);
    const serviceArea =
      typeof qualification.serviceArea === 'string'
        ? qualification.serviceArea
        : typeof qualification.location === 'string'
          ? qualification.location
          : null;

    const salesOpportunitySignal =
      session.enquiryType === 'quote_request' ||
      session.enquiryType === 'service_request' ||
      session.enquiryType === 'new_enquiry';

    const signals: Record<string, unknown> = {
      enquiryType: session.enquiryType,
      hasCustomerLink: Boolean(session.customerId),
      followUpRequired: session.followUpRequired,
      callerPhoneProvided: Boolean(session.callerPhone),
      callerEmailProvided: Boolean(session.callerEmail),
    };

    if (session.customerId) {
      const [jobCountRow, leadRow] = await Promise.all([
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(jobs)
          .where(and(eq(jobs.companyId, companyId), eq(jobs.customerId, session.customerId))),
        this.db.query.leads.findFirst({
          where: and(eq(leads.companyId, companyId), eq(leads.customerId, session.customerId)),
        }),
      ]);

      signals.jobCount = jobCountRow[0]?.count ?? 0;
      signals.hasLeadRecord = Boolean(leadRow);
    }

    return {
      sessionId,
      customerId: session.customerId,
      isExistingCustomer,
      enquiryType: session.enquiryType,
      serviceType,
      urgency,
      serviceArea,
      salesOpportunitySignal,
      signals,
      summary: `${isExistingCustomer ? 'Existing' : 'New'} caller — ${session.enquiryType.replace(/_/g, ' ')}${serviceType ? ` for ${serviceType}` : ''}${urgency ? ` (${urgency} urgency)` : ''}.`,
    };
  }

  async getAppointmentAssistance(companyId: string): Promise<VoiceAppointmentAssistance> {
    const upcoming = await this.db.query.jobs.findMany({
      where: and(eq(jobs.companyId, companyId), isNotNull(jobs.scheduledAt)),
      with: { customer: true },
      orderBy: [jobs.scheduledAt],
      limit: 10,
    });

    const [scheduledRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.companyId, companyId), isNotNull(jobs.scheduledAt)));

    const scheduledJobCount = scheduledRow?.count ?? 0;

    return {
      scheduledJobCount,
      upcomingAppointments: upcoming.map((job) => ({
        jobId: job.id,
        title: job.title,
        scheduledAt: job.scheduledAt?.toISOString() ?? null,
        customerName: job.customer?.name ?? null,
      })),
      recommendation:
        scheduledJobCount > 0
          ? `${scheduledJobCount} scheduled job(s) on the calendar. Recommend available slots based on dispatch capacity — booking requires approval.`
          : 'No scheduled jobs found. Recommend checking technician availability before proposing appointment times — booking requires approval.',
      requiresApproval: true,
    };
  }

  async getWaitingEnquiries(companyId: string): Promise<VoiceInsight[]> {
    const [activeSessions, pendingFollowUps, voiceLeadSessions] = await Promise.all([
      this.db.query.voiceSessions.findMany({
        where: and(eq(voiceSessions.companyId, companyId), eq(voiceSessions.status, 'active')),
        orderBy: [desc(voiceSessions.startedAt)],
        limit: 20,
      }),
      this.db.query.voiceFollowUps.findMany({
        where: and(eq(voiceFollowUps.companyId, companyId), eq(voiceFollowUps.status, 'pending')),
        limit: 20,
      }),
      this.db.query.voiceSessions.findMany({
        where: and(
          eq(voiceSessions.companyId, companyId),
          eq(voiceSessions.enquiryType, 'new_enquiry'),
          eq(voiceSessions.followUpRequired, true),
        ),
        limit: 20,
      }),
    ]);

    const insights: VoiceInsight[] = [];

    if (activeSessions.length > 0) {
      insights.push({
        insightType: 'active_calls',
        title: 'Active voice sessions need attention',
        description: `${activeSessions.length} active voice session(s) are in progress or awaiting completion.`,
        priority: 'high',
        context: { sessionIds: activeSessions.map((row) => row.id) },
      });
    }

    if (pendingFollowUps.length > 0) {
      insights.push({
        insightType: 'pending_follow_ups',
        title: 'Customer requests are waiting',
        description: `${pendingFollowUps.length} voice follow-up action(s) pending approval.`,
        priority: 'high',
        context: { followUpIds: pendingFollowUps.map((row) => row.id) },
      });
    }

    if (voiceLeadSessions.length > 0) {
      insights.push({
        insightType: 'call_leads',
        title: 'Leads from calls need qualification',
        description: `${voiceLeadSessions.length} new enquiry call(s) may represent lead opportunities.`,
        priority: 'medium',
        context: { sessionIds: voiceLeadSessions.map((row) => row.id) },
      });
    }

    const appointmentRequests = activeSessions.filter(
      (row) => row.enquiryType === 'appointment_request',
    );
    if (appointmentRequests.length > 0) {
      insights.push({
        insightType: 'appointment_requests',
        title: 'Appointment requests from calls',
        description: `${appointmentRequests.length} caller(s) requested appointments — review scheduling availability.`,
        priority: 'medium',
        context: { sessionIds: appointmentRequests.map((row) => row.id) },
      });
    }

    return insights.slice(0, 12);
  }

  async buildAuraContext(companyId: string): Promise<VoiceAuraContext> {
    const [stats, sessions, waitingEnquiries] = await Promise.all([
      this.getStats(companyId),
      this.listSessions(companyId),
      this.getWaitingEnquiries(companyId),
    ]);

    const recentSessions = sessions.slice(0, 8).map((row) => ({
      id: row.id,
      callerName: row.callerName,
      enquiryType: row.enquiryType,
      status: row.status,
      summary: row.summary,
      followUpRequired: row.followUpRequired,
    }));

    return {
      activeSessionCount: stats.activeSessionCount,
      followUpRequiredCount: stats.followUpRequiredCount,
      pendingFollowUpCount: stats.pendingFollowUpCount,
      recentSessions,
      waitingEnquiries,
      summary: `${stats.totalSessionCount} voice session(s), ${stats.activeSessionCount} active, ${stats.pendingFollowUpCount} pending follow-up(s).`,
    };
  }

  private async ensureSessionBelongsToCompany(companyId: string, sessionId: string): Promise<void> {
    const session = await this.getSession(companyId, sessionId);
    if (!session) {
      throw new VoiceError('NOT_FOUND', 'Voice session not found');
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
      throw new VoiceError('NOT_FOUND', 'Customer not found');
    }
  }
}

function toSessionSummary(
  row: typeof voiceSessions.$inferSelect & { customer?: { name: string } | null },
): VoiceSessionSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    agentProfileId: row.agentProfileId,
    status: row.status,
    channel: row.channel,
    enquiryType: row.enquiryType,
    callerName: row.callerName,
    callerPhone: row.callerPhone,
    callerEmail: row.callerEmail,
    durationSeconds: row.durationSeconds,
    summary: row.summary,
    followUpRequired: row.followUpRequired,
    qualification: row.qualification,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toConversationSummary(
  row: typeof voiceConversations.$inferSelect,
): VoiceConversationSummary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    speaker: row.speaker,
    content: row.content,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toOutcomeSummary(row: typeof voiceOutcomes.$inferSelect): VoiceOutcomeSummary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    outcomeType: row.outcomeType,
    title: row.title,
    description: row.description,
    context: row.context,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toFollowUpSummary(row: typeof voiceFollowUps.$inferSelect): VoiceFollowUpSummary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    customerId: row.customerId,
    followUpType: row.followUpType,
    status: row.status,
    title: row.title,
    description: row.description,
    priority: row.priority,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function extractKeyTopics(contents: string[]): string[] {
  const keywords = [
    'plumbing',
    'leak',
    'quote',
    'appointment',
    'emergency',
    'repair',
    'install',
    'service',
  ];
  const topics = new Set<string>();

  for (const content of contents) {
    const lower = content.toLowerCase();
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        topics.add(keyword);
      }
    }
  }

  return [...topics].slice(0, 5);
}

function normalizeUrgency(value: unknown): 'low' | 'medium' | 'high' | null {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower.includes('urgent') || lower.includes('emergency')) return 'high';
    if (lower.includes('soon')) return 'medium';
  }

  return null;
}
