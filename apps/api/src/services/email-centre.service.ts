import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { isTechnicianRole } from '@titan/auth';
import type {
  CommAttachmentAnchorType,
  CommAttachmentKind,
  CommAttachmentLinkSummary,
  CommTimelineNoteSummary,
  CommunicationTimelineEntry,
  CommunicationTimelineFilter,
  CommunicationTimelineResult,
  CreateCommAttachmentLinkRequest,
  CreateCommTimelineNoteRequest,
  EmailCentreDashboard,
  EmailCentreDraftSummary,
  EmailCentreMailboxFilter,
  EmailCentreMessageSummary,
  EmailCentreReplyRequest,
  EmailCentreThreadHistory,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  boqDocuments,
  commAttachmentLinks,
  commPlatformGmailDrafts,
  commPlatformInboxIndex,
  commTimelineNotes,
  documents,
  invoices,
  paymentReceipts,
  quotes,
  securityAuditLogs,
  ucTimelineIndex,
} from '@titan/db';
import {
  CommunicationsPlatformError,
  type CommPlatformActor,
  type CommunicationsPlatformService,
} from './communications-platform.service.js';
import type { EnterpriseUnifiedCommunicationsService } from './enterprise-unified-communications.service.js';

export class EmailCentreError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EmailCentreError';
  }
}

export function mapEmailCentreError(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof EmailCentreError || err instanceof CommunicationsPlatformError) {
    const status =
      err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'FORBIDDEN'
          ? 403
          : err.code === 'NOT_CONFIGURED'
            ? 503
            : err.code === 'VALIDATION_ERROR'
              ? 400
              : 400;
    return { status, code: err.code, message: err.message };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Unexpected email centre error' };
}

type EmailCentreDeps = {
  db: DatabaseClient;
  communicationsPlatformService: CommunicationsPlatformService;
  enterpriseUnifiedCommunicationsService?: EnterpriseUnifiedCommunicationsService;
};

const ENTITY_KIND_MAP: Record<CommAttachmentKind, string> = {
  quote: 'quote',
  boq: 'boq_document',
  invoice: 'invoice',
  receipt: 'payment_receipt',
  coc: 'document',
  report: 'document',
  job_photo: 'document',
  document: 'document',
};

export class EmailCentreService {
  constructor(private readonly deps: EmailCentreDeps) {}

  static create(deps: EmailCentreDeps): EmailCentreService {
    return new EmailCentreService(deps);
  }

  async getDashboard(actor: CommPlatformActor): Promise<EmailCentreDashboard> {
    const mailbox = await this.listMailbox(actor, { channel: 'email', limit: 40 });
    const draftsPending = await this.countPendingDrafts(actor.companyId);
    const recentAttachments = await this.listAttachments(actor, { limit: 10 });
    const timeline = await this.getTimeline(actor, { limit: 8 });

    return {
      summary:
        'Email Centre reads Business Gmail from the Communications Platform index. Reply/forward uses Gmail draft → approve → execute. Resend remains transactional-only.',
      mailbox: {
        items: mailbox.items,
        total: mailbox.total,
        emptyReason: mailbox.emptyReason,
      },
      draftsPendingApproval: draftsPending,
      recentAttachments,
      timelinePreview: timeline.entries,
      policies: {
        emailSource: 'gmail_index',
        outboundCompose: 'gmail_draft_approve_execute',
        transactionalProvider: 'resend',
        autoSendEnabled: false,
        requiresApproval: true,
      },
    };
  }

  async listMailbox(
    actor: CommPlatformActor,
    filter: EmailCentreMailboxFilter = {},
  ): Promise<{
    items: EmailCentreMessageSummary[];
    total: number;
    emptyReason: EmailCentreDashboard['mailbox']['emptyReason'];
  }> {
    const result = await this.deps.communicationsPlatformService.listInbox(actor, {
      ...filter,
      channel: filter.channel === 'all' ? 'all' : 'email',
      accountKind: filter.accountKind ?? 'business_gmail',
      limit: filter.limit ?? 50,
      offset: filter.offset ?? 0,
    });

    const ids = result.items.map((i) => i.id);
    const rows =
      ids.length === 0
        ? []
        : await this.deps.db
            .select()
            .from(commPlatformInboxIndex)
            .where(
              and(
                eq(commPlatformInboxIndex.companyId, actor.companyId),
                inArray(commPlatformInboxIndex.id, ids),
              ),
            );

    const byId = new Map(rows.map((r) => [r.id, r]));
    const items: EmailCentreMessageSummary[] = result.items.map((item) => {
      const row = byId.get(item.id);
      const gmailAttachments =
        (row?.metadata?.attachments as EmailCentreMessageSummary['gmailAttachments']) ?? undefined;
      return {
        ...item,
        externalThreadId: row?.externalThreadId ?? null,
        externalMessageId: row?.externalMessageId ?? null,
        gmailAttachments,
      };
    });

    return {
      items,
      total: result.total,
      emptyReason: result.emptyReason,
    };
  }

