import { and, desc, eq } from 'drizzle-orm';
import {
  buildPersonalWaTestingSupport,
  canAccessPersonalWhatsappConnection,
  emptyPersonalWaConnectionSummary,
  emptyPersonalWaPrivacy,
  normalizePersonalWaPhoneInput,
  PERSONAL_WA_CONNECTION_PRODUCT_COPY,
  type ConnectPersonalWaRequest,
  type LinkPersonalWaNumberRequest,
  type PersonalWaConnectionDashboard,
  type PersonalWaConnectionPrivacy,
  type PersonalWaConnectionStatus,
  type PersonalWaConnectionSummary,
  type PersonalWaHealthCheckResult,
  type PersonalWaSessionHealth,
  type UpdatePersonalWaConnectionPrivacyRequest,
  type UpdatePersonalWaConnectionSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  commPlatformAccounts,
  personalWaConnectionEvents,
  personalWaConnections,
  securityAuditLogs,
} from '@titan/db';
import { encryptWhatsappCredentials } from '../lib/crypto.js';

export class PersonalWhatsappConnectionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PersonalWhatsappConnectionError';
  }
}

export type PersonalWaConnectionActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

type ConnectionRow = typeof personalWaConnections.$inferSelect;

export class PersonalWhatsappConnectionService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly encryptionKey?: string,
  ) {}

  private assertOwnerAccess(actor: PersonalWaConnectionActor): void {
    if (
      !canAccessPersonalWhatsappConnection({
        roleName: actor.roleName,
        permissions: actor.permissions,
      })
    ) {
      throw new PersonalWhatsappConnectionError(
        'FORBIDDEN',
        'Personal WhatsApp Connection Layer is Platform Owner only (same gate as Personal WhatsApp Assistant).',
      );
    }
  }

  private async recordAudit(
    actor: PersonalWaConnectionActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'communications',
      action,
      entityType: 'personal_whatsapp_connection',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoSend: false,
        autoImport: false,
        privateByDefault: true,
      },
    });
  }

  private async recordEvent(
    actor: PersonalWaConnectionActor,
    connectionId: string | null,
    eventType: string,
    statusBefore: string | null,
    statusAfter: string | null,
    message: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.db.insert(personalWaConnectionEvents).values({
      companyId: actor.companyId,
      ownerUserId: actor.userId,
      connectionId,
      eventType,
      statusBefore,
      statusAfter,
      message,
      metadata: { ...metadata, autoSend: false },
    });
  }

  private toPrivacy(row: ConnectionRow | null): PersonalWaConnectionPrivacy {
    return emptyPersonalWaPrivacy({
      syncEnabled: row?.syncEnabled ?? false,
      retentionDays: row?.retentionDays ?? null,
    });
  }

  private toSessionHealth(
    row: ConnectionRow | null,
    hasCredentials: boolean,
  ): PersonalWaSessionHealth {
    const status = (row?.status ?? 'not_configured') as PersonalWaConnectionStatus;
    const healthy =
      status === 'connected' && hasCredentials && !row?.lastError && Boolean(row?.linkedPhoneE164);
    return {
      status,
      healthy,
      hasCredentials,
      lastHeartbeatAt: row?.lastHeartbeatAt?.toISOString() ?? null,
      lastHealthCheckAt: row?.lastHealthCheckAt?.toISOString() ?? null,
      lastHealthStatus: row?.lastHealthStatus ?? null,
      lastHealthMessage: row?.lastHealthMessage ?? null,
      lastError: row?.lastError ?? null,
      reconnectAttempts: row?.reconnectAttempts ?? 0,
      reconnectRequestedAt: row?.reconnectRequestedAt?.toISOString() ?? null,
      liveProviderVerified: false,
    };
  }

  private toSummary(
    row: ConnectionRow | null,
    account: typeof commPlatformAccounts.$inferSelect | null,
  ): PersonalWaConnectionSummary {
    if (!row && !account) {
      return emptyPersonalWaConnectionSummary();
    }
    const hasCredentials = Boolean(account?.credentialsEncrypted);
    const status = (row?.status ??
      (hasCredentials ? 'awaiting_credentials' : 'not_configured')) as PersonalWaConnectionStatus;
    const privacy = this.toPrivacy(row);
    return {
      id: row?.id ?? null,
      accountId: row?.accountId ?? account?.id ?? null,
      linkedPhoneE164: row?.linkedPhoneE164 ?? account?.externalAddress ?? null,
      displayLabel: row?.displayLabel ?? account?.label ?? 'Personal WhatsApp',
      status,
      pairingMode: row?.pairingMode ?? 'credential',
      pairingStartedAt: row?.pairingStartedAt?.toISOString() ?? null,
      pairingExpiresAt: row?.pairingExpiresAt?.toISOString() ?? null,
      pairedAt: row?.pairedAt?.toISOString() ?? null,
      lastConnectedAt: row?.lastConnectedAt?.toISOString() ?? null,
      lastDisconnectedAt: row?.lastDisconnectedAt?.toISOString() ?? null,
      privacy,
      sessionHealth: this.toSessionHealth(row, hasCredentials),
      commPlatformStatus: account?.status ?? null,
    };
  }

  private async loadAccount(actor: PersonalWaConnectionActor) {
    const [account] = await this.db
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
    return account ?? null;
  }

  private async loadConnection(actor: PersonalWaConnectionActor) {
    const [row] = await this.db
      .select()
      .from(personalWaConnections)
      .where(
        and(
          eq(personalWaConnections.companyId, actor.companyId),
          eq(personalWaConnections.ownerUserId, actor.userId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  private async upsertAccount(
    actor: PersonalWaConnectionActor,
    input: {
      label?: string;
      phoneNumber?: string | null;
      accessToken?: string;
      phoneNumberId?: string;
      businessAccountId?: string;
      syncEnabled?: boolean;
      status: 'not_configured' | 'pending' | 'connected' | 'disconnected' | 'error' | 'degraded';
    },
  ) {
    const existing = await this.loadAccount(actor);
    let credentialsEncrypted = existing?.credentialsEncrypted ?? null;
    if (input.accessToken) {
      if (!this.encryptionKey) {
        throw new PersonalWhatsappConnectionError(
          'NOT_CONFIGURED',
          'INTEGRATIONS_ENCRYPTION_KEY must be configured before storing Personal WhatsApp credentials',
        );
      }
      credentialsEncrypted = encryptWhatsappCredentials(
        { accessToken: input.accessToken.trim() },
        this.encryptionKey,
      );
    }

    const metadata = {
      ...(existing?.metadata ?? {}),
      ...(input.phoneNumberId?.trim()
        ? { phoneNumberId: input.phoneNumberId.trim() }
        : {}),
      ...(input.businessAccountId?.trim()
        ? { businessAccountId: input.businessAccountId.trim() }
        : {}),
      connectionLayer: true,
    };

    const base = {
      companyId: actor.companyId,
      accountKind: 'personal_whatsapp' as const,
      label: input.label?.trim() || existing?.label || 'Personal WhatsApp Assistant',
      externalAddress:
        input.phoneNumber !== undefined
          ? input.phoneNumber
          : existing?.externalAddress ?? null,
      ownerUserId: actor.userId,
      credentialsEncrypted,
      status: input.status,
      privateByDefault: true,
      syncEnabled: input.syncEnabled ?? existing?.syncEnabled ?? false,
      metadata,
      connectedAt: input.status === 'connected' ? new Date() : existing?.connectedAt ?? null,
      updatedAt: new Date(),
    };

    if (existing) {
      await this.db
        .update(commPlatformAccounts)
        .set(base)
        .where(eq(commPlatformAccounts.id, existing.id));
      return { ...existing, ...base, id: existing.id };
    }

    const [inserted] = await this.db.insert(commPlatformAccounts).values(base).returning();
    return inserted;
  }

  async getDashboard(actor: PersonalWaConnectionActor): Promise<PersonalWaConnectionDashboard> {
    this.assertOwnerAccess(actor);
    const connection = await this.getStatus(actor);
    const encryptionKeyConfigured = Boolean(this.encryptionKey);
    const hasCredentials = connection.sessionHealth.hasCredentials;
    const testingSupport = buildPersonalWaTestingSupport({
      encryptionKeyConfigured,
      hasCredentials,
      hasLinkedPhone: Boolean(connection.linkedPhoneE164),
    });

    const summary =
      connection.status === 'not_configured'
        ? 'Personal WhatsApp Connection Layer is not configured. Link your owner number and store encrypted credentials when ready. Live device pairing and Meta Graph probes are not available yet — no demo sessions.'
        : connection.status === 'connected'
          ? `Owner Personal WhatsApp linked (${connection.linkedPhoneE164 ?? 'no phone'}). Credentials ${hasCredentials ? 'stored encrypted' : 'missing'}. Live provider verification is not available in this layer — outbound still requires Owner approval and never auto-sends.`
          : `Connection status: ${connection.status}. Private by default; never auto-imported; reconnect and health checks update local session state only until a live runtime is added.`;

    return {
      summary,
      productClarification: { ...PERSONAL_WA_CONNECTION_PRODUCT_COPY },
      connection,
      privacy: connection.privacy,
      sessionHealth: connection.sessionHealth,
      testingSupport,
      sendPolicy: {
        autoSendEnabled: false,
        requiresOwnerApproval: true,
        outboundBlockedUntilApproval: true,
      },
      runtimeHonesty: {
        encryptionKeyConfigured,
        liveDeviceLinkAvailable: false,
        metaGraphProbeAvailable: false,
        note: encryptionKeyConfigured
          ? 'Encryption key present. Credential pairing and local session health work. Live Meta Graph / multi-device link is not wired in this milestone — do not treat Connected as a verified live WhatsApp session without a provider probe.'
          : 'INTEGRATIONS_ENCRYPTION_KEY is not configured — number linking and privacy settings work, but credentials cannot be stored.',
      },
    };
  }

  async getStatus(actor: PersonalWaConnectionActor): Promise<PersonalWaConnectionSummary> {
    this.assertOwnerAccess(actor);
    const [row, account] = await Promise.all([
      this.loadConnection(actor),
      this.loadAccount(actor),
    ]);
    return this.toSummary(row, account);
  }

  async linkNumber(
    actor: PersonalWaConnectionActor,
    input: LinkPersonalWaNumberRequest,
  ): Promise<PersonalWaConnectionSummary> {
    this.assertOwnerAccess(actor);
    const phone = normalizePersonalWaPhoneInput(input.phoneNumber);
    if (!phone) {
      throw new PersonalWhatsappConnectionError(
        'VALIDATION',
        'A valid owner WhatsApp phone number is required (E.164, e.g. +27821234567).',
      );
    }

    const existing = await this.loadConnection(actor);
    const statusBefore = existing?.status ?? 'not_configured';
    const hasToken = Boolean(input.accessToken?.trim());
    const nextStatus: PersonalWaConnectionStatus = hasToken
      ? 'pairing'
      : 'awaiting_credentials';

    const account = await this.upsertAccount(actor, {
      label: input.label,
      phoneNumber: phone,
      accessToken: input.accessToken,
      phoneNumberId: input.phoneNumberId,
      businessAccountId: input.businessAccountId,
      syncEnabled: input.syncEnabled,
      status: hasToken ? 'pending' : 'not_configured',
    });

    const now = new Date();
    const pairingExpiresAt = hasToken ? new Date(now.getTime() + 15 * 60 * 1000) : null;
    const values = {
      companyId: actor.companyId,
      ownerUserId: actor.userId,
      accountId: account.id,
      linkedPhoneE164: phone,
      displayLabel: input.label?.trim() || existing?.displayLabel || 'Personal WhatsApp',
      status: nextStatus,
      pairingMode: 'credential' as const,
      pairingStartedAt: hasToken ? now : existing?.pairingStartedAt ?? null,
      pairingExpiresAt,
      privateByDefault: true,
      excludeFromBusinessSearch: true,
      neverAutoImport: true,
      requireApprovalToSend: true,
      syncEnabled: input.syncEnabled ?? existing?.syncEnabled ?? false,
      updatedAt: now,
    };

    let connectionId: string;
    if (existing) {
      await this.db
        .update(personalWaConnections)
        .set(values)
        .where(eq(personalWaConnections.id, existing.id));
      connectionId = existing.id;
    } else {
      const [inserted] = await this.db.insert(personalWaConnections).values(values).returning();
      connectionId = inserted.id;
    }

    await this.recordEvent(
      actor,
      connectionId,
      'number_linked',
      statusBefore,
      nextStatus,
      hasToken
        ? 'Owner WhatsApp number linked; credential pairing started.'
        : 'Owner WhatsApp number linked; awaiting credentials.',
      { phone, hasCredentials: hasToken },
    );
    await this.recordAudit(actor, 'personal_wa_number_linked', connectionId, {
      phone,
      hasCredentials: hasToken,
      status: nextStatus,
    });

    return this.getStatus(actor);
  }

  async connect(
    actor: PersonalWaConnectionActor,
    input: ConnectPersonalWaRequest = {},
  ): Promise<PersonalWaConnectionSummary> {
    this.assertOwnerAccess(actor);
    const existing = await this.loadConnection(actor);
    const account = await this.loadAccount(actor);
    const phoneRaw = input.phoneNumber ?? existing?.linkedPhoneE164 ?? account?.externalAddress;
    const phone = phoneRaw ? normalizePersonalWaPhoneInput(phoneRaw) : null;
    if (!phone) {
      throw new PersonalWhatsappConnectionError(
        'VALIDATION',
        'Link an owner WhatsApp number before connecting.',
      );
    }

    const token = input.accessToken?.trim();
    const hasExistingCreds = Boolean(account?.credentialsEncrypted);
    if (!token && !hasExistingCreds) {
      throw new PersonalWhatsappConnectionError(
        'VALIDATION',
        'Provide an access token to complete secure pairing, or link credentials first.',
      );
    }
    if (token && !this.encryptionKey) {
      throw new PersonalWhatsappConnectionError(
        'NOT_CONFIGURED',
        'INTEGRATIONS_ENCRYPTION_KEY must be configured before storing Personal WhatsApp credentials',
      );
    }

    const statusBefore = existing?.status ?? 'not_configured';
    const now = new Date();

    const upserted = await this.upsertAccount(actor, {
      label: input.label,
      phoneNumber: phone,
      accessToken: token,
      phoneNumberId: input.phoneNumberId,
      businessAccountId: input.businessAccountId,
      syncEnabled: input.syncEnabled,
      status: 'connected',
    });

    const values = {
      companyId: actor.companyId,
      ownerUserId: actor.userId,
      accountId: upserted.id,
      linkedPhoneE164: phone,
      displayLabel: input.label?.trim() || existing?.displayLabel || 'Personal WhatsApp',
      status: 'connected' as const,
      pairingMode: 'credential' as const,
      pairingStartedAt: existing?.pairingStartedAt ?? now,
      pairingExpiresAt: null,
      pairedAt: now,
      lastConnectedAt: now,
      lastHeartbeatAt: now,
      lastHealthCheckAt: now,
      lastHealthStatus: 'ok',
      lastHealthMessage:
        'Credentials stored and owner link recorded. Live Meta/device verification is not available in this layer — treat as locally paired, not provider-verified.',
      lastError: null,
      reconnectAttempts: 0,
      reconnectRequestedAt: null,
      privateByDefault: true,
      excludeFromBusinessSearch: true,
      neverAutoImport: true,
      requireApprovalToSend: true,
      syncEnabled: input.syncEnabled ?? existing?.syncEnabled ?? false,
      updatedAt: now,
    };

    let connectionId: string;
    if (existing) {
      await this.db
        .update(personalWaConnections)
        .set(values)
        .where(eq(personalWaConnections.id, existing.id));
      connectionId = existing.id;
    } else {
      const [inserted] = await this.db.insert(personalWaConnections).values(values).returning();
      connectionId = inserted.id;
    }

    await this.recordEvent(
      actor,
      connectionId,
      'session_connected',
      statusBefore,
      'connected',
      'Owner Personal WhatsApp connection recorded (credential pairing). No automatic send.',
      { liveProviderVerified: false },
    );
    await this.recordAudit(actor, 'personal_wa_session_connected', connectionId, {
      phone,
      liveProviderVerified: false,
      autoSend: false,
    });

    return this.getStatus(actor);
  }

  async disconnect(actor: PersonalWaConnectionActor): Promise<PersonalWaConnectionSummary> {
    this.assertOwnerAccess(actor);
    const existing = await this.loadConnection(actor);
    const statusBefore = existing?.status ?? 'not_configured';
    const now = new Date();

    await this.db
      .update(commPlatformAccounts)
      .set({
        credentialsEncrypted: null,
        status: 'disconnected',
        syncEnabled: false,
        connectedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(commPlatformAccounts.companyId, actor.companyId),
          eq(commPlatformAccounts.accountKind, 'personal_whatsapp'),
          eq(commPlatformAccounts.ownerUserId, actor.userId),
        ),
      );

    if (existing) {
      await this.db
        .update(personalWaConnections)
        .set({
          status: 'disconnected',
          syncEnabled: false,
          lastDisconnectedAt: now,
          pairingExpiresAt: null,
          lastError: null,
          lastHealthStatus: 'disconnected',
          lastHealthMessage: 'Disconnected by Owner. Encrypted credentials cleared.',
          lastHealthCheckAt: now,
          sessionMetadata: {},
          updatedAt: now,
        })
        .where(eq(personalWaConnections.id, existing.id));

      await this.recordEvent(
        actor,
        existing.id,
        'session_disconnected',
        statusBefore,
        'disconnected',
        'Owner disconnected Personal WhatsApp. Credentials cleared. No outbound send occurred.',
      );
      await this.recordAudit(actor, 'personal_wa_session_disconnected', existing.id, {});
    } else {
      await this.recordAudit(actor, 'personal_wa_session_disconnected', actor.userId, {
        note: 'No connection row; credentials cleared if present.',
      });
    }

    return this.getStatus(actor);
  }

  async reconnect(actor: PersonalWaConnectionActor): Promise<PersonalWaConnectionSummary> {
    this.assertOwnerAccess(actor);
    const existing = await this.loadConnection(actor);
    if (!existing?.linkedPhoneE164) {
      throw new PersonalWhatsappConnectionError(
        'VALIDATION',
        'Link an owner WhatsApp number before requesting reconnect.',
      );
    }

    const account = await this.loadAccount(actor);
    const statusBefore = existing.status;
    const now = new Date();
    const hasCredentials = Boolean(account?.credentialsEncrypted);
    const nextStatus: PersonalWaConnectionStatus = hasCredentials
      ? 'pairing'
      : 'reconnect_required';

    await this.db
      .update(personalWaConnections)
      .set({
        status: nextStatus,
        reconnectAttempts: (existing.reconnectAttempts ?? 0) + 1,
        reconnectRequestedAt: now,
        pairingStartedAt: now,
        pairingExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        lastHealthStatus: 'reconnect_requested',
        lastHealthMessage: hasCredentials
          ? 'Reconnect requested — complete connect with a fresh token if the previous session expired. Live provider probe not available yet.'
          : 'Reconnect required — provide credentials via Connect. Live device-link pairing is not available in this layer.',
        lastHealthCheckAt: now,
        updatedAt: now,
      })
      .where(eq(personalWaConnections.id, existing.id));

    if (account) {
      await this.db
        .update(commPlatformAccounts)
        .set({
          status: hasCredentials ? 'pending' : 'disconnected',
          updatedAt: now,
        })
        .where(eq(commPlatformAccounts.id, account.id));
    }

    await this.recordEvent(
      actor,
      existing.id,
      'reconnect_requested',
      statusBefore,
      nextStatus,
      'Owner requested Personal WhatsApp reconnect.',
      { hasCredentials },
    );
    await this.recordAudit(actor, 'personal_wa_reconnect_requested', existing.id, {
      hasCredentials,
      status: nextStatus,
    });

    return this.getStatus(actor);
  }

  async checkHealth(actor: PersonalWaConnectionActor): Promise<PersonalWaHealthCheckResult> {
    this.assertOwnerAccess(actor);
    const existing = await this.loadConnection(actor);
    const account = await this.loadAccount(actor);
    const testedAt = new Date().toISOString();
    const hasCredentials = Boolean(account?.credentialsEncrypted);
    const hasPhone = Boolean(existing?.linkedPhoneE164 ?? account?.externalAddress);

    let ok = false;
    let status: PersonalWaConnectionStatus = existing?.status ?? 'not_configured';
    let message: string;

    if (!hasPhone) {
      status = 'not_configured';
      message =
        'No owner WhatsApp number linked. Link a number to begin. Live Meta/device verification is not available in this layer.';
    } else if (!hasCredentials) {
      status = existing?.status === 'disconnected' ? 'disconnected' : 'awaiting_credentials';
      message =
        'Number linked but credentials are not stored. Connect with an access token when ready. Cannot verify a live session without Meta/device runtime.';
    } else if (!this.encryptionKey) {
      status = 'error';
      message =
        'INTEGRATIONS_ENCRYPTION_KEY missing — cannot validate encrypted credentials or claim a healthy session.';
    } else if (existing?.status === 'connected' || account?.status === 'connected') {
      ok = true;
      status = 'connected';
      message =
        'Local session healthy: encrypted credentials present and owner number linked. Live Meta Graph / device-link probe is not wired — do not treat this as provider-verified.';
    } else if (existing?.status === 'reconnect_required' || existing?.status === 'pairing') {
      status = existing.status;
      message = `Session state is ${existing.status}. Complete Connect/Reconnect. Live provider verification unavailable.`;
    } else {
      status =
        existing?.status && existing.status !== 'not_configured'
          ? existing.status
          : 'pairing';
      message =
        'Credentials stored (pending local pairing). Run Connect to mark the owner link connected. Live sync remains unavailable without Meta/device runtime.';
    }

    const now = new Date();
    if (existing) {
      await this.db
        .update(personalWaConnections)
        .set({
          lastHealthCheckAt: now,
          lastHealthStatus: ok ? 'ok' : 'failed',
          lastHealthMessage: message,
          lastHeartbeatAt: ok ? now : existing.lastHeartbeatAt,
          status: existing.status === 'connected' && !ok ? existing.status : status,
          updatedAt: now,
        })
        .where(eq(personalWaConnections.id, existing.id));

      await this.db
        .update(commPlatformAccounts)
        .set({
          lastTestAt: now,
          lastTestStatus: ok ? 'ok' : 'failed',
          lastTestMessage: message,
          updatedAt: now,
        })
        .where(
          and(
            eq(commPlatformAccounts.companyId, actor.companyId),
            eq(commPlatformAccounts.accountKind, 'personal_whatsapp'),
            eq(commPlatformAccounts.ownerUserId, actor.userId),
          ),
        );

      await this.recordEvent(
        actor,
        existing.id,
        'health_check',
        existing.status,
        status,
        message,
        { ok, liveProviderVerified: false },
      );
      await this.recordAudit(actor, 'personal_wa_session_health_check', existing.id, {
        ok,
        status,
        liveProviderVerified: false,
      });
    }

    return {
      ok,
      status,
      message,
      testedAt,
      liveProviderVerified: false,
      autoSend: false,
    };
  }

  async updatePrivacy(
    actor: PersonalWaConnectionActor,
    input: UpdatePersonalWaConnectionPrivacyRequest,
  ): Promise<PersonalWaConnectionSummary> {
    this.assertOwnerAccess(actor);
    const existing = await this.loadConnection(actor);
    if (!existing) {
      throw new PersonalWhatsappConnectionError(
        'NOT_FOUND',
        'Link an owner WhatsApp number before updating privacy settings.',
      );
    }

    // Hard privacy invariants cannot be weakened.
    const syncEnabled = input.syncEnabled ?? existing.syncEnabled;
    const retentionDays =
      input.retentionDays === undefined ? existing.retentionDays : input.retentionDays;

    await this.db
      .update(personalWaConnections)
      .set({
        privateByDefault: true,
        excludeFromBusinessSearch: true,
        neverAutoImport: true,
        requireApprovalToSend: true,
        syncEnabled,
        retentionDays,
        updatedAt: new Date(),
      })
      .where(eq(personalWaConnections.id, existing.id));

    await this.db
      .update(commPlatformAccounts)
      .set({
        privateByDefault: true,
        syncEnabled,
        retentionDays,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(commPlatformAccounts.companyId, actor.companyId),
          eq(commPlatformAccounts.accountKind, 'personal_whatsapp'),
          eq(commPlatformAccounts.ownerUserId, actor.userId),
        ),
      );

    await this.recordEvent(
      actor,
      existing.id,
      'privacy_updated',
      existing.status,
      existing.status,
      'Privacy settings updated. Private-by-default / no auto-import / approval-to-send remain enforced.',
      { syncEnabled, retentionDays },
    );
    await this.recordAudit(actor, 'personal_wa_privacy_updated', existing.id, {
      syncEnabled,
      retentionDays,
      privateByDefault: true,
      neverAutoImport: true,
    });

    return this.getStatus(actor);
  }

  async updateSettings(
    actor: PersonalWaConnectionActor,
    input: UpdatePersonalWaConnectionSettingsRequest,
  ): Promise<PersonalWaConnectionSummary> {
    this.assertOwnerAccess(actor);
    let existing = await this.loadConnection(actor);
    const phone = input.phoneNumber
      ? normalizePersonalWaPhoneInput(input.phoneNumber)
      : existing?.linkedPhoneE164 ?? null;
    if (input.phoneNumber && !phone) {
      throw new PersonalWhatsappConnectionError(
        'VALIDATION',
        'A valid owner WhatsApp phone number is required (E.164).',
      );
    }

    if (!existing) {
      if (!phone) {
        throw new PersonalWhatsappConnectionError(
          'NOT_FOUND',
          'Link an owner WhatsApp number before updating settings.',
        );
      }
      await this.linkNumber(actor, {
        phoneNumber: phone,
        label: input.label,
        syncEnabled: input.syncEnabled,
      });
      existing = await this.loadConnection(actor);
    }

    if (!existing) {
      throw new PersonalWhatsappConnectionError('NOT_FOUND', 'Connection row missing after link.');
    }

    const syncEnabled = input.syncEnabled ?? existing.syncEnabled;
    const retentionDays =
      input.retentionDays === undefined ? existing.retentionDays : input.retentionDays;
    const displayLabel = input.label?.trim() || existing.displayLabel;

    await this.db
      .update(personalWaConnections)
      .set({
        linkedPhoneE164: phone ?? existing.linkedPhoneE164,
        displayLabel,
        syncEnabled,
        retentionDays,
        privateByDefault: true,
        excludeFromBusinessSearch: true,
        neverAutoImport: true,
        requireApprovalToSend: true,
        updatedAt: new Date(),
      })
      .where(eq(personalWaConnections.id, existing.id));

    await this.db
      .update(commPlatformAccounts)
      .set({
        label: displayLabel,
        externalAddress: phone ?? existing.linkedPhoneE164,
        syncEnabled,
        retentionDays,
        privateByDefault: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(commPlatformAccounts.companyId, actor.companyId),
          eq(commPlatformAccounts.accountKind, 'personal_whatsapp'),
          eq(commPlatformAccounts.ownerUserId, actor.userId),
        ),
      );

    await this.recordEvent(
      actor,
      existing.id,
      'settings_updated',
      existing.status,
      existing.status,
      'Owner Personal WhatsApp settings updated.',
      { syncEnabled, retentionDays },
    );
    await this.recordAudit(actor, 'personal_wa_settings_updated', existing.id, {
      syncEnabled,
      retentionDays,
    });

    return this.getStatus(actor);
  }

  async listRecentEvents(actor: PersonalWaConnectionActor, limit = 20) {
    this.assertOwnerAccess(actor);
    const rows = await this.db
      .select()
      .from(personalWaConnectionEvents)
      .where(
        and(
          eq(personalWaConnectionEvents.companyId, actor.companyId),
          eq(personalWaConnectionEvents.ownerUserId, actor.userId),
        ),
      )
      .orderBy(desc(personalWaConnectionEvents.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100));

    return rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      statusBefore: row.statusBefore,
      statusAfter: row.statusAfter,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      autoSend: false as const,
    }));
  }
}
