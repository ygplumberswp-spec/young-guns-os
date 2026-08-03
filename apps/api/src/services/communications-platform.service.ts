import { and, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { isPlatformOwnerRole, isTechnicianRole } from '@titan/auth';
import {
  canAccessBusinessCommunications,
  canAccessPersonalWhatsappAssistant,
  canSyncBusinessGmail,
  technicianJobScopedOnly,
  type CommPlatformAccountKind,
  type CommPlatformAuraDraftAssistResult,
  type CommPlatformAuraHookSummary,
  type CommPlatformCapabilityState,
  type CommPlatformConnectionHealth,
  type CommPlatformGmailAttachmentMeta,
  type CommPlatformGmailDraftRequest,
  type CommPlatformGmailDraftSummary,
  type CommPlatformGmailMailboxView,
  type CommPlatformGmailSyncResult,
  type CommPlatformHubDashboard,
  type CommPlatformImportDecisionRequest,
  type CommPlatformImportDecisionSummary,
  type CommPlatformInboxFilter,
  type CommPlatformInboxItemSummary,
  type CommPlatformInboxResult,
  type CommPlatformLinkRequest,
  type CommPlatformSearchResult,
  type CommPlatformSettingsSummary,
  type CommPlatformSmartDetectionPrompt,
  type CommPlatformTestConnectionResult,
  type CommPlatformWhatsappChatSummary,
  type SaveCommPlatformGmailConnectionRequest,
  type SaveCommPlatformPersonalWhatsappRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  commPlatformAccounts,
  commPlatformGmailDrafts,
  commPlatformImportDecisions,
  commPlatformInboxIndex,
  commPlatformPersonalThreads,
  companies,
  customers,
  invoices,
  jobs,
  leads,
  quotes,
  securityAuditLogs,
  whatsappConnections,
  whatsappMessages,
} from '@titan/db';
import {
  decryptGmailCredentials,
  encryptGmailCredentials,
  encryptWhatsappCredentials,
  type GmailOAuthStoredCredentials,
} from '../lib/crypto.js';
import {
  collectAttachments,
  encodeRawMime,
  extractTextBody,
  folderQuery,
  getHeader,
  type GmailMessage,
} from '../lib/gmail.client.js';
import {
  extractEmailsFromHeader,
  normalizeEmail,
  resolveConfidentGmailEntityLink,
  type GmailEntityLinkLookups,
} from './gmail-entity-link.js';
import { GmailClientError } from '../lib/gmail.client.js';
import { GmailOAuthError, type GmailOAuthService } from './gmail-oauth.service.js';

export class CommunicationsPlatformError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CommunicationsPlatformError';
  }
}

export type CommPlatformActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

type TenantScope = { companyId: string; userId: string };

const EMPTY_GMAIL: CommPlatformConnectionHealth = {
  accountKind: 'business_gmail',
  label: 'Business Gmail',
  status: 'not_configured',
  connected: false,
  hasCredentials: false,
  lastTestAt: null,
  lastTestStatus: null,
  lastTestMessage: null,
  lastError: null,
  privacyDefault: 'business',
  syncEnabled: false,
  retentionDays: null,
  oauthConfigured: false,
  emailAddress: null,
  lastSyncAt: null,
  lastSyncStatus: null,
  lastSyncError: null,
  emptyStateMessage:
    'Business Gmail is not configured. Set Google OAuth credentials, then connect Business Gmail — no messages are invented.',
};

/** In-process lock so concurrent Sync Now clicks don't start duplicate imports. */
const activeGmailSyncCompanyIds = new Set<string>();
const GMAIL_SYNC_STALE_MS = 10 * 60 * 1000;

const EMPTY_BUSINESS_WA: CommPlatformConnectionHealth = {
  accountKind: 'business_whatsapp',
  label: 'Business WhatsApp',
  status: 'not_configured',
  connected: false,
  hasCredentials: false,
  lastTestAt: null,
  lastTestStatus: null,
  lastTestMessage: null,
  lastError: null,
  privacyDefault: 'business',
  syncEnabled: false,
  retentionDays: null,
  emptyStateMessage:
    'Business WhatsApp is not connected. Configure the official Meta Cloud API channel — inbox stays empty until real messages arrive.',
};

const EMPTY_PERSONAL_WA: CommPlatformConnectionHealth = {
  accountKind: 'personal_whatsapp',
  label: 'Personal WhatsApp Assistant',
  status: 'not_configured',
  connected: false,
  hasCredentials: false,
  lastTestAt: null,
  lastTestStatus: null,
  lastTestMessage: null,
  lastError: null,
  privacyDefault: 'private',
  syncEnabled: false,
  retentionDays: null,
  emptyStateMessage:
    'Optional Personal WhatsApp Assistant is not configured. Platform Owner only — private by default, never auto-imported into business search.',
};