  async getThreadHistory(
    actor: CommPlatformActor,
    inboxItemId: string,
  ): Promise<EmailCentreThreadHistory> {
    const [anchor] = await this.deps.db
      .select()
      .from(commPlatformInboxIndex)
      .where(
        and(
          eq(commPlatformInboxIndex.id, inboxItemId),
          eq(commPlatformInboxIndex.companyId, actor.companyId),
          eq(commPlatformInboxIndex.channel, 'email'),
        ),
      )
      .limit(1);

    if (!anchor) {
      throw new EmailCentreError('NOT_FOUND', 'Email not found in Gmail index');
    }

    const threadId = anchor.externalThreadId;
    const threadRows = threadId
      ? await this.deps.db
          .select()
          .from(commPlatformInboxIndex)
          .where(
            and(
              eq(commPlatformInboxIndex.companyId, actor.companyId),
              eq(commPlatformInboxIndex.channel, 'email'),
              eq(commPlatformInboxIndex.externalThreadId, threadId),
            ),
          )
          .orderBy(desc(commPlatformInboxIndex.occurredAt))
          .limit(100)
      : [anchor];

    const attachmentLinks = await this.listAttachments(actor, {
      anchorType: 'inbox_item',
      anchorId: inboxItemId,
      limit: 50,
    });

    const linkedCustomerId =
      anchor.linkTargetType === 'customer' ? anchor.linkTargetId : null;
    const linkedJobId =
      anchor.linkTargetType === 'job'
        ? anchor.linkTargetId
        : (anchor.assignedJobId ?? null);

    return {
      threadId,
      messages: threadRows.map((row) => ({
        id: row.id,
        subject: row.subject,
        preview: row.preview,
        direction: row.direction,
        participantLabel: row.participantLabel,
        occurredAt: row.occurredAt.toISOString(),
        folder: row.folder,
        unread: row.unread,
        attachmentCount: row.attachmentCount,
        linkTargetType: row.linkTargetType,
        linkTargetId: row.linkTargetId,
        externalMessageId: row.externalMessageId,
      })),
      linkedCustomerId,
      linkedJobId,
      attachmentLinks,
      composePath: 'gmail_draft_approve_execute',
      composeNote:
        'Reply and forward create Gmail drafts. Send requires Owner/staff approve → execute via Gmail API. Resend is not used for this path.',
    };
  }

  async createReplyOrForwardDraft(
    actor: CommPlatformActor,
    input: EmailCentreReplyRequest,
  ): Promise<EmailCentreDraftSummary> {
    if (isTechnicianRole(actor)) {
      throw new EmailCentreError('FORBIDDEN', 'Technicians cannot compose Email Centre drafts');
    }

    let replyToMessageId = input.replyToMessageId;
    let forwardOfMessageId = input.forwardOfMessageId;

    if (input.inboxItemId) {
      const [row] = await this.deps.db
        .select()
        .from(commPlatformInboxIndex)
        .where(
          and(
            eq(commPlatformInboxIndex.id, input.inboxItemId),
            eq(commPlatformInboxIndex.companyId, actor.companyId),
          ),
        )
        .limit(1);
      if (!row) {
        throw new EmailCentreError('NOT_FOUND', 'Inbox item not found');
      }
      if (!replyToMessageId && !forwardOfMessageId) {
        replyToMessageId = row.externalMessageId ?? undefined;
      }
      if (forwardOfMessageId === 'inbox') {
        forwardOfMessageId = row.externalMessageId ?? undefined;
      }
    }

    const draft = await this.deps.communicationsPlatformService.createGmailDraft(actor, {
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      bodyText: input.bodyText,
      replyToMessageId,
      forwardOfMessageId:
        forwardOfMessageId && forwardOfMessageId !== 'inbox' ? forwardOfMessageId : undefined,
      labelIds: input.labelIds,
    });

    const attachmentLinks: CommAttachmentLinkSummary[] = [];
    for (const link of input.attachmentLinks ?? []) {
      attachmentLinks.push(
        await this.createAttachmentLink(actor, {
          ...link,
          anchorType: 'gmail_draft',
          anchorId: draft.id,
        }),
      );
    }

    await this.recordAudit(actor, 'email_centre_draft_created', draft.id, {
      subject: draft.subject,
      attachmentCount: attachmentLinks.length,
      autoSend: false,
    });

    return {
      ...draft,
      attachmentLinks,
      sendProvider: 'gmail_api',
    };
  }

