import { and, desc, eq } from 'drizzle-orm';
import type {
  GmailAuthRequest,
  GmailConnectionSummary,
  GmailLabelSummary,
  GmailMessageDetail,
  GmailMessageSummary,
  GmailStats,
  GmailSyncResult,
  SendGmailRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { gmailConnections, gmailLabels, gmailMessages } from '@titan/db';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { exchangeCodeForTokens, GmailClient } from '../lib/gmail.client.js';
import type { IntegrationHubService } from './integration-hub.service.js';

export class GmailServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GmailServiceError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
};

type GmailServiceDeps = {
  db: DatabaseClient;
  encryptionKey?: string;
  clientId?: string;
  clientSecret?: string;
  hubService?: IntegrationHubService;
};

export class GmailService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly encryptionKey?: string,
    private readonly clientId?: string,
    private readonly clientSecret?: string,
    private readonly hubService?: IntegrationHubService,
  ) {}

  static create(deps: GmailServiceDeps): GmailService {
    return new GmailService(deps.db, deps.encryptionKey, deps.clientId, deps.clientSecret, deps.hubService);
  }

  async getConnection(companyId: string): Promise<GmailConnectionSummary> {
    const connection = await this.getOrCreateConnection(companyId);
    return this.toConnectionSummary(connection);
  }

  async connectWithOAuth(companyId: string, input: GmailAuthRequest): Promise<GmailConnectionSummary> {
    this.ensureCredentials();

    try {
      const tokens = await exchangeCodeForTokens({
        code: input.code,
        clientId: this.clientId!,
        clientSecret: this.clientSecret!,
        redirectUri: input.redirectUri,
      });

      const client = new GmailClient({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        expiryDate: tokens.expiryDate,
      });

      const profile = await client.getProfile();

      const tokensEncrypted = encryptSecret(
        JSON.stringify({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiryDate: tokens.expiryDate,
          scope: tokens.scope,
        }),
        this.encryptionKey!,
      );

      const connection = await this.getOrCreateConnection(companyId);

      const [updated] = await this.db
        .update(gmailConnections)
        .set({
          email: profile.emailAddress,
          tokensEncrypted,
          status: 'connected',
          connectedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(gmailConnections.id, connection.id))
        .returning();

      if (this.hubService) {
        await this.hubService.recordSync(companyId, 'gmail', 'oauth_connection', {
          status: 'completed',
          resultSummary: { email: profile.emailAddress },
        });
      }

      return this.toConnectionSummary(updated!);
    } catch (error) {
      const connection = await this.getOrCreateConnection(companyId);
      const errorMessage = error instanceof Error ? error.message : 'Gmail connection failed';

      await this.db
        .update(gmailConnections)
        .set({ status: 'error', lastError: errorMessage, updatedAt: new Date() })
        .where(eq(gmailConnections.id, connection.id));

      if (this.hubService) {
        await this.hubService.recordSync(companyId, 'gmail', 'oauth_connection', {
          status: 'failed',
          errorMessage,
        });
      }

      throw new GmailServiceError(
        'CONNECTION_FAILED',
        `Failed to connect Gmail: ${errorMessage}`,
      );
    }
  }

  async disconnect(companyId: string): Promise<void> {
    const connection = await this.getOrCreateConnection(companyId);

    await this.db
      .update(gmailConnections)
      .set({
        status: 'disconnected',
        tokensEncrypted: null,
        email: null,
        connectedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(gmailConnections.id, connection.id));
  }

  async syncMessages(companyId: string): Promise<GmailSyncResult> {
    const connection = await this.getOrCreateConnection(companyId);

    if (connection.status !== 'connected' || !connection.tokensEncrypted) {
      throw new GmailServiceError('NOT_CONNECTED', 'Gmail is not connected');
    }

    this.ensureCredentials();

    try {
      const tokens = JSON.parse(decryptSecret(connection.tokensEncrypted, this.encryptionKey!)) as {
        accessToken: string;
        refreshToken?: string;
        expiryDate?: number;
        scope?: string;
      };

      const client = new GmailClient({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        expiryDate: tokens.expiryDate,
      });

      let messagesImported = 0;
      const labelIds = ['INBOX', 'SENT', 'DRAFT'];

      for (const labelId of labelIds) {
        let pageToken: string | undefined;

        do {
          const { messages, nextPageToken } = await client.listMessages({
            labelIds: [labelId],
            maxResults: 50,
            pageToken,
          });

          for (const msgRef of messages) {
            const existing = await this.db.query.gmailMessages.findFirst({
              where: and(
                eq(gmailMessages.companyId, companyId),
                eq(gmailMessages.externalMessageId, msgRef.id),
              ),
            });

            if (!existing) {
              const fullMessage = await client.getMessage(msgRef.id);
              await this.storeMessage(companyId, fullMessage);
              messagesImported++;
            }
          }

          pageToken = nextPageToken;
        } while (pageToken);
      }

      const labels = await client.listLabels();
      const labelsSynced = await this.syncLabels(companyId, labels);

      const updatedTokens = encryptSecret(
        JSON.stringify({
          accessToken: client.getAccessToken(),
          refreshToken: tokens.refreshToken,
          expiryDate: client.getExpiryDate(),
        }),
        this.encryptionKey!,
      );

      await this.db
        .update(gmailConnections)
        .set({ tokensEncrypted: updatedTokens, lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(gmailConnections.id, connection.id));

      if (this.hubService) {
        await this.hubService.recordSync(companyId, 'gmail', 'messages_and_labels', {
          status: 'completed',
          resultSummary: { messagesImported, labelsSynced },
        });
      }

      return {
        email: connection.email ?? '',
        messagesImported,
        labelsSynced,
        syncedAt: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';

      await this.db
        .update(gmailConnections)
        .set({ lastError: errorMessage, updatedAt: new Date() })
        .where(eq(gmailConnections.id, connection.id));

      if (this.hubService) {
        await this.hubService.recordSync(companyId, 'gmail', 'messages_and_labels', {
          status: 'failed',
          errorMessage,
        });
      }

      throw new GmailServiceError('SYNC_FAILED', `Gmail sync failed: ${errorMessage}`);
    }
  }

  async listMessages(companyId: string, _filters?: { labelId?: string }): Promise<GmailMessageSummary[]> {
    const conditions = [eq(gmailMessages.companyId, companyId)];

    const rows = await this.db.query.gmailMessages.findMany({
      where: and(...conditions),
      orderBy: [desc(gmailMessages.receivedAt), desc(gmailMessages.createdAt)],
      limit: 100,
    });

    return rows.map((row) => ({
      id: row.id,
      externalMessageId: row.externalMessageId,
      direction: row.direction,
      status: row.status,
      isDraft: row.isDraft,
      subject: row.subject,
      snippet: row.snippet,
      fromEmail: row.fromEmail,
      toEmail: row.toEmail,
      internalDate: row.internalDate?.toISOString() ?? null,
      labelIds: (row.labelIds ?? []) as string[],
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getMessage(companyId: string, messageId: string): Promise<GmailMessageDetail | null> {
    const row = await this.db.query.gmailMessages.findFirst({
      where: and(eq(gmailMessages.id, messageId), eq(gmailMessages.companyId, companyId)),
    });

    if (!row) return null;

    return {
      id: row.id,
      externalMessageId: row.externalMessageId,
      direction: row.direction,
      status: row.status,
      isDraft: row.isDraft,
      subject: row.subject,
      snippet: row.snippet,
      fromEmail: row.fromEmail,
      toEmail: row.toEmail,
      ccEmail: row.ccEmail,
      bccEmail: row.bccEmail,
      bodyHtml: row.bodyHtml,
      bodyText: row.bodyText,
      internalDate: row.internalDate?.toISOString() ?? null,
      labelIds: (row.labelIds ?? []) as string[],
      customerId: row.customerId,
      approvedByUserId: row.approvedByUserId,
      sentAt: row.sentAt?.toISOString() ?? null,
      receivedAt: row.receivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async sendMessage(scope: TenantScope, input: SendGmailRequest): Promise<GmailMessageDetail> {
    const connection = await this.getOrCreateConnection(scope.companyId);

    if (connection.status !== 'connected' || !connection.tokensEncrypted) {
      throw new GmailServiceError('NOT_CONNECTED', 'Gmail is not connected');
    }

    this.ensureCredentials();

    const tokens = JSON.parse(decryptSecret(connection.tokensEncrypted, this.encryptionKey!)) as {
      accessToken: string;
      refreshToken?: string;
      expiryDate?: number;
      scope?: string;
    };

    const client = new GmailClient({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      expiryDate: tokens.expiryDate,
    });

    if (input.isDraft) {
      const draft = await client.createDraft({
        to: input.to,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        bodyText: input.bodyText,
        cc: input.cc,
        bcc: input.bcc,
      });

      const [row] = await this.db
        .insert(gmailMessages)
        .values({
          companyId: scope.companyId,
          customerId: input.customerId ?? null,
          externalMessageId: draft.message.id,
          externalThreadId: draft.message.threadId,
          direction: 'outgoing',
          status: 'draft',
          isDraft: true,
          subject: input.subject,
          toEmail: input.to,
          ccEmail: input.cc ?? null,
          bccEmail: input.bcc ?? null,
          bodyHtml: input.bodyHtml ?? null,
          bodyText: input.bodyText ?? null,
          approvedByUserId: scope.userId,
          createdAt: new Date(),
        })
        .returning();

      return this.toMessageDetail(row!);
    }

    const sent = await client.sendMessage({
      to: input.to,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText,
      cc: input.cc,
      bcc: input.bcc,
    });

    const [row] = await this.db
      .insert(gmailMessages)
      .values({
        companyId: scope.companyId,
        customerId: input.customerId ?? null,
        externalMessageId: sent.id,
        externalThreadId: sent.threadId,
        direction: 'outgoing',
        status: 'sent',
        isDraft: false,
        subject: input.subject,
        toEmail: input.to,
        ccEmail: input.cc ?? null,
        bccEmail: input.bcc ?? null,
        bodyHtml: input.bodyHtml ?? null,
        bodyText: input.bodyText ?? null,
        labelIds: sent.labelIds,
        approvedByUserId: scope.userId,
        sentAt: new Date(),
        createdAt: new Date(),
      })
      .returning();

    return this.toMessageDetail(row!);
  }

  async listLabels(companyId: string): Promise<GmailLabelSummary[]> {
    const rows = await this.db.query.gmailLabels.findMany({
      where: eq(gmailLabels.companyId, companyId),
      orderBy: [desc(gmailLabels.messagesTotal)],
    });

    return rows.map((row) => ({
      id: row.id,
      externalLabelId: row.externalLabelId,
      name: row.name,
      type: row.type,
      messagesTotal: row.messagesTotal,
      messagesUnread: row.messagesUnread,
      threadsTotal: row.threadsTotal,
      threadsUnread: row.threadsUnread,
    }));
  }

  async getStats(companyId: string): Promise<GmailStats> {
    const allMessages = await this.db.query.gmailMessages.findMany({
      where: eq(gmailMessages.companyId, companyId),
    });

    const inboxLabel = await this.db.query.gmailLabels.findFirst({
      where: and(eq(gmailLabels.companyId, companyId), eq(gmailLabels.externalLabelId, 'INBOX')),
    });

    const sentLabel = await this.db.query.gmailLabels.findFirst({
      where: and(eq(gmailLabels.companyId, companyId), eq(gmailLabels.externalLabelId, 'SENT')),
    });

    const draftMessages = allMessages.filter((m) => m.isDraft);

    const totalLabels = await this.db.query.gmailLabels.findMany({
      where: eq(gmailLabels.companyId, companyId),
    });

    return {
      totalMessages: allMessages.length,
      inboxMessages: inboxLabel?.messagesTotal ?? 0,
      sentMessages: sentLabel?.messagesTotal ?? 0,
      draftMessages: draftMessages.length,
      totalLabels: totalLabels.length,
    };
  }

  private async getOrCreateConnection(companyId: string) {
    const existing = await this.db.query.gmailConnections.findFirst({
      where: eq(gmailConnections.companyId, companyId),
    });

    if (existing) return existing;

    const [created] = await this.db
      .insert(gmailConnections)
      .values({ companyId, status: 'disconnected' })
      .returning();

    return created!;
  }

  private toConnectionSummary(connection: typeof gmailConnections.$inferSelect): GmailConnectionSummary {
    return {
      provider: 'gmail',
      status: connection.status,
      email: connection.email,
      hasCredentials: Boolean(connection.tokensEncrypted),
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      lastError: connection.lastError,
      connectedAt: connection.connectedAt?.toISOString() ?? null,
      inboxCount: 0,
      draftCount: 0,
      sentCount: 0,
      labelCount: 0,
    };
  }

  private toMessageDetail(row: typeof gmailMessages.$inferSelect): GmailMessageDetail {
    return {
      id: row.id,
      externalMessageId: row.externalMessageId,
      direction: row.direction,
      status: row.status,
      isDraft: row.isDraft,
      subject: row.subject,
      snippet: row.snippet,
      fromEmail: row.fromEmail,
      toEmail: row.toEmail,
      ccEmail: row.ccEmail,
      bccEmail: row.bccEmail,
      bodyHtml: row.bodyHtml,
      bodyText: row.bodyText,
      internalDate: row.internalDate?.toISOString() ?? null,
      labelIds: (row.labelIds ?? []) as string[],
      customerId: row.customerId,
      approvedByUserId: row.approvedByUserId,
      sentAt: row.sentAt?.toISOString() ?? null,
      receivedAt: row.receivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async storeMessage(companyId: string, message: { id: string; threadId: string; snippet?: string; labelIds?: string[]; historyId?: string; internalDate?: string; sizeEstimate?: number; payload?: { headers?: Array<{ name: string; value: string }> } }): Promise<void> {
    const headers = message.payload?.headers ?? [];
    const getHeader = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

    const subject = getHeader('Subject');
    const from = getHeader('From');
    const to = getHeader('To');
    const cc = getHeader('Cc');
    const bcc = getHeader('Bcc');

    const direction = message.labelIds?.includes('SENT') ? 'outgoing' : 'incoming';
    const isDraft = message.labelIds?.includes('DRAFT');
    const status = isDraft ? 'draft' : direction === 'outgoing' ? 'sent' : 'received';

    await this.db.insert(gmailMessages).values({
      companyId,
      externalMessageId: message.id,
      externalThreadId: message.threadId,
      direction,
      status,
      isDraft,
      subject,
      snippet: message.snippet,
      fromEmail: from,
      toEmail: to,
      ccEmail: cc,
      bccEmail: bcc,
      labelIds: message.labelIds ?? [],
      historyId: message.historyId,
      internalDate: message.internalDate ? new Date(parseInt(message.internalDate, 10)) : null,
      sizeEstimate: message.sizeEstimate?.toString(),
      receivedAt: direction === 'incoming' ? new Date() : null,
      sentAt: direction === 'outgoing' ? new Date() : null,
    });
  }

  private async syncLabels(companyId: string, labels: Array<{ id: string; name: string; type: string; messageListVisibility?: string; labelListVisibility?: string; messagesTotal?: number; messagesUnread?: number; threadsTotal?: number; threadsUnread?: number }>): Promise<number> {
    let synced = 0;

    for (const label of labels) {
      const existing = await this.db.query.gmailLabels.findFirst({
        where: and(eq(gmailLabels.companyId, companyId), eq(gmailLabels.externalLabelId, label.id)),
      });

      if (existing) {
        await this.db
          .update(gmailLabels)
          .set({
            name: label.name,
            type: label.type,
            messageListVisibility: label.messageListVisibility,
            labelListVisibility: label.labelListVisibility,
            messagesTotal: label.messagesTotal,
            messagesUnread: label.messagesUnread,
            threadsTotal: label.threadsTotal,
            threadsUnread: label.threadsUnread,
            updatedAt: new Date(),
          })
          .where(eq(gmailLabels.id, existing.id));
      } else {
        await this.db.insert(gmailLabels).values({
          companyId,
          externalLabelId: label.id,
          name: label.name,
          type: label.type,
          messageListVisibility: label.messageListVisibility,
          labelListVisibility: label.labelListVisibility,
          messagesTotal: label.messagesTotal,
          messagesUnread: label.messagesUnread,
          threadsTotal: label.threadsTotal,
          threadsUnread: label.threadsUnread,
        });
      }

      synced++;
    }

    return synced;
  }

  private ensureCredentials(): void {
    if (!this.encryptionKey) {
      throw new GmailServiceError('ENCRYPTION_KEY_MISSING', 'Encryption key not configured');
    }

    if (!this.clientId || !this.clientSecret) {
      throw new GmailServiceError(
        'OAUTH_NOT_CONFIGURED',
        'Gmail OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
      );
    }
  }
}