export class CommunicationsPlatformService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly encryptionKey?: string,
    private readonly gmailOAuthService?: GmailOAuthService,
  ) {}

  static create(deps: {
    db: DatabaseClient;
    encryptionKey?: string;
    gmailOAuthService?: GmailOAuthService;
  }): CommunicationsPlatformService {
    return new CommunicationsPlatformService(
      deps.db,
      deps.encryptionKey,
      deps.gmailOAuthService,
    );
  }

  assertBusinessAccess(actor: CommPlatformActor): void {
    if (!canAccessBusinessCommunications(actor)) {
      throw new CommunicationsPlatformError(
        'FORBIDDEN',
        'Business communications access required',
      );
    }
  }

  assertPersonalAccess(actor: CommPlatformActor): void {
    if (!isPlatformOwnerRole(actor) || !canAccessPersonalWhatsappAssistant(actor)) {
      throw new CommunicationsPlatformError(
        'FORBIDDEN',
        'Personal WhatsApp Assistant is Platform Owner only',
      );
    }
  }

  async getHubDashboard(actor: CommPlatformActor): Promise<CommPlatformHubDashboard> {
    this.assertBusinessAccess(actor);
    const isOwner = isPlatformOwnerRole(actor);
    const settings = await this.getSettings(actor);
    const inbox = await this.listInbox(actor, { limit: 25 });
    return {
      summary: isOwner
        ? 'Communications Platform — business channels plus optional personal assistant (owner-only). Real data only; send requires approval.'
        : 'Communications Platform — business Gmail and WhatsApp. Personal assistant is not visible for your role.',
      isPlatformOwner: isOwner,
      settings,
      inbox,
      auraHooks: this.listAuraHooks(actor),
      sendPolicy: {
        autoSendEnabled: false,
        requiresOwnerOrStaffApproval: true,
        draftApproveExecute: true,
      },
    };
  }

  listAuraHooks(actor: CommPlatformActor): CommPlatformAuraHookSummary[] {
    const isOwner = isPlatformOwnerRole(actor);
    return [
      {
        capability: 'business_summarize',
        available: true,
        ownerOnly: false,
        exposesPersonalData: false,
        status: 'ready',
        note: 'Business-only summarize over indexed Gmail — personal threads never included. Never auto-sends.',
      },
      {
        capability: 'business_draft',
        available: true,
        ownerOnly: false,
        exposesPersonalData: false,
        status: 'ready',
        note: 'AURA may draft replies only; send requires explicit Owner/staff approval (draft → approve → execute).',
      },
      {
        capability: 'business_emergency',
        available: true,
        ownerOnly: false,
        exposesPersonalData: false,
        status: 'stub',
        note: 'Emergency triage stub over business channels only.',
      },
      {
        capability: 'business_job_suggest',
        available: true,
        ownerOnly: false,
        exposesPersonalData: false,
        status: 'stub',
        note: 'Job suggest stub from business conversations — no personal data.',
      },
      {
        capability: 'personal_assist',
        available: isOwner,
        ownerOnly: true,
        exposesPersonalData: true,
        status: isOwner ? 'stub' : 'forbidden',
        note: isOwner
          ? 'Owner-only personal assist stub — never exposed to other roles.'
          : 'Forbidden for non-owner roles.',
      },
    ];
  }

  async getSettings(actor: CommPlatformActor): Promise<CommPlatformSettingsSummary> {
    this.assertBusinessAccess(actor);
    const accounts = await this.db
      .select()
      .from(commPlatformAccounts)
      .where(eq(commPlatformAccounts.companyId, actor.companyId));

    const gmail =
      accounts.find((a) => a.accountKind === 'business_gmail') ?? null;
    const businessWaAccount =
      accounts.find((a) => a.accountKind === 'business_whatsapp') ?? null;

    // Reflect existing WhatsApp connection when platform row missing
    const [legacyWa] = await this.db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.companyId, actor.companyId))
      .limit(1);

    const oauthConfigured = this.gmailOAuthService?.isAppConfigured() ?? false;
    const businessGmail = this.toHealth(gmail, EMPTY_GMAIL, {
      oauthConfigured,
      preferNotConfiguredWhenOAuthMissing: true,
    });
    let businessWhatsapp = this.toHealth(businessWaAccount, EMPTY_BUSINESS_WA);
    if (!businessWaAccount && legacyWa) {
      const connected = legacyWa.status === 'connected';
      businessWhatsapp = {
        ...EMPTY_BUSINESS_WA,
        status: connected
          ? 'connected'
          : legacyWa.status === 'error'
            ? 'error'
            : legacyWa.status === 'pending'
              ? 'pending'
              : 'disconnected',
        connected,
        hasCredentials: Boolean(legacyWa.credentialsEncrypted),
        lastError: legacyWa.lastError,
        emptyStateMessage: connected
          ? 'Business WhatsApp connected via Integration Hub — messages appear when received.'
          : EMPTY_BUSINESS_WA.emptyStateMessage,
      };
    }

    let personalWhatsapp: CommPlatformConnectionHealth | null = null;
    if (isPlatformOwnerRole(actor)) {
      const personal =
        accounts.find(
          (a) =>
            a.accountKind === 'personal_whatsapp' && a.ownerUserId === actor.userId,
        ) ?? null;
      personalWhatsapp = this.toHealth(personal, EMPTY_PERSONAL_WA);
    }

    return {
      businessGmail,
      businessWhatsapp,
      personalWhatsapp,
      privacy: {
        personalPrivateByDefault: true,
        personalNeverInBusinessSearch: true,
        personalNeverAutoImport: true,
        requireApprovalToSend: true,
      },
      healthSummary: this.healthSummaryLine(businessGmail, businessWhatsapp, personalWhatsapp),
    };
  }

  async listInbox(
    actor: CommPlatformActor,
    filter: CommPlatformInboxFilter = {},
  ): Promise<CommPlatformInboxResult> {
    this.assertBusinessAccess(actor);
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
    const offset = Math.max(filter.offset ?? 0, 0);
    const includePersonal =
      Boolean(filter.includePersonal) && isPlatformOwnerRole(actor);

    const conditions: SQL[] = [eq(commPlatformInboxIndex.companyId, actor.companyId)];

    if (filter.channel && filter.channel !== 'all') {
      conditions.push(eq(commPlatformInboxIndex.channel, filter.channel));
    }
    if (filter.unread) conditions.push(eq(commPlatformInboxIndex.unread, true));
    if (filter.urgent) conditions.push(eq(commPlatformInboxIndex.urgent, true));
    if (filter.participantKind && filter.participantKind !== 'all') {
      conditions.push(eq(commPlatformInboxIndex.participantKind, filter.participantKind));
    }
    if (filter.folder) {
      conditions.push(eq(commPlatformInboxIndex.folder, filter.folder));
    }
    if (filter.linkTargetType) {
      conditions.push(eq(commPlatformInboxIndex.linkTargetType, filter.linkTargetType));
    }
    if (filter.linkTargetId) {
      conditions.push(eq(commPlatformInboxIndex.linkTargetId, filter.linkTargetId));
    }
    if (filter.accountKind === 'business_gmail' || filter.accountKind === 'business_whatsapp') {
      conditions.push(eq(commPlatformInboxIndex.accountKind, filter.accountKind));
    }
    // personal never in business inbox index
    if (filter.accountKind === 'personal') {
      // handled via personal endpoint only
    }
    if (filter.q?.trim()) {
      const q = `%${filter.q.trim()}%`;
      conditions.push(
        or(
          ilike(commPlatformInboxIndex.subject, q),
          ilike(commPlatformInboxIndex.preview, q),
          ilike(commPlatformInboxIndex.participantLabel, q),
        )!,
      );
    }

    if (technicianJobScopedOnly(actor) || isTechnicianRole(actor)) {
      const assigned = await this.db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.companyId, actor.companyId), eq(jobs.assignedUserId, actor.userId)));
      const jobIds = assigned.map((j) => j.id);
      if (jobIds.length === 0) {
        return {
          items: [],
          total: 0,
          filtersApplied: filter,
          includesPersonal: false,
          emptyReason: 'role_filtered',
          capabilityNotes: [
            'Technicians only see conversations linked to assigned jobs.',
          ],
        };
      }
      conditions.push(inArray(commPlatformInboxIndex.assignedJobId, jobIds));
    }

    const rows = await this.db
      .select()
      .from(commPlatformInboxIndex)
      .where(and(...conditions))
      .orderBy(desc(commPlatformInboxIndex.occurredAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(commPlatformInboxIndex)
      .where(and(...conditions));

    const items = rows.map((row) => this.toInboxItem(row));

    // Personal threads are NEVER merged into business list unless owner explicitly
    // requested includePersonal — and even then they come from the isolation table,
    // never from business search indexes.
    let includesPersonal = false;
    if (includePersonal && filter.accountKind !== 'business') {
      const personalItems = await this.listPersonalChatsAsInboxItems(actor, limit);
      items.unshift(...personalItems);
      includesPersonal = personalItems.length > 0;
    }

    const settings = await this.getSettings(actor);
    const anyConnected =
      settings.businessGmail.connected || settings.businessWhatsapp.connected;

    return {
      items,
      total: Number(count) + (includesPersonal ? 0 : 0),
      filtersApplied: { ...filter, includePersonal },
      includesPersonal,
      emptyReason:
        items.length > 0
          ? 'none'
          : !anyConnected
            ? 'not_configured'
            : 'no_matches',
      capabilityNotes: [
        'Business inbox only indexes business_gmail and business_whatsapp.',
        'Personal WhatsApp is never present in business search indexes.',
        'No fake messages — empty means no real indexed traffic yet.',
        'Outbound send requires draft → approve → execute.',
      ],
    };
  }

  /**
   * Business-channel search. Personal threads are structurally excluded.
   */
  async searchBusiness(
    actor: CommPlatformActor,
    query: string,
    limit = 50,
  ): Promise<CommPlatformSearchResult> {
    this.assertBusinessAccess(actor);
    const q = query.trim();
    if (!q) {
      return {
        items: [],
        total: 0,
        query: q,
        businessOnly: true,
        emptyReason: 'empty_query',
      };
    }

    const result = await this.listInbox(actor, {
      q,
      accountKind: 'business',
      includePersonal: false,
      limit,
    });

    // Hard guarantee: drop any personal items if somehow present
    const businessOnly = result.items.filter((i) => !i.isPersonal && i.isBusinessIndexed);

    return {
      items: businessOnly,
      total: businessOnly.length,
      query: q,
      businessOnly: true,
      emptyReason:
        businessOnly.length > 0
          ? 'none'
          : result.emptyReason === 'not_configured'
            ? 'not_configured'
            : 'no_matches',
    };
  }

  async getGmailMailbox(
    actor: CommPlatformActor,
    folder: CommPlatformGmailMailboxView['folder'] = 'inbox',
  ): Promise<CommPlatformGmailMailboxView> {
    this.assertBusinessAccess(actor);
    const settings = await this.getSettings(actor);
    const state = settings.businessGmail.status;
    const inbox = await this.listInbox(actor, {
      accountKind: 'business_gmail',
      folder: folder === 'all' ? undefined : folder,
      includePersonal: false,
      limit: 50,
    });

    let labels = ['INBOX', 'SENT', 'DRAFT', 'IMPORTANT'];
    if (state === 'connected' && this.gmailOAuthService?.isAppConfigured()) {
      try {
        const client = await this.gmailOAuthService.createClient(actor.companyId);
        const remote = await client.listLabels();
        if (remote.length > 0) {
          labels = remote.map((l) => l.name || l.id).filter(Boolean);
        }
      } catch {
        // Keep static fallback labels — do not invent mailbox rows.
      }
    }

    const oauthConfigured = settings.businessGmail.oauthConfigured === true;
    return {
      folder,
      capabilityState: !oauthConfigured ? 'not_configured' : state,
      items: inbox.items,
      labels,
      note: !oauthConfigured
        ? 'Business Gmail is not configured on this system yet.'
        : state === 'connected'
          ? 'Showing indexed Business Gmail items. Use Sync Now to pull mail from Google. Sends always require approval.'
          : 'Business Gmail is available but not connected. Use Connect under Business Channels.',
    };
  }

  /**
   * Starts Business Gmail sync and returns immediately with `syncStatus: 'syncing'`.
   * Import continues in-process (fire-and-forget); poll settings for completed/failed.
   */
  async syncGmailMailbox(
    actor: CommPlatformActor,
    options: { folder?: CommPlatformGmailMailboxView['folder']; maxMessages?: number } = {},
  ): Promise<CommPlatformGmailSyncResult> {
    this.assertBusinessAccess(actor);
    if (!canSyncBusinessGmail(actor) || isTechnicianRole(actor)) {
      throw new CommunicationsPlatformError(
        'FORBIDDEN',
        'You do not have permission to sync Business Gmail',
      );
    }
    if (!this.gmailOAuthService?.isAppConfigured()) {
      throw new CommunicationsPlatformError(
        'NOT_CONFIGURED',
        'Business Gmail is not configured — missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET',
      );
    }

    const folder = options.folder ?? 'inbox';
    const maxMessages = Math.min(Math.max(options.maxMessages ?? 40, 1), 100);

    const [account] = await this.db
      .select()
      .from(commPlatformAccounts)
      .where(
        and(
          eq(commPlatformAccounts.companyId, actor.companyId),
          eq(commPlatformAccounts.accountKind, 'business_gmail'),
        ),
      )
      .limit(1);

    if (!account?.credentialsEncrypted) {
      throw new CommunicationsPlatformError(
        'NOT_CONNECTED',
        'Connect Business Gmail before syncing',
      );
    }

    const meta = account.metadata ?? {};
    const priorLastSyncAt = typeof meta.lastSyncAt === 'string' ? meta.lastSyncAt : null;
    const alreadySyncing = meta.lastSyncStatus === 'syncing';
    const startedAtMs =
      typeof meta.lastSyncStartedAt === 'string'
        ? Date.parse(meta.lastSyncStartedAt)
        : Number.NaN;
    const syncIsFresh =
      alreadySyncing &&
      !Number.isNaN(startedAtMs) &&
      Date.now() - startedAtMs < GMAIL_SYNC_STALE_MS;

    if (syncIsFresh || activeGmailSyncCompanyIds.has(actor.companyId)) {
      return {
        synced: 0,
        skipped: 0,
        labels: [],
        capabilityState: 'connected',
        syncStatus: 'syncing',
        lastSyncAt: priorLastSyncAt,
        note: 'Gmail sync is already in progress. Messages will appear when import finishes.',
      };
    }

    const startedAt = new Date().toISOString();
    await this.persistGmailSyncMetadata(account, {
      lastSyncStatus: 'syncing',
      lastSyncStartedAt: startedAt,
      lastSyncFolder: folder,
      lastSyncError: null,
    });

    activeGmailSyncCompanyIds.add(actor.companyId);
    void this.runGmailSyncImport({
      companyId: actor.companyId,
      userId: actor.userId,
      accountId: account.id,
      folder,
      maxMessages,
    }).catch((error: unknown) => {
      console.error('[comm-platform] Background Gmail sync failed after accept', {
        companyId: actor.companyId,
        error: sanitizeGmailSyncErrorMessage(error),
      });
    });

    return {
      synced: 0,
      skipped: 0,
      labels: [],
      capabilityState: 'connected',
      syncStatus: 'syncing',
      lastSyncAt: priorLastSyncAt,
      note: 'Gmail sync started. Importing messages in the background.',
    };
  }

  /**
   * Background import body — never called from the HTTP response path after accept.
   * Token refresh still goes through GmailOAuthService.createClient (encrypted tenant tokens).
   */
  private async runGmailSyncImport(input: {
    companyId: string;
    userId: string;
    accountId: string;
    folder: CommPlatformGmailMailboxView['folder'];
    maxMessages: number;
  }): Promise<void> {
    const [account] = await this.db
      .select()
      .from(commPlatformAccounts)
      .where(
        and(
          eq(commPlatformAccounts.id, input.accountId),
          eq(commPlatformAccounts.companyId, input.companyId),
          eq(commPlatformAccounts.accountKind, 'business_gmail'),
        ),
      )
      .limit(1);

    if (!account || !this.gmailOAuthService) {
      activeGmailSyncCompanyIds.delete(input.companyId);
      return;
    }

    try {
      const client = await this.gmailOAuthService.createClient(input.companyId);
      const labels = await client.listLabels();
      const query = folderQuery(input.folder);
      const listed = await client.listMessages({
        ...query,
        maxResults: input.maxMessages,
      });

      const lookups = await this.buildEntityLinkLookups(input.companyId);
      const messageIds = listed.messages.map((item) => item.id);
      const existingIdSet = new Set<string>();
      if (messageIds.length > 0) {
        const existingRows = await this.db
          .select({ externalMessageId: commPlatformInboxIndex.externalMessageId })
          .from(commPlatformInboxIndex)
          .where(
            and(
              eq(commPlatformInboxIndex.companyId, input.companyId),
              inArray(commPlatformInboxIndex.externalMessageId, messageIds),
            ),
          );
        for (const row of existingRows) {
          if (row.externalMessageId) existingIdSet.add(row.externalMessageId);
        }
      }

      let synced = 0;
      let skipped = 0;

      for (const item of listed.messages) {
        if (existingIdSet.has(item.id)) {
          skipped += 1;
          continue;
        }

        const message = await client.getMessage(item.id, 'full');
        await this.indexGmailMessage(
          input.companyId,
          account.id,
          message,
          lookups,
          input.folder,
        );
        existingIdSet.add(item.id);
        synced += 1;
      }

      const labelNames = labels.map((l) => l.name || l.id).filter(Boolean);
      const lastSyncAt = new Date().toISOString();
      await this.persistGmailSyncMetadata(account, {
        lastSyncAt,
        lastSyncStatus: 'completed',
        lastSyncFolder: input.folder,
        lastSyncCounts: { synced, skipped },
        lastSyncError: null,
        lastSyncLabels: labelNames.slice(0, 50),
      });

      await this.recordAudit(
        { companyId: input.companyId, userId: input.userId },
        'comm_platform_gmail_sync',
        input.companyId,
        { folder: input.folder, synced, skipped, syncStatus: 'completed', autoSend: false },
      );
    } catch (error) {
      const message = sanitizeGmailSyncErrorMessage(error);
      await this.persistGmailSyncMetadata(account, {
        lastSyncStatus: 'failed',
        lastSyncFolder: input.folder,
        lastSyncError: message,
      });
      await this.recordAudit(
        { companyId: input.companyId, userId: input.userId },
        'comm_platform_gmail_sync',
        input.companyId,
        { folder: input.folder, syncStatus: 'failed', error: message, autoSend: false },
      );
    } finally {
      activeGmailSyncCompanyIds.delete(input.companyId);
    }
  }

  async getGmailAttachment(
    actor: CommPlatformActor,
    inboxItemId: string,
    attachmentId: string,
  ): Promise<{ meta: CommPlatformGmailAttachmentMeta; dataBase64: string }> {
    this.assertBusinessAccess(actor);
    if (!this.gmailOAuthService?.isAppConfigured()) {
      throw new CommunicationsPlatformError('NOT_CONFIGURED', 'Business Gmail is not configured');
    }

    const [row] = await this.db
      .select()
      .from(commPlatformInboxIndex)
      .where(
        and(
          eq(commPlatformInboxIndex.id, inboxItemId),
          eq(commPlatformInboxIndex.companyId, actor.companyId),
          eq(commPlatformInboxIndex.accountKind, 'business_gmail'),
        ),
      )
      .limit(1);

    if (!row?.externalMessageId) {
      throw new CommunicationsPlatformError('NOT_FOUND', 'Gmail message not found in index');
    }

    const attachments =
      (row.metadata?.attachments as CommPlatformGmailAttachmentMeta[] | undefined) ?? [];
    const meta = attachments.find((a) => a.attachmentId === attachmentId);
    if (!meta) {
      throw new CommunicationsPlatformError('NOT_FOUND', 'Attachment metadata not found');
    }

    const client = await this.gmailOAuthService.createClient(actor.companyId);
    const payload = await client.getAttachment(row.externalMessageId, attachmentId);
    return {
      meta: { ...meta, messageId: row.externalMessageId },
      dataBase64: payload.data,
    };
  }

  /**
   * AURA summarize / draft-reply assist. Never sends. Drafts still require approve → execute.
   */
  async auraAssistGmail(
    actor: CommPlatformActor,
    inboxItemId: string,
    mode: 'summarize' | 'draft_reply',
  ): Promise<CommPlatformAuraDraftAssistResult> {
    this.assertBusinessAccess(actor);
    if (isTechnicianRole(actor)) {
      throw new CommunicationsPlatformError('FORBIDDEN', 'Technicians cannot use AURA mail assist');
    }

    const [row] = await this.db
      .select()
      .from(commPlatformInboxIndex)
      .where(
        and(
          eq(commPlatformInboxIndex.id, inboxItemId),
          eq(commPlatformInboxIndex.companyId, actor.companyId),
          eq(commPlatformInboxIndex.accountKind, 'business_gmail'),
        ),
      )
      .limit(1);

    if (!row) {
      throw new CommunicationsPlatformError('NOT_FOUND', 'Inbox item not found');
    }

    const subject = row.subject ?? '(no subject)';
    const preview = row.preview ?? '';
    const summary = [
      `Subject: ${subject}`,
      row.participantLabel ? `From/participant: ${row.participantLabel}` : null,
      preview ? `Preview: ${preview}` : 'No preview indexed yet — sync Gmail for fuller context.',
      row.linkTargetType
        ? `Linked: ${row.linkTargetType} ${row.linkTargetId ?? ''}`.trim()
        : 'No confident CRM link yet.',
    ]
      .filter(Boolean)
      .join('\n');

    if (mode === 'summarize') {
      await this.recordAudit(
        { companyId: actor.companyId, userId: actor.userId },
        'comm_platform_gmail_aura_summarize',
        inboxItemId,
        { autoSend: false },
      );
      return {
        mode,
        status: 'ready',
        summary,
        note: 'Business-only summary from indexed Gmail. AURA did not send anything.',
        autoSend: false,
      };
    }

    const to = extractEmailsFromHeader(row.participantLabel);
    if (to.length === 0) {
      return {
        mode,
        status: 'not_configured',
        summary,
        note: 'Cannot draft reply — no confident participant email on the indexed message. Sync full headers or set To manually. Nothing was sent.',
        autoSend: false,
      };
    }

    const [company] = await this.db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, actor.companyId))
      .limit(1);
    const signOff = company?.name?.trim() ? `— ${company.name.trim()}` : '—';

    const replyBody = [
      'Hi,',
      '',
      'Thanks for your email — we have received it and will follow up shortly.',
      '',
      `Re: ${subject}`,
      '',
      signOff,
      '',
      '[AURA draft — review before approve → execute. Never auto-sent.]',
    ].join('\n');

    const draft = await this.createGmailDraft(actor, {
      to,
      subject: subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`,
      bodyText: replyBody,
      replyToMessageId: row.externalMessageId ?? undefined,
    });

    await this.recordAudit(
      { companyId: actor.companyId, userId: actor.userId },
      'comm_platform_gmail_aura_draft',
      draft.id,
      { autoSend: false, replyTo: row.externalMessageId },
    );

    return {
      mode,
      status: 'ready',
      summary,
      draft,
      note: 'Reply draft created. Send still requires Owner/staff approve → execute. AURA never auto-sends.',
      autoSend: false,
    };
  }

  async createGmailDraft(
    actor: CommPlatformActor,
    input: CommPlatformGmailDraftRequest,
  ): Promise<CommPlatformGmailDraftSummary> {
    this.assertBusinessAccess(actor);
    if (isTechnicianRole(actor)) {
      throw new CommunicationsPlatformError(
        'FORBIDDEN',
        'Technicians cannot create Gmail drafts from the hub',
      );
    }

    const [account] = await this.db
      .select()
      .from(commPlatformAccounts)
      .where(
        and(
          eq(commPlatformAccounts.companyId, actor.companyId),
          eq(commPlatformAccounts.accountKind, 'business_gmail'),
        ),
      )
      .limit(1);

    const [draft] = await this.db
      .insert(commPlatformGmailDrafts)
      .values({
        companyId: actor.companyId,
        accountId: account?.id ?? null,
        createdByUserId: actor.userId,
        status: 'draft',
        toAddresses: input.to,
        ccAddresses: input.cc ?? [],
        bccAddresses: input.bcc ?? [],
        subject: input.subject,
        bodyText: input.bodyText,
        replyToMessageId: input.replyToMessageId ?? null,
        forwardOfMessageId: input.forwardOfMessageId ?? null,
        labelIds: input.labelIds ?? [],
      })
      .returning();

    await this.recordAudit(
      { companyId: actor.companyId, userId: actor.userId },
      'comm_platform_gmail_draft_created',
      draft!.id,
      { subject: input.subject, toCount: input.to.length, autoSend: false },
    );

    return {
      id: draft!.id,
      status: 'draft',
      subject: draft!.subject,
      to: draft!.toAddresses,
      createdAt: draft!.createdAt.toISOString(),
      requiresApproval: true,
      note: 'Draft saved. Send is blocked until Owner/staff approval (draft → approve → execute).',
    };
  }

  async approveGmailDraft(
    actor: CommPlatformActor,
    draftId: string,
  ): Promise<CommPlatformGmailDraftSummary> {
    this.assertBusinessAccess(actor);
    if (isTechnicianRole(actor)) {
      throw new CommunicationsPlatformError('FORBIDDEN', 'Technicians cannot approve sends');
    }

    const [existing] = await this.db
      .select()
      .from(commPlatformGmailDrafts)
      .where(
        and(
          eq(commPlatformGmailDrafts.id, draftId),
          eq(commPlatformGmailDrafts.companyId, actor.companyId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new CommunicationsPlatformError('NOT_FOUND', 'Draft not found');
    }
    if (existing.status === 'executed') {
      throw new CommunicationsPlatformError('VALIDATION_ERROR', 'Draft already executed');
    }

    const [updated] = await this.db
      .update(commPlatformGmailDrafts)
      .set({
        status: 'approved',
        approvedByUserId: actor.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(commPlatformGmailDrafts.id, draftId))
      .returning();

    await this.recordAudit(
      { companyId: actor.companyId, userId: actor.userId },
      'comm_platform_gmail_draft_approved',
      draftId,
      { autoSend: false },
    );

    return {
      id: updated!.id,
      status: 'approved',
      subject: updated!.subject,
      to: updated!.toAddresses,
      createdAt: updated!.createdAt.toISOString(),
      requiresApproval: true,
      note: 'Approved. Execute is a separate step — nothing is auto-sent.',
    };
  }

  /**
   * Execute an approved draft via Gmail API. Never auto-sends — requires prior approve step.
   * Owner/staff must explicitly call execute. AURA has no path here.
   */
  async executeGmailDraft(
    actor: CommPlatformActor,
    draftId: string,
  ): Promise<CommPlatformGmailDraftSummary> {
    this.assertBusinessAccess(actor);
    if (isTechnicianRole(actor)) {
      throw new CommunicationsPlatformError('FORBIDDEN', 'Technicians cannot execute sends');
    }

    const [existing] = await this.db
      .select()
      .from(commPlatformGmailDrafts)
      .where(
        and(
          eq(commPlatformGmailDrafts.id, draftId),
          eq(commPlatformGmailDrafts.companyId, actor.companyId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new CommunicationsPlatformError('NOT_FOUND', 'Draft not found');
    }
    if (existing.status !== 'approved') {
      throw new CommunicationsPlatformError(
        'VALIDATION_ERROR',
        'Draft must be approved before execute — no auto-send path',
      );
    }

    const settings = await this.getSettings(actor);
    if (!settings.businessGmail.oauthConfigured) {
      throw new CommunicationsPlatformError(
        'NOT_CONFIGURED',
        'Business Gmail OAuth is not configured — cannot execute send',
      );
    }
    if (!settings.businessGmail.connected || !this.gmailOAuthService) {
      throw new CommunicationsPlatformError(
        'NOT_CONFIGURED',
        'Business Gmail is not connected — cannot execute send',
      );
    }

    const raw = encodeRawMime({
      to: existing.toAddresses,
      cc: existing.ccAddresses,
      bcc: existing.bccAddresses,
      subject: existing.subject,
      bodyText: existing.bodyText,
      inReplyTo: existing.replyToMessageId ?? undefined,
      references: existing.replyToMessageId ?? undefined,
    });

    const client = await this.gmailOAuthService.createClient(actor.companyId);
    const sent = await client.sendRaw(raw);

    const [updated] = await this.db
      .update(commPlatformGmailDrafts)
      .set({
        status: 'executed',
        executedAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          ...(existing.metadata ?? {}),
          providerSend: 'gmail_api',
          gmailMessageId: sent.id,
          gmailThreadId: sent.threadId ?? null,
          note: 'Sent via Gmail API after explicit Owner/staff approve → execute. Not auto-sent.',
        },
      })
      .where(eq(commPlatformGmailDrafts.id, draftId))
      .returning();

    await this.recordAudit(
      { companyId: actor.companyId, userId: actor.userId },
      'comm_platform_gmail_draft_executed',
      draftId,
      { autoSend: false, providerSend: 'gmail_api', gmailMessageId: sent.id },
    );

    return {
      id: updated!.id,
      status: 'executed',
      subject: updated!.subject,
      to: updated!.toAddresses,
      createdAt: updated!.createdAt.toISOString(),
      requiresApproval: true,
      note: 'Sent via Gmail after explicit approval. AURA never auto-sends.',
    };
  }

  async listBusinessWhatsappChats(
    actor: CommPlatformActor,
  ): Promise<CommPlatformWhatsappChatSummary[]> {
    this.assertBusinessAccess(actor);

    const indexed = await this.db
      .select()
      .from(commPlatformInboxIndex)
      .where(
        and(
          eq(commPlatformInboxIndex.companyId, actor.companyId),
          eq(commPlatformInboxIndex.accountKind, 'business_whatsapp'),
        ),
      )
      .orderBy(desc(commPlatformInboxIndex.occurredAt))
      .limit(100);

    if (indexed.length > 0) {
      return indexed.map((row) => ({
        id: row.id,
        accountKind: 'business_whatsapp' as const,
        contactPhone: null,
        contactName: row.participantLabel,
        lastMessagePreview: row.preview,
        lastMessageAt: row.occurredAt.toISOString(),
        unread: row.unread,
        attachmentCount: row.attachmentCount,
        linkTargetType: row.linkTargetType,
        linkTargetId: row.linkTargetId,
        isPersonal: false,
      }));
    }

    // Honest empty fallback from existing whatsapp_messages (business connection) — no fakes
    const messages = await this.db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.companyId, actor.companyId))
      .orderBy(desc(whatsappMessages.createdAt))
      .limit(50);

    return messages.map((m) => ({
      id: m.id,
      accountKind: 'business_whatsapp' as const,
      contactPhone: null,
      contactName: null,
      lastMessagePreview: m.messageContent?.slice(0, 200) ?? null,
      lastMessageAt: m.createdAt.toISOString(),
      unread: false,
      attachmentCount: 0,
      linkTargetType: m.customerId ? ('customer' as const) : null,
      linkTargetId: m.customerId,
      isPersonal: false,
    }));
  }

  async linkInboxItem(
    actor: CommPlatformActor,
    itemId: string,
    link: CommPlatformLinkRequest,
  ): Promise<CommPlatformInboxItemSummary> {
    this.assertBusinessAccess(actor);
    const [existing] = await this.db
      .select()
      .from(commPlatformInboxIndex)
      .where(
        and(
          eq(commPlatformInboxIndex.id, itemId),
          eq(commPlatformInboxIndex.companyId, actor.companyId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new CommunicationsPlatformError('NOT_FOUND', 'Inbox item not found');
    }
    if (existing.accountKind === 'personal_whatsapp') {
      throw new CommunicationsPlatformError(
        'FORBIDDEN',
        'Personal items cannot be linked via business inbox',
      );
    }

    const [updated] = await this.db
      .update(commPlatformInboxIndex)
      .set({
        linkTargetType: link.linkTargetType,
        linkTargetId: link.linkTargetId,
        assignedJobId: link.linkTargetType === 'job' ? link.linkTargetId : existing.assignedJobId,
      })
      .where(eq(commPlatformInboxIndex.id, itemId))
      .returning();

    await this.recordAudit(
      { companyId: actor.companyId, userId: actor.userId },
      'comm_platform_inbox_linked',
      itemId,
      { ...link },
    );

    return this.toInboxItem(updated!);
  }

  async listPersonalChats(actor: CommPlatformActor): Promise<CommPlatformWhatsappChatSummary[]> {
    this.assertPersonalAccess(actor);

    const rows = await this.db
      .select()
      .from(commPlatformPersonalThreads)
      .where(
        and(
          eq(commPlatformPersonalThreads.companyId, actor.companyId),
          eq(commPlatformPersonalThreads.ownerUserId, actor.userId),
        ),
      )
      .orderBy(desc(commPlatformPersonalThreads.lastMessageAt))
      .limit(100);

    return rows.map((row) => ({
      id: row.id,
      accountKind: 'personal_whatsapp' as const,
      contactPhone: row.contactPhone,
      contactName: row.contactName,
      lastMessagePreview: row.lastMessagePreview,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      unread: row.unread,
      attachmentCount: row.attachmentCount,
      linkTargetType: null,
      linkTargetId: null,
      isPersonal: true,
    }));
  }

  async listSmartDetectionPrompts(
    actor: CommPlatformActor,
  ): Promise<CommPlatformSmartDetectionPrompt[]> {
    this.assertPersonalAccess(actor);

    // Owner-only prompts — nothing auto-imports. V1 returns empty or pending thread prompts.
    const threads = await this.db
      .select()
      .from(commPlatformPersonalThreads)
      .where(
        and(
          eq(commPlatformPersonalThreads.companyId, actor.companyId),
          eq(commPlatformPersonalThreads.ownerUserId, actor.userId),
          eq(commPlatformPersonalThreads.importConsentGranted, false),
        ),
      )
      .orderBy(desc(commPlatformPersonalThreads.createdAt))
      .limit(20);

    return threads.map((t) => ({
      id: t.id,
      contactPhone: t.contactPhone,
      contactName: t.contactName,
      suggestedClassification: 'unknown',
      confidence: 0,
      options: ['import', 'import_from', 'create_customer', 'link', 'keep_private'],
      defaultAction: 'keep_private',
      autoImport: false,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  async recordImportDecision(
    actor: CommPlatformActor,
    input: CommPlatformImportDecisionRequest,
  ): Promise<CommPlatformImportDecisionSummary> {
    this.assertPersonalAccess(actor);

    const [decision] = await this.db
      .insert(commPlatformImportDecisions)
      .values({
        companyId: actor.companyId,
        decidedByUserId: actor.userId,
        personalThreadId: input.promptId ?? null,
        contactPhone: input.contactPhone ?? null,
        contactName: input.contactName ?? null,
        action: input.action,
        linkTargetType: input.linkTargetType ?? null,
        linkTargetId: input.linkTargetId ?? null,
        importFromAt: input.importFromAt ? new Date(input.importFromAt) : null,
        notes: input.notes ?? null,
        autoImported: false,
        executedImport: false,
      })
      .returning();

    if (input.promptId && input.action === 'keep_private') {
      await this.db
        .update(commPlatformPersonalThreads)
        .set({
          importConsentGranted: false,
          privateByDefault: true,
          excludedFromBusinessSearch: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(commPlatformPersonalThreads.id, input.promptId),
            eq(commPlatformPersonalThreads.companyId, actor.companyId),
            eq(commPlatformPersonalThreads.ownerUserId, actor.userId),
          ),
        );
    }

    await this.recordAudit(
      { companyId: actor.companyId, userId: actor.userId },
      'comm_platform_import_decision',
      decision!.id,
      {
        action: input.action,
        autoImported: false,
        executedImport: false,
      },
    );

    return {
      id: decision!.id,
      action: decision!.action,
      contactPhone: decision!.contactPhone,
      contactName: decision!.contactName,
      decidedAt: decision!.createdAt.toISOString(),
      decidedByUserId: decision!.decidedByUserId,
      imported: false,
      note: 'Decision recorded. Nothing was auto-imported into business indexes.',
    };
  }

  async saveGmailConnection(
    actor: CommPlatformActor,
    input: SaveCommPlatformGmailConnectionRequest,
  ): Promise<CommPlatformConnectionHealth> {
    this.assertBusinessAccess(actor);
    if (isTechnicianRole(actor)) {
      throw new CommunicationsPlatformError('FORBIDDEN', 'Technicians cannot manage Gmail');
    }
    if (!this.encryptionKey) {
      throw new CommunicationsPlatformError(
        'NOT_CONFIGURED',
        'INTEGRATIONS_ENCRYPTION_KEY must be configured before storing Gmail credentials',
      );
    }

    const [existing] = await this.db
      .select()
      .from(commPlatformAccounts)
      .where(
        and(
          eq(commPlatformAccounts.companyId, actor.companyId),
          eq(commPlatformAccounts.accountKind, 'business_gmail'),
        ),
      )
      .limit(1);

    let credentialsEncrypted = existing?.credentialsEncrypted ?? null;
    if (input.accessToken || input.refreshToken) {
      let prior: GmailOAuthStoredCredentials | null = null;
      if (existing?.credentialsEncrypted) {
        try {
          prior = decryptGmailCredentials(existing.credentialsEncrypted, this.encryptionKey);
        } catch {
          prior = null;
        }
      }
      credentialsEncrypted = encryptGmailCredentials(
        {
          version: 1,
          accessToken: input.accessToken?.trim() || prior?.accessToken || '',
          refreshToken: input.refreshToken?.trim() || prior?.refreshToken,
          expiresAt: input.expiresAt ?? prior?.expiresAt,
          emailAddress: input.emailAddress?.trim() || prior?.emailAddress,
        },
        this.encryptionKey,
      );
    }

    const hasCreds = Boolean(credentialsEncrypted);
    const status: CommPlatformCapabilityState = hasCreds ? 'pending' : 'not_configured';
    const values = {
      companyId: actor.companyId,
      accountKind: 'business_gmail' as const,
      label: 'Business Gmail',
      externalAddress: input.emailAddress?.trim() || existing?.externalAddress || null,
      credentialsEncrypted,
      status,
      privateByDefault: false,
      syncEnabled: input.syncEnabled ?? existing?.syncEnabled ?? false,
      retentionDays: input.retentionDays ?? existing?.retentionDays ?? null,
      updatedAt: new Date(),
    };

    if (existing) {
      await this.db
        .update(commPlatformAccounts)
        .set(values)
        .where(eq(commPlatformAccounts.id, existing.id));
    } else {
      await this.db.insert(commPlatformAccounts).values(values);
    }

    await this.recordAudit(
      { companyId: actor.companyId, userId: actor.userId },
      'comm_platform_gmail_connect',
      actor.companyId,
      { hasCredentials: hasCreds },
    );

    return (await this.getSettings(actor)).businessGmail;
  }

  async disconnectGmail(actor: CommPlatformActor): Promise<CommPlatformConnectionHealth> {
    this.assertBusinessAccess(actor);
    if (isTechnicianRole(actor)) {
      throw new CommunicationsPlatformError('FORBIDDEN', 'Technicians cannot disconnect Gmail');
    }

    if (this.gmailOAuthService) {
      await this.gmailOAuthService.revokeAndDisconnect(actor.companyId, actor.userId);
    } else {
      await this.db
        .update(commPlatformAccounts)
        .set({
          credentialsEncrypted: null,
          status: 'disconnected',
          syncEnabled: false,
          connectedAt: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(commPlatformAccounts.companyId, actor.companyId),
            eq(commPlatformAccounts.accountKind, 'business_gmail'),
          ),
        );
      await this.recordAudit(
        { companyId: actor.companyId, userId: actor.userId },
        'comm_platform_gmail_disconnect',
        actor.companyId,
        {},
      );
    }

    return (await this.getSettings(actor)).businessGmail;
  }

  async savePersonalWhatsapp(
    actor: CommPlatformActor,
    input: SaveCommPlatformPersonalWhatsappRequest,
  ): Promise<CommPlatformConnectionHealth> {
    this.assertPersonalAccess(actor);
    if (!this.encryptionKey && (input.accessToken || input.phoneNumberId)) {
      throw new CommunicationsPlatformError(
        'NOT_CONFIGURED',
        'INTEGRATIONS_ENCRYPTION_KEY must be configured before storing Personal WhatsApp credentials',
      );
    }

    const [existing] = await this.db
      .select()
      .from(commPlatformAccounts)
      .where(
        and(
          eq(commPlatformAccounts.companyId, actor.companyId),
          eq(commPlatformAccounts.accountKind, 'personal_whatsapp'),
          eq(commPlatformAccounts.ownerUserId, actor.userId),
        ),
      )
      .limit(1);

    let credentialsEncrypted = existing?.credentialsEncrypted ?? null;
    if (input.accessToken && this.encryptionKey) {
      credentialsEncrypted = encryptWhatsappCredentials(
        { accessToken: input.accessToken.trim() },
        this.encryptionKey,
      );
    }

    const hasCreds = Boolean(credentialsEncrypted);
    const metadata = {
      ...(existing?.metadata ?? {}),
      phoneNumberId: input.phoneNumberId?.trim() || undefined,
      businessAccountId: input.businessAccountId?.trim() || undefined,
    };
    const base = {
      companyId: actor.companyId,
      accountKind: 'personal_whatsapp' as const,
      label: input.label?.trim() || 'Personal WhatsApp Assistant',
      externalAddress: input.phoneNumber?.trim() || existing?.externalAddress || null,
      ownerUserId: actor.userId,
      credentialsEncrypted,
      status: (hasCreds ? 'pending' : 'not_configured') as CommPlatformCapabilityState,
      privateByDefault: true,
      syncEnabled: input.syncEnabled ?? false,
      metadata,
      updatedAt: new Date(),
    };

    if (existing) {
      await this.db
        .update(commPlatformAccounts)
        .set(base)
        .where(eq(commPlatformAccounts.id, existing.id));
    } else {
      await this.db.insert(commPlatformAccounts).values(base);
    }

    await this.recordAudit(
      { companyId: actor.companyId, userId: actor.userId },
      'comm_platform_personal_wa_connect',
      actor.userId,
      { privateByDefault: true, autoImport: false },
    );

    return (await this.getSettings(actor)).personalWhatsapp!;
  }

  async disconnectPersonalWhatsapp(actor: CommPlatformActor): Promise<CommPlatformConnectionHealth> {
    this.assertPersonalAccess(actor);
    await this.db
      .update(commPlatformAccounts)
      .set({
        credentialsEncrypted: null,
        status: 'disconnected',
        syncEnabled: false,
        connectedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(commPlatformAccounts.companyId, actor.companyId),
          eq(commPlatformAccounts.accountKind, 'personal_whatsapp'),
          eq(commPlatformAccounts.ownerUserId, actor.userId),
        ),
      );

    await this.recordAudit(
      { companyId: actor.companyId, userId: actor.userId },
      'comm_platform_personal_wa_disconnect',
      actor.userId,
      {},
    );

    return (await this.getSettings(actor)).personalWhatsapp ?? EMPTY_PERSONAL_WA;
  }

  async testConnection(
    actor: CommPlatformActor,
    accountKind: CommPlatformAccountKind,
  ): Promise<CommPlatformTestConnectionResult> {
    if (accountKind === 'personal_whatsapp') {
      this.assertPersonalAccess(actor);
    } else {
      this.assertBusinessAccess(actor);
    }

    const settings = await this.getSettings(actor);
    const health =
      accountKind === 'business_gmail'
        ? settings.businessGmail
        : accountKind === 'business_whatsapp'
          ? settings.businessWhatsapp
          : settings.personalWhatsapp ?? EMPTY_PERSONAL_WA;

    if (accountKind === 'business_gmail' && this.gmailOAuthService) {
      const live = await this.gmailOAuthService.testConnection(actor.companyId);
      return {
        ok: live.ok,
        accountKind,
        status: live.status,
        message: live.message,
        testedAt: live.testedAt,
      };
    }

    const testedAt = new Date().toISOString();
    let ok = false;
    let message: string;
    let status = health.status;

    if (accountKind === 'business_gmail' && health.oauthConfigured === false) {
      message =
        'Business Gmail is not_configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before testing.';
      status = 'not_configured';
    } else if (!health.hasCredentials && !health.connected) {
      message = `${health.label} is not_configured — connect credentials before testing.`;
      status = 'not_configured';
    } else if (!this.encryptionKey && accountKind === 'business_gmail') {
      message = 'INTEGRATIONS_ENCRYPTION_KEY missing — cannot validate encrypted credentials.';
      status = 'error';
    } else if (health.connected || health.hasCredentials) {
      ok = health.connected;
      message = health.connected
        ? `${health.label} credentials present — live provider probe remains additive when API clients are configured.`
        : `${health.label} credentials stored (pending) — run provider OAuth/webhook setup to reach connected.`;
      status = health.connected ? 'connected' : 'pending';
    } else {
      message = `${health.label} disconnected.`;
      status = 'disconnected';
    }

    await this.db
      .update(commPlatformAccounts)
      .set({
        lastTestAt: new Date(),
        lastTestStatus: ok ? 'ok' : 'failed',
        lastTestMessage: message,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(commPlatformAccounts.companyId, actor.companyId),
          eq(commPlatformAccounts.accountKind, accountKind),
          accountKind === 'personal_whatsapp'
            ? eq(commPlatformAccounts.ownerUserId, actor.userId)
            : sql`true`,
        ),
      );

    return { ok, accountKind, status, message, testedAt };
  }

  // --- internals ---

  private async persistGmailSyncMetadata(
    account: typeof commPlatformAccounts.$inferSelect,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const [fresh] = await this.db
      .select({ metadata: commPlatformAccounts.metadata })
      .from(commPlatformAccounts)
      .where(eq(commPlatformAccounts.id, account.id))
      .limit(1);
    const now = new Date();
    await this.db
      .update(commPlatformAccounts)
      .set({
        metadata: {
          ...(fresh?.metadata ?? account.metadata ?? {}),
          ...patch,
        },
        updatedAt: now,
      })
      .where(eq(commPlatformAccounts.id, account.id));
  }

  private toHealth(
    row: typeof commPlatformAccounts.$inferSelect | null,
    empty: CommPlatformConnectionHealth,
    options?: {
      oauthConfigured?: boolean;
      preferNotConfiguredWhenOAuthMissing?: boolean;
    },
  ): CommPlatformConnectionHealth {
    const oauthConfigured = options?.oauthConfigured;
    const oauthAppMissing =
      options?.preferNotConfiguredWhenOAuthMissing && oauthConfigured === false;
    const oauthAppReady = oauthConfigured === true;

    if (!row) {
      return {
        ...empty,
        oauthConfigured: oauthConfigured ?? empty.oauthConfigured,
        // Platform OAuth app ready → tenant is disconnected (not "not_configured").
        status: oauthAppReady ? 'disconnected' : empty.status,
        emptyStateMessage: oauthAppMissing
          ? 'Not configured — Google OAuth client credentials are missing on the API host.'
          : oauthAppReady
            ? 'Google OAuth is configured on the API. Connect Business Gmail to store encrypted tenant tokens — no messages are invented.'
            : empty.emptyStateMessage,
      };
    }

    let status = row.status;
    if (oauthAppMissing && !row.credentialsEncrypted) {
      status = 'not_configured';
    } else if (
      oauthAppReady &&
      !row.credentialsEncrypted &&
      (status === 'not_configured' || status === 'disconnected')
    ) {
      status = 'disconnected';
    }

    const connected = status === 'connected';
    const meta = row.metadata ?? {};
    return {
      accountKind: row.accountKind,
      label: row.label,
      status,
      connected,
      hasCredentials: Boolean(row.credentialsEncrypted),
      lastTestAt: row.lastTestAt?.toISOString() ?? null,
      lastTestStatus: row.lastTestStatus,
      lastTestMessage: row.lastTestMessage,
      lastError: row.lastError,
      privacyDefault: row.privateByDefault ? 'private' : 'business',
      syncEnabled: row.syncEnabled,
      retentionDays: row.retentionDays,
      oauthConfigured,
      emailAddress: row.externalAddress,
      lastSyncAt: typeof meta.lastSyncAt === 'string' ? meta.lastSyncAt : null,
      lastSyncStatus: typeof meta.lastSyncStatus === 'string' ? meta.lastSyncStatus : null,
      lastSyncError:
        typeof meta.lastSyncError === 'string' && meta.lastSyncError.trim()
          ? meta.lastSyncError.slice(0, 500)
          : null,
      emptyStateMessage: connected
        ? `${row.label} connected${row.externalAddress ? ` (${row.externalAddress})` : ''} — showing real indexed traffic only.`
        : oauthAppMissing
          ? 'Not configured — set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, then connect via Google OAuth.'
          : oauthAppReady
            ? 'Google OAuth is configured on the API. Connect Business Gmail to store encrypted tenant tokens — no messages are invented.'
            : empty.emptyStateMessage,
    };
  }

  private async buildEntityLinkLookups(companyId: string): Promise<GmailEntityLinkLookups> {
    const [customerRows, leadRows, jobRows, quoteRows, invoiceRows] = await Promise.all([
      this.db
        .select({ id: customers.id, email: customers.email })
        .from(customers)
        .where(eq(customers.companyId, companyId)),
      this.db
        .select({ id: leads.id, email: leads.contactEmail })
        .from(leads)
        .where(eq(leads.companyId, companyId)),
      this.db
        .select({ id: jobs.id, customerId: jobs.customerId })
        .from(jobs)
        .where(eq(jobs.companyId, companyId)),
      this.db
        .select({ id: quotes.id, customerId: quotes.customerId })
        .from(quotes)
        .where(eq(quotes.companyId, companyId)),
      this.db
        .select({
          id: invoices.id,
          customerId: invoices.customerId,
          billingEmail: invoices.billingEmail,
        })
        .from(invoices)
        .where(eq(invoices.companyId, companyId)),
    ]);

    const customersByEmail = new Map<string, string[]>();
    for (const row of customerRows) {
      const email = normalizeEmail(row.email);
      if (!email) continue;
      const list = customersByEmail.get(email) ?? [];
      list.push(row.id);
      customersByEmail.set(email, list);
    }

    const leadsByEmail = new Map<string, string[]>();
    for (const row of leadRows) {
      const email = normalizeEmail(row.email);
      if (!email) continue;
      const list = leadsByEmail.get(email) ?? [];
      list.push(row.id);
      leadsByEmail.set(email, list);
    }

    const jobsByCustomerId = new Map<string, string[]>();
    for (const row of jobRows) {
      if (!row.customerId) continue;
      const list = jobsByCustomerId.get(row.customerId) ?? [];
      list.push(row.id);
      jobsByCustomerId.set(row.customerId, list);
    }

    const quotesByCustomerId = new Map<string, string[]>();
    for (const row of quoteRows) {
      if (!row.customerId) continue;
      const list = quotesByCustomerId.get(row.customerId) ?? [];
      list.push(row.id);
      quotesByCustomerId.set(row.customerId, list);
    }

    const invoicesByEmail = new Map<string, string[]>();
    const invoicesByCustomerId = new Map<string, string[]>();
    for (const row of invoiceRows) {
      if (row.customerId) {
        const list = invoicesByCustomerId.get(row.customerId) ?? [];
        list.push(row.id);
        invoicesByCustomerId.set(row.customerId, list);
      }
      const email = normalizeEmail(row.billingEmail);
      if (email) {
        const list = invoicesByEmail.get(email) ?? [];
        list.push(row.id);
        invoicesByEmail.set(email, list);
      }
    }

    return {
      customersByEmail,
      leadsByEmail,
      jobsByCustomerId,
      quotesByCustomerId,
      invoicesByEmail,
      invoicesByCustomerId,
    };
  }

  private async indexGmailMessage(
    companyId: string,
    accountId: string | null,
    message: GmailMessage,
    lookups: GmailEntityLinkLookups,
    folderHint: string,
  ): Promise<void> {
    const from = getHeader(message, 'From');
    const to = getHeader(message, 'To');
    const subject = getHeader(message, 'Subject');
    const labelIds = message.labelIds ?? [];
    const folder = labelIds.includes('DRAFT')
      ? 'drafts'
      : labelIds.includes('SENT')
        ? 'sent'
        : labelIds.includes('INBOX')
          ? 'inbox'
          : folderHint === 'labels' || folderHint === 'all'
            ? 'inbox'
            : folderHint;

    const participantEmails = [
      ...extractEmailsFromHeader(from),
      ...extractEmailsFromHeader(to),
    ];
    const link = resolveConfidentGmailEntityLink(participantEmails, lookups);
    const attachments = collectAttachments(message.payload).map((a) => ({
      ...a,
      messageId: message.id,
    }));
    const bodyPreview = extractTextBody(message.payload).slice(0, 400) || message.snippet || null;
    const occurredAt = message.internalDate
      ? new Date(Number(message.internalDate))
      : new Date();

    await this.db.insert(commPlatformInboxIndex).values({
      companyId,
      accountId,
      accountKind: 'business_gmail',
      channel: 'email',
      externalThreadId: message.threadId,
      externalMessageId: message.id,
      subject,
      preview: bodyPreview,
      participantLabel: from ?? to,
      participantKind: link?.participantKind ?? 'unknown',
      folder,
      unread: labelIds.includes('UNREAD'),
      urgent: labelIds.includes('IMPORTANT'),
      direction: labelIds.includes('SENT') ? 'outbound' : 'inbound',
      linkTargetType: link?.linkTargetType ?? null,
      linkTargetId: link?.linkTargetId ?? null,
      assignedJobId: link?.linkTargetType === 'job' ? link.linkTargetId : null,
      attachmentCount: attachments.length,
      labels: labelIds,
      occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
      metadata: {
        attachments,
        linkConfidence: link?.confidence ?? null,
        gmailThreadId: message.threadId,
      },
    });
  }

  private healthSummaryLine(
    gmail: CommPlatformConnectionHealth,
    wa: CommPlatformConnectionHealth,
    personal: CommPlatformConnectionHealth | null,
  ): string {
    const parts = [
      `Gmail: ${gmail.status}`,
      `Business WA: ${wa.status}`,
    ];
    if (personal) parts.push(`Personal WA: ${personal.status}`);
    return parts.join(' · ');
  }

  private toInboxItem(
    row: typeof commPlatformInboxIndex.$inferSelect,
  ): CommPlatformInboxItemSummary {
    const isPersonal = row.accountKind === 'personal_whatsapp';
    return {
      id: row.id,
      accountKind: row.accountKind,
      channel: row.channel,
      isPersonal,
      isBusinessIndexed: !isPersonal,
      subject: row.subject,
      preview: row.preview,
      participantLabel: row.participantLabel,
      participantKind: row.participantKind,
      folder: (row.folder as CommPlatformInboxItemSummary['folder']) || 'inbox',
      unread: row.unread,
      urgent: row.urgent,
      direction: (row.direction as CommPlatformInboxItemSummary['direction']) || 'inbound',
      linkTargetType: row.linkTargetType,
      linkTargetId: row.linkTargetId,
      occurredAt: row.occurredAt.toISOString(),
      attachmentCount: row.attachmentCount,
      labels: row.labels ?? [],
      capabilityState: 'connected',
    };
  }

  private async listPersonalChatsAsInboxItems(
    actor: CommPlatformActor,
    limit: number,
  ): Promise<CommPlatformInboxItemSummary[]> {
    const chats = await this.listPersonalChats(actor);
    return chats.slice(0, limit).map((c) => ({
      id: c.id,
      accountKind: 'personal_whatsapp' as const,
      channel: 'whatsapp' as const,
      isPersonal: true,
      isBusinessIndexed: false,
      subject: c.contactName ?? c.contactPhone,
      preview: c.lastMessagePreview,
      participantLabel: c.contactName ?? c.contactPhone,
      participantKind: 'unknown' as const,
      folder: 'chats' as const,
      unread: c.unread,
      urgent: false,
      direction: 'inbound' as const,
      linkTargetType: null,
      linkTargetId: null,
      occurredAt: c.lastMessageAt ?? new Date(0).toISOString(),
      attachmentCount: c.attachmentCount,
      labels: ['personal', 'private'],
      capabilityState: 'connected' as const,
    }));
  }

  private async recordAudit(
    scope: TenantScope,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: scope.companyId,
      category: 'communications',
      action,
      entityType: 'communications_platform',
      entityId,
      userId: scope.userId,
      metadata: { ...metadata, autoSend: false },
    });
  }
}

/** Strip tokens / credential-looking strings from sync errors shown to users and stored in metadata. */
export function sanitizeGmailSyncErrorMessage(error: unknown): string {
  const raw =
    error instanceof CommunicationsPlatformError ||
    error instanceof GmailOAuthError ||
    error instanceof GmailClientError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Business Gmail sync failed';
  const cleaned = raw
    .replace(/Bearer\s+[A-Za-z0-9._\-/=+]+/gi, 'Bearer [redacted]')
    .replace(/ya29\.[A-Za-z0-9._\-]+/g, '[redacted]')
    .replace(/1\/\/[A-Za-z0-9_\-]+/g, '[redacted]')
    .replace(/refresh[_-]?token["']?\s*[:=]\s*["']?[^"',\s]+/gi, 'refresh_token=[redacted]')
    .replace(/access[_-]?token["']?\s*[:=]\s*["']?[^"',\s]+/gi, 'access_token=[redacted]')
    .slice(0, 500)
    .trim();
  return cleaned || 'Business Gmail sync failed';
}

export function mapCommunicationsPlatformError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof CommunicationsPlatformError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'NOT_CONFIGURED'
            ? 503
            : error.code === 'NOT_CONNECTED'
              ? 409
              : error.code === 'VALIDATION_ERROR'
                ? 400
                : 500;
    return { status, code: error.code, message: sanitizeGmailSyncErrorMessage(error) };
  }
  if (error instanceof GmailOAuthError) {
    const status =
      error.code === 'NOT_CONFIGURED'
        ? 503
        : error.code === 'NOT_CONNECTED' || error.code === 'RECONNECT_REQUIRED'
          ? 409
          : 400;
    return { status, code: error.code, message: sanitizeGmailSyncErrorMessage(error) };
  }
  if (error instanceof GmailClientError) {
    return {
      status: error.status === 401 || error.status === 403 ? 401 : 502,
      code: error.code,
      message: sanitizeGmailSyncErrorMessage(error),
    };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Communications platform error' };
}