  async approveDraft(actor: CommPlatformActor, draftId: string): Promise<EmailCentreDraftSummary> {
    const draft = await this.deps.communicationsPlatformService.approveGmailDraft(actor, draftId);
    const attachmentLinks = await this.listAttachments(actor, {
      anchorType: 'gmail_draft',
      anchorId: draftId,
    });
    return { ...draft, attachmentLinks, sendProvider: 'gmail_api' };
  }

  async executeDraft(actor: CommPlatformActor, draftId: string): Promise<EmailCentreDraftSummary> {
    const links = await this.listAttachments(actor, {
      anchorType: 'gmail_draft',
      anchorId: draftId,
    });

    if (links.length > 0) {
      const [existing] = await this.deps.db
        .select()
        .from(commPlatformGmailDrafts)
        .where(
          and(
            eq(commPlatformGmailDrafts.id, draftId),
            eq(commPlatformGmailDrafts.companyId, actor.companyId),
          ),
        )
        .limit(1);
      if (existing) {
        const appendix = [
          '',
          '---',
          'Linked TITAN documents (references — not binary re-uploads):',
          ...links.map((l) => `- ${l.attachmentKind}: ${l.label} (${l.entityType}/${l.entityId})`),
        ].join('\n');
        await this.deps.db
          .update(commPlatformGmailDrafts)
          .set({
            bodyText: `${existing.bodyText}${appendix}`,
            updatedAt: new Date(),
            metadata: {
              ...(existing.metadata ?? {}),
              linkedAttachmentIds: links.map((l) => l.id),
            },
          })
          .where(eq(commPlatformGmailDrafts.id, draftId));
      }
    }

    const draft = await this.deps.communicationsPlatformService.executeGmailDraft(actor, draftId);
    await this.upsertTimelineEntry(actor.companyId, {
      customerId: links.find((l) => l.customerId)?.customerId ?? null,
      jobId: links.find((l) => l.jobId)?.jobId ?? null,
      entryType: 'email',
      channel: 'email',
      title: draft.subject,
      summary: `Outbound email executed via Gmail (${draft.to.join(', ')})`,
      sourceModule: 'comm_platform_gmail_draft',
      sourceEntityId: draft.id,
      occurredAt: new Date(),
      metadata: { status: draft.status, sendProvider: 'gmail_api', attachmentCount: links.length },
    });

    return { ...draft, attachmentLinks: links, sendProvider: 'gmail_api' };
  }

  async listDrafts(actor: CommPlatformActor): Promise<EmailCentreDraftSummary[]> {
    const rows = await this.deps.db
      .select()
      .from(commPlatformGmailDrafts)
      .where(eq(commPlatformGmailDrafts.companyId, actor.companyId))
      .orderBy(desc(commPlatformGmailDrafts.createdAt))
      .limit(50);

    const result: EmailCentreDraftSummary[] = [];
    for (const row of rows) {
      const attachmentLinks = await this.listAttachments(actor, {
        anchorType: 'gmail_draft',
        anchorId: row.id,
      });
      result.push({
        id: row.id,
        status: row.status,
        subject: row.subject,
        to: row.toAddresses,
        createdAt: row.createdAt.toISOString(),
        requiresApproval: true,
        note:
          row.status === 'draft' || row.status === 'pending_approval'
            ? 'Awaiting approve → execute. No auto-send.'
            : row.status === 'approved'
              ? 'Approved. Execute is a separate step.'
              : row.status === 'executed'
                ? 'Sent via Gmail API after explicit approval.'
                : `Status: ${row.status}`,
        attachmentLinks,
        sendProvider: 'gmail_api',
      });
    }
    return result;
  }

  async linkEmail(
    actor: CommPlatformActor,
    inboxItemId: string,
    link: { linkTargetType: 'customer' | 'job' | 'lead' | 'quote' | 'invoice'; linkTargetId: string },
  ) {
    const item = await this.deps.communicationsPlatformService.linkInboxItem(actor, inboxItemId, {
      linkTargetType: link.linkTargetType,
      linkTargetId: link.linkTargetId,
    });

    const customerId = link.linkTargetType === 'customer' ? link.linkTargetId : null;
    const jobId = link.linkTargetType === 'job' ? link.linkTargetId : null;

    await this.upsertTimelineEntry(actor.companyId, {
      customerId,
      jobId,
      entryType: 'email',
      channel: 'email',
      title: item.subject ?? 'Linked email',
      summary: item.preview,
      sourceModule: 'comm_platform_inbox_index',
      sourceEntityId: item.id,
      occurredAt: new Date(item.occurredAt),
      metadata: { linkTargetType: link.linkTargetType, linkTargetId: link.linkTargetId },
    });

    return item;
  }

  async createAttachmentLink(
    actor: CommPlatformActor,
    input: CreateCommAttachmentLinkRequest,
  ): Promise<CommAttachmentLinkSummary> {
    if (isTechnicianRole(actor)) {
      throw new EmailCentreError('FORBIDDEN', 'Technicians cannot attach documents in Email Centre');
    }

    await this.assertEntityExists(actor.companyId, input.attachmentKind, input.entityId);

    const expectedEntityType = ENTITY_KIND_MAP[input.attachmentKind];
    const entityType = input.entityType || expectedEntityType;

    const [row] = await this.deps.db
      .insert(commAttachmentLinks)
      .values({
        companyId: actor.companyId,
        anchorType: input.anchorType,
        anchorId: input.anchorId,
        attachmentKind: input.attachmentKind,
        entityType,
        entityId: input.entityId,
        documentId: input.documentId ?? null,
        customerId: input.customerId ?? null,
        jobId: input.jobId ?? null,
        label: input.label,
        fileName: input.fileName ?? null,
        mimeType: input.mimeType ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          storage: 'entity_reference',
          note: 'Links existing TITAN entity IDs — does not re-upload blobs',
        },
        createdByUserId: actor.userId,
      })
      .returning();

    await this.upsertTimelineEntry(actor.companyId, {
      customerId: input.customerId ?? null,
      jobId: input.jobId ?? null,
      entryType: 'attachment',
      channel: null,
      title: `Attached ${input.attachmentKind}: ${input.label}`,
      summary: `${entityType}/${input.entityId}`,
      sourceModule: 'comm_attachment_links',
      sourceEntityId: row!.id,
      occurredAt: new Date(),
      metadata: {
        attachmentKind: input.attachmentKind,
        anchorType: input.anchorType,
        anchorId: input.anchorId,
      },
    });

    await this.recordAudit(actor, 'email_centre_attachment_linked', row!.id, {
      attachmentKind: input.attachmentKind,
      entityId: input.entityId,
      anchorType: input.anchorType,
    });

    return this.toAttachmentSummary(row!);
  }

  async listAttachments(
    actor: CommPlatformActor,
    options: {
      anchorType?: CommAttachmentAnchorType;
      anchorId?: string;
      customerId?: string;
      jobId?: string;
      limit?: number;
    } = {},
  ): Promise<CommAttachmentLinkSummary[]> {
    const conditions = [eq(commAttachmentLinks.companyId, actor.companyId)];
    if (options.anchorType) conditions.push(eq(commAttachmentLinks.anchorType, options.anchorType));
    if (options.anchorId) conditions.push(eq(commAttachmentLinks.anchorId, options.anchorId));
    if (options.customerId) conditions.push(eq(commAttachmentLinks.customerId, options.customerId));
    if (options.jobId) conditions.push(eq(commAttachmentLinks.jobId, options.jobId));

    const rows = await this.deps.db
      .select()
      .from(commAttachmentLinks)
      .where(and(...conditions))
      .orderBy(desc(commAttachmentLinks.createdAt))
      .limit(options.limit ?? 100);

    return rows.map((row) => this.toAttachmentSummary(row));
  }

  async createTimelineNote(
    actor: CommPlatformActor,
    input: CreateCommTimelineNoteRequest,
  ): Promise<CommTimelineNoteSummary> {
    if (!input.body.trim()) {
      throw new EmailCentreError('VALIDATION_ERROR', 'Note body is required');
    }

    const [note] = await this.deps.db
      .insert(commTimelineNotes)
      .values({
        companyId: actor.companyId,
        customerId: input.customerId ?? null,
        jobId: input.jobId ?? null,
        body: input.body.trim(),
        statusUpdate: input.statusUpdate?.trim() || null,
        createdByUserId: actor.userId,
        metadata: input.metadata ?? {},
      })
      .returning();

    const attachmentLinks: CommAttachmentLinkSummary[] = [];
    if (input.attachmentLinks?.length) {
      for (const link of input.attachmentLinks) {
        attachmentLinks.push(
          await this.createAttachmentLink(actor, {
            ...link,
            anchorType: 'timeline_note',
            anchorId: note!.id,
            customerId: link.customerId ?? input.customerId,
            jobId: link.jobId ?? input.jobId,
          }),
        );
      }
    }

    await this.upsertTimelineEntry(actor.companyId, {
      customerId: input.customerId ?? null,
      jobId: input.jobId ?? null,
      entryType: 'internal_note',
      channel: null,
      title: input.statusUpdate?.trim() || 'Internal note',
      summary: input.body.trim().slice(0, 500),
      sourceModule: 'comm_timeline_notes',
      sourceEntityId: note!.id,
      occurredAt: note!.createdAt,
      metadata: { statusUpdate: input.statusUpdate ?? null },
    });

    await this.recordAudit(actor, 'email_centre_timeline_note_created', note!.id, {
      customerId: input.customerId ?? null,
      jobId: input.jobId ?? null,
    });

    return {
      id: note!.id,
      body: note!.body,
      statusUpdate: note!.statusUpdate,
      customerId: note!.customerId,
      jobId: note!.jobId,
      createdByUserId: note!.createdByUserId,
      createdAt: note!.createdAt.toISOString(),
      attachmentLinks,
    };
  }

  async getTimeline(
    actor: CommPlatformActor,
    filter: CommunicationTimelineFilter = {},
  ): Promise<CommunicationTimelineResult> {
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    const conditions = [eq(ucTimelineIndex.companyId, actor.companyId)];
    if (filter.customerId) conditions.push(eq(ucTimelineIndex.customerId, filter.customerId));
    if (filter.jobId) conditions.push(eq(ucTimelineIndex.jobId, filter.jobId));
    if (filter.entryType) {
      conditions.push(
        eq(ucTimelineIndex.entryType, filter.entryType as typeof ucTimelineIndex.$inferSelect.entryType),
      );
    }
    if (filter.channel && filter.channel !== 'all' && filter.channel !== 'note' && filter.channel !== 'attachment') {
      conditions.push(
        eq(
          ucTimelineIndex.channel,
          filter.channel as NonNullable<typeof ucTimelineIndex.$inferSelect.channel>,
        ),
      );
    }
    if (filter.channel === 'note') {
      conditions.push(eq(ucTimelineIndex.entryType, 'internal_note'));
    }
    if (filter.channel === 'attachment') {
      conditions.push(eq(ucTimelineIndex.entryType, 'attachment'));
    }

    const rows = await this.deps.db
      .select()
      .from(ucTimelineIndex)
      .where(and(...conditions))
      .orderBy(desc(ucTimelineIndex.occurredAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(ucTimelineIndex)
      .where(and(...conditions));

    const entries: CommunicationTimelineEntry[] = [];
    for (const row of rows) {
      const attachmentLinks = await this.listAttachments(actor, {
        anchorType: 'timeline_entry',
        anchorId: row.id,
        limit: 20,
      });
      // Also surface links that use the source entity as anchor
      const sourceLinks =
        row.sourceEntityId != null
          ? await this.listAttachments(actor, {
              anchorId: row.sourceEntityId,
              limit: 20,
            })
          : [];
      const merged = dedupeAttachments([...attachmentLinks, ...sourceLinks]);
      entries.push({
        id: row.id,
        customerId: row.customerId,
        jobId: row.jobId ?? null,
        entryType: row.entryType,
        channel: row.channel,
        title: row.title,
        summary: row.summary,
        sourceModule: row.sourceModule,
        sourceEntityId: row.sourceEntityId,
        occurredAt: row.occurredAt.toISOString(),
        attachmentLinks: merged,
      });
    }

    return {
      entries,
      total: count ?? entries.length,
      filtersApplied: filter,
      sources: {
        gmailInbox: true,
        whatsappBusiness: true,
        crmCommunications: true,
        timelineNotes: true,
        attachmentLinks: true,
        personalWhatsappIntelligence: 'readiness_only',
      },
      syncNote:
        'Unified timeline indexes Gmail inbox, WhatsApp Business, CRM communications, notes, and attachment links into uc_timeline_index. Personal WA intelligence is readiness-only.',
    };
  }

  async syncTimeline(actor: CommPlatformActor): Promise<CommunicationTimelineResult> {
    if (this.deps.enterpriseUnifiedCommunicationsService) {
      await this.deps.enterpriseUnifiedCommunicationsService.syncTimelineFromModules(
        actor.companyId,
      );
    }

    // Ingest Business Gmail index into uc_timeline_index (same table — no parallel silo)
    const inboxRows = await this.deps.db
      .select()
      .from(commPlatformInboxIndex)
      .where(
        and(
          eq(commPlatformInboxIndex.companyId, actor.companyId),
          eq(commPlatformInboxIndex.channel, 'email'),
        ),
      )
      .orderBy(desc(commPlatformInboxIndex.occurredAt))
      .limit(100);

    for (const row of inboxRows) {
      await this.upsertTimelineEntry(actor.companyId, {
        customerId: row.linkTargetType === 'customer' ? row.linkTargetId : null,
        jobId:
          row.linkTargetType === 'job'
            ? row.linkTargetId
            : (row.assignedJobId ?? null),
        entryType: 'email',
        channel: 'email',
        title: row.subject ?? 'Email',
        summary: row.preview,
        sourceModule: 'comm_platform_inbox_index',
        sourceEntityId: row.id,
        occurredAt: row.occurredAt,
        metadata: {
          direction: row.direction,
          accountKind: row.accountKind,
          externalThreadId: row.externalThreadId,
        },
      });
    }

    // Ingest WhatsApp Business index rows
    const waRows = await this.deps.db
      .select()
      .from(commPlatformInboxIndex)
      .where(
        and(
          eq(commPlatformInboxIndex.companyId, actor.companyId),
          eq(commPlatformInboxIndex.channel, 'whatsapp'),
          eq(commPlatformInboxIndex.accountKind, 'business_whatsapp'),
        ),
      )
      .orderBy(desc(commPlatformInboxIndex.occurredAt))
      .limit(100);

    for (const row of waRows) {
      await this.upsertTimelineEntry(actor.companyId, {
        customerId: row.linkTargetType === 'customer' ? row.linkTargetId : null,
        jobId:
          row.linkTargetType === 'job'
            ? row.linkTargetId
            : (row.assignedJobId ?? null),
        entryType: 'whatsapp',
        channel: 'whatsapp',
        title: row.subject ?? row.participantLabel ?? 'WhatsApp',
        summary: row.preview,
        sourceModule: 'comm_platform_inbox_index',
        sourceEntityId: row.id,
        occurredAt: row.occurredAt,
        metadata: { direction: row.direction, accountKind: 'business_whatsapp' },
      });
    }

    // Re-index notes
    const notes = await this.deps.db
      .select()
      .from(commTimelineNotes)
      .where(eq(commTimelineNotes.companyId, actor.companyId))
      .orderBy(desc(commTimelineNotes.createdAt))
      .limit(100);

    for (const note of notes) {
      await this.upsertTimelineEntry(actor.companyId, {
        customerId: note.customerId,
        jobId: note.jobId,
        entryType: 'internal_note',
        channel: null,
        title: note.statusUpdate ?? 'Internal note',
        summary: note.body.slice(0, 500),
        sourceModule: 'comm_timeline_notes',
        sourceEntityId: note.id,
        occurredAt: note.createdAt,
        metadata: {},
      });
    }

    await this.recordAudit(actor, 'email_centre_timeline_synced', actor.companyId, {
      gmailIngested: inboxRows.length,
      whatsappIngested: waRows.length,
      notesIngested: notes.length,
    });

    return this.getTimeline(actor, { limit: 50 });
  }

  private async countPendingDrafts(companyId: string): Promise<number> {
    const [{ count }] = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(commPlatformGmailDrafts)
      .where(
        and(
          eq(commPlatformGmailDrafts.companyId, companyId),
          inArray(commPlatformGmailDrafts.status, ['draft', 'pending_approval', 'approved']),
        ),
      );
    return count ?? 0;
  }

  private async assertEntityExists(
    companyId: string,
    kind: CommAttachmentKind,
    entityId: string,
  ): Promise<void> {
    let found = false;
    switch (kind) {
      case 'quote': {
        const [row] = await this.deps.db
          .select({ id: quotes.id })
          .from(quotes)
          .where(and(eq(quotes.id, entityId), eq(quotes.companyId, companyId)))
          .limit(1);
        found = Boolean(row);
        break;
      }
      case 'boq': {
        const [row] = await this.deps.db
          .select({ id: boqDocuments.id })
          .from(boqDocuments)
          .where(and(eq(boqDocuments.id, entityId), eq(boqDocuments.companyId, companyId)))
          .limit(1);
        found = Boolean(row);
        break;
      }
      case 'invoice': {
        const [row] = await this.deps.db
          .select({ id: invoices.id })
          .from(invoices)
          .where(and(eq(invoices.id, entityId), eq(invoices.companyId, companyId)))
          .limit(1);
        found = Boolean(row);
        break;
      }
      case 'receipt': {
        const [row] = await this.deps.db
          .select({ id: paymentReceipts.id })
          .from(paymentReceipts)
          .where(and(eq(paymentReceipts.id, entityId), eq(paymentReceipts.companyId, companyId)))
          .limit(1);
        found = Boolean(row);
        break;
      }
      case 'coc':
      case 'report':
      case 'job_photo':
      case 'document': {
        const [row] = await this.deps.db
          .select({ id: documents.id })
          .from(documents)
          .where(and(eq(documents.id, entityId), eq(documents.companyId, companyId)))
          .limit(1);
        found = Boolean(row);
        break;
      }
      default:
        found = false;
    }

    if (!found) {
      throw new EmailCentreError(
        'VALIDATION_ERROR',
        `Attachment entity not found for kind=${kind} (tenant-scoped)`,
      );
    }
  }

  private async upsertTimelineEntry(
    companyId: string,
    input: {
      customerId: string | null;
      jobId: string | null;
      entryType: typeof ucTimelineIndex.$inferInsert.entryType;
      channel: typeof ucTimelineIndex.$inferInsert.channel;
      title: string;
      summary: string | null | undefined;
      sourceModule: string;
      sourceEntityId: string;
      occurredAt: Date;
      metadata: Record<string, unknown>;
    },
  ): Promise<void> {
    const existing = await this.deps.db.query.ucTimelineIndex.findFirst({
      where: and(
        eq(ucTimelineIndex.companyId, companyId),
        eq(ucTimelineIndex.sourceModule, input.sourceModule),
        eq(ucTimelineIndex.sourceEntityId, input.sourceEntityId),
      ),
    });

    if (existing) {
      await this.deps.db
        .update(ucTimelineIndex)
        .set({
          customerId: input.customerId ?? existing.customerId,
          jobId: input.jobId ?? existing.jobId,
          title: input.title,
          summary: input.summary ?? existing.summary,
          occurredAt: input.occurredAt,
          metadata: { ...(existing.metadata ?? {}), ...input.metadata },
        })
        .where(eq(ucTimelineIndex.id, existing.id));
      return;
    }

    await this.deps.db.insert(ucTimelineIndex).values({
      companyId,
      customerId: input.customerId,
      jobId: input.jobId,
      entryType: input.entryType,
      channel: input.channel,
      title: input.title,
      summary: input.summary ?? null,
      sourceModule: input.sourceModule,
      sourceEntityId: input.sourceEntityId,
      occurredAt: input.occurredAt,
      metadata: input.metadata,
    });
  }

  private toAttachmentSummary(
    row: typeof commAttachmentLinks.$inferSelect,
  ): CommAttachmentLinkSummary {
    return {
      id: row.id,
      anchorType: row.anchorType,
      anchorId: row.anchorId,
      attachmentKind: row.attachmentKind,
      entityType: row.entityType,
      entityId: row.entityId,
      documentId: row.documentId,
      customerId: row.customerId,
      jobId: row.jobId,
      label: row.label,
      fileName: row.fileName,
      mimeType: row.mimeType,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async recordAudit(
    actor: CommPlatformActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.deps.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'communications',
      action,
      entityType: 'email_centre',
      entityId,
      userId: actor.userId,
      metadata: { ...metadata, autoSend: false },
    });
  }
}

function dedupeAttachments(items: CommAttachmentLinkSummary[]): CommAttachmentLinkSummary[] {
  const seen = new Set<string>();
  const out: CommAttachmentLinkSummary[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
