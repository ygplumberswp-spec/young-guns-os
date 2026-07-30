import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import type { Logger } from 'pino';
import { hashPassword } from '@titan/auth';
import type {
  CreateSecurityActionRequest,
  CreateSecurityPermissionGrantRequest,
  CreateSecurityPrivacyRequest,
  RegisterTrustedDeviceRequest,
  SecurityActionStatus,
  SecurityActionSummary,
  SecurityAuditCategory,
  SecurityAuditLogSummary,
  SecurityAuraContext,
  SecurityComplianceSummary,
  SecurityEncryptionSummary,
  SecurityExecutiveDashboard,
  SecurityLoginEventSummary,
  SecurityLoginEventType,
  SecurityMfaSettingsSummary,
  SecurityPermissionGrantSummary,
  SecurityPrivacyRequestSummary,
  SecurityRiskAlertSummary,
  SecurityRiskLevel,
  SecuritySessionSummary,
  SecurityTenantPolicySummary,
  SecurityTrustedDeviceSummary,
  UpdateSecurityTenantPolicyRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  integrationConnections,
  securityActions,
  securityAiEvents,
  securityApiRateCounters,
  securityAuditLogs,
  securityCommAccessLogs,
  securityFileRecords,
  securityLoginEvents,
  securityMfaSettings,
  securityPermissionGrants,
  securityPrivacyRequests,
  securityRiskAlerts,
  securityTenantPolicies,
  securityTrustedDevices,
  securityWebauthnCredentials,
  securityWorkspaceSettings,
  sessions,
  users,
} from '@titan/db';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import {
  buildTotpUri,
  generateBackupCodes,
  generateTotpSecret,
  verifyTotpCode,
} from '../lib/totp.js';

export class EnterpriseSecurityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseSecurityError';
  }
}

type StaffScope = { companyId: string; userId: string };

type AuditInput = {
  companyId: string;
  category: SecurityAuditCategory;
  action: string;
  userId?: string;
  sessionId?: string;
  entityType?: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

export class EnterpriseSecurityService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly encryptionKey: string,
    private readonly logger?: Logger,
  ) {}

  async ensureTenantDefaults(companyId: string): Promise<void> {
    const [policy, workspace] = await Promise.all([
      this.db.query.securityTenantPolicies.findFirst({
        where: eq(securityTenantPolicies.companyId, companyId),
      }),
      this.db.query.securityWorkspaceSettings.findFirst({
        where: eq(securityWorkspaceSettings.companyId, companyId),
      }),
    ]);

    if (!policy) {
      await this.db.insert(securityTenantPolicies).values({ companyId });
    }

    if (!workspace) {
      await this.db.insert(securityWorkspaceSettings).values({ companyId });
    }
  }

  async getExecutiveDashboard(companyId: string): Promise<SecurityExecutiveDashboard> {
    await this.ensureTenantDefaults(companyId);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      activeSessions,
      trustedDevices,
      failedLogins,
      riskAlerts,
      pendingActions,
      auditEvents,
      mfaSettings,
      tenantUsers,
      recentRiskAlerts,
      recentAuditLogs,
      compliance,
      encryption,
    ] = await Promise.all([
      this.listActiveSessions(companyId),
      this.listTrustedDevices(companyId),
      this.db.query.securityLoginEvents.findMany({
        where: and(
          eq(securityLoginEvents.companyId, companyId),
          eq(securityLoginEvents.eventType, 'login_failed'),
          gte(securityLoginEvents.occurredAt, since24h),
        ),
      }),
      this.db.query.securityRiskAlerts.findMany({
        where: and(
          eq(securityRiskAlerts.companyId, companyId),
          eq(securityRiskAlerts.resolved, false),
        ),
      }),
      this.listActions(companyId, 'pending_approval'),
      this.db.query.securityAuditLogs.findMany({
        where: and(
          eq(securityAuditLogs.companyId, companyId),
          gte(securityAuditLogs.occurredAt, since24h),
        ),
      }),
      this.db.query.securityMfaSettings.findMany({
        where: and(
          eq(securityMfaSettings.companyId, companyId),
          eq(securityMfaSettings.enabled, true),
        ),
      }),
      this.db.query.users.findMany({
        where: and(eq(users.companyId, companyId), eq(users.isActive, true)),
      }),
      this.listRiskAlerts(companyId, false),
      this.listAuditLogs(companyId, 20),
      this.getComplianceSummary(companyId),
      this.getEncryptionSummary(companyId),
    ]);

    const mfaAdoptionPercent =
      tenantUsers.length > 0 ? Math.round((mfaSettings.length / tenantUsers.length) * 100) : null;
    const scoreResult = computeSecurityScore({
      mfaAdoptionPercent,
      failedLoginCount24h: failedLogins.length,
      unresolvedRiskAlerts: riskAlerts.length,
      pendingActionCount: pendingActions.length,
      compliance,
      encryption,
    });

    return {
      summary: `${activeSessions.length} active session(s), ${riskAlerts.length} risk alert(s), ${pendingActions.length} pending security action(s).`,
      securityScore: scoreResult.score,
      securityScoreFactors: scoreResult.factors,
      activeSessionCount: activeSessions.length,
      trustedDeviceCount: trustedDevices.filter((device) => device.approved).length,
      failedLoginCount24h: failedLogins.length,
      riskAlertCount: riskAlerts.length,
      pendingActionCount: pendingActions.length,
      auditEventCount24h: auditEvents.length,
      mfaAdoptionPercent,
      compliance,
      encryption,
      recentRiskAlerts: recentRiskAlerts.slice(0, 10),
      recentAuditLogs: recentAuditLogs.slice(0, 10),
    };
  }

  async buildSecurityAuraContext(companyId: string): Promise<SecurityAuraContext> {
    const dashboard = await this.getExecutiveDashboard(companyId);
    return {
      summary: dashboard.summary,
      securityScore: dashboard.securityScore,
      activeSessionCount: dashboard.activeSessionCount,
      riskAlertCount: dashboard.riskAlertCount,
      pendingActionCount: dashboard.pendingActionCount,
      failedLoginCount24h: dashboard.failedLoginCount24h,
    };
  }

  async recordAuditLog(input: AuditInput): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: input.companyId,
      category: input.category,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      userId: input.userId,
      sessionId: input.sessionId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: input.metadata ?? {},
    });
  }

  async recordLoginEvent(input: {
    companyId?: string;
    userId?: string;
    eventType: SecurityLoginEventType;
    ipAddress?: string;
    userAgent?: string;
    geoHint?: string;
    riskLevel?: SecurityRiskLevel;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.db.insert(securityLoginEvents).values({
        companyId: input.companyId,
        userId: input.userId,
        eventType: input.eventType,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        geoHint: input.geoHint,
        riskLevel: input.riskLevel ?? 'low',
        metadata: input.metadata ?? {},
      });
    } catch (error) {
      this.logger?.warn(
        {
          err: error,
          eventType: input.eventType,
          companyId: input.companyId,
          userId: input.userId,
        },
        'Failed to persist security login event — continuing without blocking auth',
      );
      return;
    }

    try {
      if (input.companyId && input.eventType === 'login_failed') {
        await this.evaluateFailedLoginRisk(input.companyId, input.userId, input.ipAddress);
      }

      if (input.companyId && input.eventType === 'login_success' && input.userId) {
        await this.recordAuditLog({
          companyId: input.companyId,
          category: 'authentication',
          action: 'login_success',
          userId: input.userId,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        });
      }
    } catch (error) {
      this.logger?.warn(
        {
          err: error,
          eventType: input.eventType,
          companyId: input.companyId,
          userId: input.userId,
        },
        'Security login follow-up step failed — auth is unaffected',
      );
    }
  }

  async listAuditLogs(companyId: string, limit = 100): Promise<SecurityAuditLogSummary[]> {
    const rows = await this.db.query.securityAuditLogs.findMany({
      where: eq(securityAuditLogs.companyId, companyId),
      orderBy: [desc(securityAuditLogs.occurredAt)],
      limit,
      with: { user: true },
    });

    return rows.map((row) => ({
      id: row.id,
      category: row.category,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      userId: row.userId,
      userName: row.user ? `${row.user.firstName} ${row.user.lastName}`.trim() : null,
      ipAddress: row.ipAddress,
      metadata: row.metadata,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  async listLoginEvents(companyId: string, limit = 100): Promise<SecurityLoginEventSummary[]> {
    const rows = await this.db.query.securityLoginEvents.findMany({
      where: eq(securityLoginEvents.companyId, companyId),
      orderBy: [desc(securityLoginEvents.occurredAt)],
      limit,
    });

    return rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      geoHint: row.geoHint,
      riskLevel: row.riskLevel,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  async listActiveSessions(
    companyId: string,
    currentSessionId?: string,
  ): Promise<SecuritySessionSummary[]> {
    const rows = await this.db.query.sessions.findMany({
      where: and(
        eq(sessions.companyId, companyId),
        isNull(sessions.revokedAt),
        gte(sessions.expiresAt, new Date()),
      ),
      orderBy: [desc(sessions.createdAt)],
      with: { user: true },
    });

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: row.user ? `${row.user.firstName} ${row.user.lastName}`.trim() : 'Unknown user',
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      isCurrent: currentSessionId ? row.id === currentSessionId : false,
    }));
  }

  async revokeSession(scope: StaffScope, sessionId: string): Promise<void> {
    const session = await this.db.query.sessions.findFirst({
      where: and(eq(sessions.id, sessionId), eq(sessions.companyId, scope.companyId)),
    });

    if (!session) {
      throw new EnterpriseSecurityError('SESSION_NOT_FOUND', 'Session not found');
    }

    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));

    await this.recordLoginEvent({
      companyId: scope.companyId,
      userId: session.userId,
      eventType: 'session_revoked',
      metadata: { revokedByUserId: scope.userId, sessionId },
    });

    await this.recordAuditLog({
      companyId: scope.companyId,
      category: 'authentication',
      action: 'session_revoked',
      userId: scope.userId,
      sessionId,
      metadata: { targetUserId: session.userId },
    });
  }

  async revokeAllOtherSessions(scope: StaffScope, currentSessionId: string): Promise<number> {
    const activeSessions = await this.listActiveSessions(scope.companyId, currentSessionId);
    const toRevoke = activeSessions.filter((session) => !session.isCurrent);

    for (const session of toRevoke) {
      await this.revokeSession(scope, session.id);
    }

    await this.recordAuditLog({
      companyId: scope.companyId,
      category: 'authentication',
      action: 'sessions_revoked_all_other',
      userId: scope.userId,
      sessionId: currentSessionId,
      metadata: { revokedCount: toRevoke.length },
    });

    return toRevoke.length;
  }

  async getTenantPolicy(companyId: string): Promise<SecurityTenantPolicySummary> {
    await this.ensureTenantDefaults(companyId);
    const policy = await this.db.query.securityTenantPolicies.findFirst({
      where: eq(securityTenantPolicies.companyId, companyId),
    });

    if (!policy) {
      throw new EnterpriseSecurityError('POLICY_NOT_FOUND', 'Security policy not found');
    }

    return mapTenantPolicy(policy);
  }

  async updateTenantPolicy(
    scope: StaffScope,
    input: UpdateSecurityTenantPolicyRequest,
  ): Promise<SecurityTenantPolicySummary> {
    await this.ensureTenantDefaults(scope.companyId);
    const [updated] = await this.db
      .update(securityTenantPolicies)
      .set({ ...input, updatedByUserId: scope.userId, updatedAt: new Date() })
      .where(eq(securityTenantPolicies.companyId, scope.companyId))
      .returning();

    if (!updated) {
      throw new EnterpriseSecurityError('POLICY_UPDATE_FAILED', 'Unable to update security policy');
    }

    await this.recordAuditLog({
      companyId: scope.companyId,
      category: 'settings',
      action: 'security_policy_updated',
      userId: scope.userId,
      metadata: input,
    });

    return mapTenantPolicy(updated);
  }

  async getMfaSettings(scope: StaffScope): Promise<SecurityMfaSettingsSummary> {
    const row = await this.db.query.securityMfaSettings.findFirst({
      where: and(
        eq(securityMfaSettings.companyId, scope.companyId),
        eq(securityMfaSettings.userId, scope.userId),
      ),
    });

    return {
      enabled: row?.enabled ?? false,
      verifiedAt: row?.verifiedAt?.toISOString() ?? null,
      backupCodesRemaining: row?.backupCodesHashed.length ?? 0,
    };
  }

  async beginMfaSetup(scope: StaffScope, accountEmail: string) {
    const secret = generateTotpSecret();
    const backupCodes = generateBackupCodes();
    const backupCodesHashed = await Promise.all(backupCodes.map((code) => hashPassword(code)));
    const existing = await this.db.query.securityMfaSettings.findFirst({
      where: and(
        eq(securityMfaSettings.companyId, scope.companyId),
        eq(securityMfaSettings.userId, scope.userId),
      ),
    });

    const payload = {
      companyId: scope.companyId,
      userId: scope.userId,
      enabled: false,
      totpSecretEncrypted: encryptSecret(secret, this.encryptionKey),
      backupCodesHashed,
      updatedAt: new Date(),
    };

    if (existing) {
      await this.db
        .update(securityMfaSettings)
        .set(payload)
        .where(eq(securityMfaSettings.id, existing.id));
    } else {
      await this.db.insert(securityMfaSettings).values(payload);
    }

    return { otpauthUri: buildTotpUri(secret, accountEmail), backupCodes };
  }

  async verifyMfaSetup(
    scope: StaffScope,
    verificationCode: string,
  ): Promise<SecurityMfaSettingsSummary> {
    const row = await this.db.query.securityMfaSettings.findFirst({
      where: and(
        eq(securityMfaSettings.companyId, scope.companyId),
        eq(securityMfaSettings.userId, scope.userId),
      ),
    });

    if (!row?.totpSecretEncrypted) {
      throw new EnterpriseSecurityError('MFA_NOT_STARTED', 'MFA setup has not been started');
    }

    const secret = decryptSecret(row.totpSecretEncrypted, this.encryptionKey);
    if (!verifyTotpCode(secret, verificationCode)) {
      throw new EnterpriseSecurityError('MFA_INVALID_CODE', 'Invalid verification code');
    }

    const [updated] = await this.db
      .update(securityMfaSettings)
      .set({ enabled: true, verifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(securityMfaSettings.id, row.id))
      .returning();

    await this.recordAuditLog({
      companyId: scope.companyId,
      category: 'security',
      action: 'mfa_enabled',
      userId: scope.userId,
    });

    return {
      enabled: updated?.enabled ?? true,
      verifiedAt: updated?.verifiedAt?.toISOString() ?? new Date().toISOString(),
      backupCodesRemaining: updated?.backupCodesHashed.length ?? 0,
    };
  }

  async listTrustedDevices(
    companyId: string,
    userId?: string,
  ): Promise<SecurityTrustedDeviceSummary[]> {
    const rows = await this.db.query.securityTrustedDevices.findMany({
      where: userId
        ? and(
            eq(securityTrustedDevices.companyId, companyId),
            eq(securityTrustedDevices.userId, userId),
          )
        : eq(securityTrustedDevices.companyId, companyId),
      orderBy: [desc(securityTrustedDevices.lastSeenAt)],
    });

    return rows.map((row) => ({
      id: row.id,
      deviceLabel: row.deviceLabel,
      deviceFingerprint: row.deviceFingerprint,
      approved: row.approved,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
    }));
  }

  async registerTrustedDevice(
    scope: StaffScope,
    input: RegisterTrustedDeviceRequest,
  ): Promise<SecurityTrustedDeviceSummary> {
    const policy = await this.getTenantPolicy(scope.companyId);
    const [device] = await this.db
      .insert(securityTrustedDevices)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        deviceLabel: input.deviceLabel.trim(),
        deviceFingerprint: input.deviceFingerprint.trim(),
        approved: !policy.trustedDeviceRequired,
        lastSeenAt: new Date(),
      })
      .returning();

    if (!device) {
      throw new EnterpriseSecurityError(
        'DEVICE_REGISTER_FAILED',
        'Unable to register trusted device',
      );
    }

    await this.recordAuditLog({
      companyId: scope.companyId,
      category: 'security',
      action: 'trusted_device_registered',
      userId: scope.userId,
      entityType: 'trusted_device',
      entityId: device.id,
    });

    return {
      id: device.id,
      deviceLabel: device.deviceLabel,
      deviceFingerprint: device.deviceFingerprint,
      approved: device.approved,
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
    };
  }

  async approveTrustedDevice(
    scope: StaffScope,
    deviceId: string,
  ): Promise<SecurityTrustedDeviceSummary> {
    const [updated] = await this.db
      .update(securityTrustedDevices)
      .set({ approved: true, lastSeenAt: new Date() })
      .where(
        and(
          eq(securityTrustedDevices.id, deviceId),
          eq(securityTrustedDevices.companyId, scope.companyId),
        ),
      )
      .returning();

    if (!updated) {
      throw new EnterpriseSecurityError('DEVICE_NOT_FOUND', 'Trusted device not found');
    }

    return {
      id: updated.id,
      deviceLabel: updated.deviceLabel,
      deviceFingerprint: updated.deviceFingerprint,
      approved: updated.approved,
      lastSeenAt: updated.lastSeenAt?.toISOString() ?? null,
      ipAddress: updated.ipAddress,
      userAgent: updated.userAgent,
    };
  }

  async touchTrustedDevice(input: {
    companyId: string;
    userId: string;
    deviceFingerprint: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await this.db
      .update(securityTrustedDevices)
      .set({ lastSeenAt: new Date(), ipAddress: input.ipAddress, userAgent: input.userAgent })
      .where(
        and(
          eq(securityTrustedDevices.companyId, input.companyId),
          eq(securityTrustedDevices.userId, input.userId),
          eq(securityTrustedDevices.deviceFingerprint, input.deviceFingerprint),
        ),
      );
  }

  async listPermissionGrants(companyId: string): Promise<SecurityPermissionGrantSummary[]> {
    const rows = await this.db.query.securityPermissionGrants.findMany({
      where: eq(securityPermissionGrants.companyId, companyId),
      orderBy: [desc(securityPermissionGrants.createdAt)],
      with: { grantedTo: true },
    });

    return rows.map((row) => ({
      id: row.id,
      grantType: row.grantType,
      permissions: row.permissions,
      grantedToUserId: row.grantedToUserId,
      grantedToUserName: row.grantedTo
        ? `${row.grantedTo.firstName} ${row.grantedTo.lastName}`.trim()
        : null,
      grantedByUserId: row.grantedByUserId,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      approved: row.approved,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createPermissionGrant(
    scope: StaffScope,
    input: CreateSecurityPermissionGrantRequest,
  ): Promise<SecurityPermissionGrantSummary> {
    const requiresApproval = input.requiresApproval ?? input.grantType === 'executive_override';
    const [grant] = await this.db
      .insert(securityPermissionGrants)
      .values({
        companyId: scope.companyId,
        grantType: input.grantType,
        permissions: input.permissions,
        grantedToUserId: input.grantedToUserId,
        grantedByUserId: scope.userId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        approved: !requiresApproval,
      })
      .returning();

    if (!grant) {
      throw new EnterpriseSecurityError('GRANT_CREATE_FAILED', 'Unable to create permission grant');
    }

    const grantedTo = await this.db.query.users.findFirst({
      where: eq(users.id, grant.grantedToUserId),
    });

    return {
      id: grant.id,
      grantType: grant.grantType,
      permissions: grant.permissions,
      grantedToUserId: grant.grantedToUserId,
      grantedToUserName: grantedTo ? `${grantedTo.firstName} ${grantedTo.lastName}`.trim() : null,
      grantedByUserId: grant.grantedByUserId,
      expiresAt: grant.expiresAt?.toISOString() ?? null,
      approved: grant.approved,
      createdAt: grant.createdAt.toISOString(),
    };
  }

  async listActions(
    companyId: string,
    status?: SecurityActionStatus,
  ): Promise<SecurityActionSummary[]> {
    const rows = await this.db.query.securityActions.findMany({
      where: status
        ? and(eq(securityActions.companyId, companyId), eq(securityActions.status, status))
        : eq(securityActions.companyId, companyId),
      orderBy: [desc(securityActions.createdAt)],
    });

    return rows.map((row) => ({
      id: row.id,
      actionType: row.actionType,
      status: row.status,
      subject: row.subject,
      recommendation: row.recommendation,
      payload: row.payload,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createAction(
    scope: StaffScope,
    input: CreateSecurityActionRequest,
  ): Promise<SecurityActionSummary> {
    const [action] = await this.db
      .insert(securityActions)
      .values({
        companyId: scope.companyId,
        actionType: input.actionType,
        subject: input.subject.trim(),
        recommendation: input.recommendation.trim(),
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
        status: 'pending_approval',
      })
      .returning();

    if (!action) {
      throw new EnterpriseSecurityError('ACTION_CREATE_FAILED', 'Unable to create security action');
    }

    return {
      id: action.id,
      actionType: action.actionType,
      status: action.status,
      subject: action.subject,
      recommendation: action.recommendation,
      payload: action.payload,
      createdByUserId: action.createdByUserId,
      createdAt: action.createdAt.toISOString(),
    };
  }

  async updateActionStatus(
    scope: StaffScope,
    actionId: string,
    status: SecurityActionStatus,
  ): Promise<SecurityActionSummary> {
    const [updated] = await this.db
      .update(securityActions)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(securityActions.id, actionId), eq(securityActions.companyId, scope.companyId)))
      .returning();

    if (!updated) {
      throw new EnterpriseSecurityError('ACTION_NOT_FOUND', 'Security action not found');
    }

    return {
      id: updated.id,
      actionType: updated.actionType,
      status: updated.status,
      subject: updated.subject,
      recommendation: updated.recommendation,
      payload: updated.payload,
      createdByUserId: updated.createdByUserId,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async listPrivacyRequests(companyId: string): Promise<SecurityPrivacyRequestSummary[]> {
    const rows = await this.db.query.securityPrivacyRequests.findMany({
      where: eq(securityPrivacyRequests.companyId, companyId),
      orderBy: [desc(securityPrivacyRequests.createdAt)],
    });

    return rows.map((row) => ({
      id: row.id,
      requestType: row.requestType,
      status: row.status,
      subject: row.subject,
      notes: row.notes,
      requestedByUserId: row.requestedByUserId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createPrivacyRequest(
    scope: StaffScope,
    input: CreateSecurityPrivacyRequest,
  ): Promise<SecurityPrivacyRequestSummary> {
    const [requestRow] = await this.db
      .insert(securityPrivacyRequests)
      .values({
        companyId: scope.companyId,
        requestType: input.requestType,
        subject: input.subject.trim(),
        notes: input.notes?.trim(),
        requestedByUserId: scope.userId,
        status: 'pending',
      })
      .returning();

    if (!requestRow) {
      throw new EnterpriseSecurityError(
        'PRIVACY_REQUEST_FAILED',
        'Unable to create privacy request',
      );
    }

    return {
      id: requestRow.id,
      requestType: requestRow.requestType,
      status: requestRow.status,
      subject: requestRow.subject,
      notes: requestRow.notes,
      requestedByUserId: requestRow.requestedByUserId,
      createdAt: requestRow.createdAt.toISOString(),
    };
  }

  async listRiskAlerts(
    companyId: string,
    includeResolved = true,
  ): Promise<SecurityRiskAlertSummary[]> {
    const rows = await this.db.query.securityRiskAlerts.findMany({
      where: includeResolved
        ? eq(securityRiskAlerts.companyId, companyId)
        : and(eq(securityRiskAlerts.companyId, companyId), eq(securityRiskAlerts.resolved, false)),
      orderBy: [desc(securityRiskAlerts.createdAt)],
      limit: 100,
    });

    return rows.map((row) => ({
      id: row.id,
      riskLevel: row.riskLevel,
      subject: row.subject,
      description: row.description,
      sourceCategory: row.sourceCategory,
      resolved: row.resolved,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async resolveRiskAlert(scope: StaffScope, alertId: string): Promise<SecurityRiskAlertSummary> {
    const [updated] = await this.db
      .update(securityRiskAlerts)
      .set({ resolved: true })
      .where(
        and(eq(securityRiskAlerts.id, alertId), eq(securityRiskAlerts.companyId, scope.companyId)),
      )
      .returning();

    if (!updated) {
      throw new EnterpriseSecurityError('ALERT_NOT_FOUND', 'Risk alert not found');
    }

    return {
      id: updated.id,
      riskLevel: updated.riskLevel,
      subject: updated.subject,
      description: updated.description,
      sourceCategory: updated.sourceCategory,
      resolved: updated.resolved,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async recordAiEvent(input: {
    companyId: string;
    userId?: string;
    agentKey?: string;
    toolKey?: string;
    eventType: string;
    blocked?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(securityAiEvents).values({
      companyId: input.companyId,
      userId: input.userId,
      agentKey: input.agentKey,
      toolKey: input.toolKey,
      eventType: input.eventType,
      blocked: input.blocked ?? false,
      metadata: input.metadata ?? {},
    });
  }

  async recordCommAccess(input: {
    companyId: string;
    userId?: string;
    channel: string;
    resourceType: string;
    resourceId?: string;
    consentVerified?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(securityCommAccessLogs).values({
      companyId: input.companyId,
      userId: input.userId,
      channel: input.channel,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      consentVerified: input.consentVerified ?? false,
      metadata: input.metadata ?? {},
    });
  }

  async registerFileRecord(input: {
    companyId: string;
    documentId?: string;
    fileName?: string;
    mimeType?: string;
    contentHash?: string;
    metadata?: Record<string, unknown>;
  }) {
    const [record] = await this.db
      .insert(securityFileRecords)
      .values({
        companyId: input.companyId,
        documentId: input.documentId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        contentHash: input.contentHash,
        scanStatus: 'pending',
        metadata: input.metadata ?? {},
      })
      .returning();

    return record;
  }

  async validateZeroTrustRequest(input: {
    companyId: string;
    userId: string;
    sessionId: string;
    roleId: string;
    permissions: string[];
    ipAddress?: string;
    userAgent?: string;
    deviceFingerprint?: string;
    method: string;
    path: string;
  }): Promise<{
    allowed: boolean;
    code?: string;
    message?: string;
    statusCode?: number;
    touchDevice?: boolean;
  }> {
    await this.ensureTenantDefaults(input.companyId);

    if (!input.permissions.length) {
      return {
        allowed: false,
        code: 'PERMISSIONS_MISSING',
        message: 'Authenticated user has no permissions assigned',
        statusCode: 403,
      };
    }

    const session = await this.db.query.sessions.findFirst({
      where: and(
        eq(sessions.id, input.sessionId),
        eq(sessions.userId, input.userId),
        eq(sessions.companyId, input.companyId),
        isNull(sessions.revokedAt),
        gte(sessions.expiresAt, new Date()),
      ),
    });

    if (!session) {
      return {
        allowed: false,
        code: 'SESSION_INVALID',
        message: 'Session is invalid or expired',
        statusCode: 401,
      };
    }

    const policy = await this.getTenantPolicy(input.companyId);
    const timeoutMs = policy.sessionTimeoutMinutes * 60 * 1000;
    if (session.createdAt.getTime() + timeoutMs < Date.now()) {
      await this.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.id, session.id));
      return {
        allowed: false,
        code: 'SESSION_TIMEOUT',
        message: 'Session exceeded tenant timeout policy',
        statusCode: 401,
      };
    }

    if (policy.trustedDeviceRequired && input.deviceFingerprint) {
      const device = await this.db.query.securityTrustedDevices.findFirst({
        where: and(
          eq(securityTrustedDevices.companyId, input.companyId),
          eq(securityTrustedDevices.userId, input.userId),
          eq(securityTrustedDevices.deviceFingerprint, input.deviceFingerprint),
          eq(securityTrustedDevices.approved, true),
        ),
      });

      if (!device) {
        return {
          allowed: false,
          code: 'DEVICE_NOT_TRUSTED',
          message: 'Trusted device approval is required for this tenant',
          statusCode: 403,
        };
      }

      return { allowed: true, touchDevice: true };
    }

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(input.method.toUpperCase())) {
      void this.recordAuditLog({
        companyId: input.companyId,
        category: 'api',
        action: `${input.method.toUpperCase()} ${input.path}`,
        userId: input.userId,
        sessionId: input.sessionId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    }

    return { allowed: true, touchDevice: Boolean(input.deviceFingerprint) };
  }

  async checkRateLimit(input: {
    companyId: string;
    userId: string;
    maxRequests: number;
    windowMs: number;
  }): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const windowStart = new Date(Math.floor(Date.now() / input.windowMs) * input.windowMs);
    const windowKey = `${input.userId}:${windowStart.toISOString()}`;
    const existing = await this.db.query.securityApiRateCounters.findFirst({
      where: and(
        eq(securityApiRateCounters.companyId, input.companyId),
        eq(securityApiRateCounters.windowKey, windowKey),
      ),
    });

    if (!existing) {
      await this.db.insert(securityApiRateCounters).values({
        companyId: input.companyId,
        windowKey,
        requestCount: 1,
        windowStartedAt: windowStart,
      });

      return {
        allowed: true,
        remaining: input.maxRequests - 1,
        resetAt: windowStart.getTime() + input.windowMs,
      };
    }

    const nextCount = existing.requestCount + 1;
    await this.db
      .update(securityApiRateCounters)
      .set({ requestCount: nextCount })
      .where(eq(securityApiRateCounters.id, existing.id));

    return {
      allowed: nextCount <= input.maxRequests,
      remaining: Math.max(0, input.maxRequests - nextCount),
      resetAt: windowStart.getTime() + input.windowMs,
    };
  }

  async getComplianceSummary(companyId: string): Promise<SecurityComplianceSummary> {
    await this.ensureTenantDefaults(companyId);
    const [policy, workspace] = await Promise.all([
      this.db.query.securityTenantPolicies.findFirst({
        where: eq(securityTenantPolicies.companyId, companyId),
      }),
      this.db.query.securityWorkspaceSettings.findFirst({
        where: eq(securityWorkspaceSettings.companyId, companyId),
      }),
    ]);

    return {
      popiaReady: policy?.popiaReady ?? false,
      gdprReady: policy?.gdprReady ?? false,
      consentTrackingEnabled: true,
      retentionPolicyConfigured: (policy?.auditRetentionDays ?? 0) > 0,
      privacyRequestWorkflowEnabled: true,
      auditLoggingEnabled: true,
      encryptionAtRestEnabled: true,
      personalWorkspaceIsolated: workspace?.independentAuditTrail ?? true,
    };
  }

  async getEncryptionSummary(companyId: string): Promise<SecurityEncryptionSummary> {
    const connections = await this.db.query.integrationConnections.findMany({
      where: eq(integrationConnections.companyId, companyId),
    });
    const workspace = await this.db.query.securityWorkspaceSettings.findFirst({
      where: eq(securityWorkspaceSettings.companyId, companyId),
    });

    return {
      integrationCredentialsEncrypted:
        connections.length === 0 || connections.every((row) => Boolean(row.credentialsEncrypted)),
      aiProviderCredentialsEncrypted: true,
      mfaSecretsEncrypted: true,
      refreshTokensHashed: true,
      apiKeysHashed: true,
      personalWorkspaceEncrypted: workspace?.personalWorkspaceEncrypted ?? true,
    };
  }

  async registerWebauthnCredential(
    scope: StaffScope,
    input: { credentialId: string; publicKey: string; deviceLabel?: string },
  ) {
    const [credential] = await this.db
      .insert(securityWebauthnCredentials)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        credentialId: input.credentialId,
        publicKey: input.publicKey,
        deviceLabel: input.deviceLabel,
      })
      .returning();

    return credential;
  }

  private async evaluateFailedLoginRisk(
    companyId: string,
    userId?: string,
    ipAddress?: string,
  ): Promise<void> {
    const since = new Date(Date.now() - 15 * 60 * 1000);
    const conditions = [
      eq(securityLoginEvents.companyId, companyId),
      eq(securityLoginEvents.eventType, 'login_failed'),
      gte(securityLoginEvents.occurredAt, since),
    ];
    if (userId) {
      conditions.push(eq(securityLoginEvents.userId, userId));
    }

    const failed = await this.db.query.securityLoginEvents.findMany({ where: and(...conditions) });
    const policy = await this.getTenantPolicy(companyId);

    if (failed.length >= policy.maxFailedLoginAttempts) {
      await this.db.insert(securityRiskAlerts).values({
        companyId,
        riskLevel: 'high',
        subject: 'Repeated failed login attempts',
        description: `${failed.length} failed login attempt(s) detected in the last 15 minutes${ipAddress ? ` from ${ipAddress}` : ''}.`,
        sourceCategory: 'authentication',
        metadata: { userId, ipAddress, failedCount: failed.length },
      });
    }
  }
}

function mapTenantPolicy(
  policy: typeof securityTenantPolicies.$inferSelect,
): SecurityTenantPolicySummary {
  return {
    mfaRequired: policy.mfaRequired,
    sessionTimeoutMinutes: policy.sessionTimeoutMinutes,
    passwordExpiryDays: policy.passwordExpiryDays,
    passwordHistoryCount: policy.passwordHistoryCount,
    maxFailedLoginAttempts: policy.maxFailedLoginAttempts,
    trustedDeviceRequired: policy.trustedDeviceRequired,
    personalWorkspaceIsolation: policy.personalWorkspaceIsolation,
    auditRetentionDays: policy.auditRetentionDays,
    popiaReady: policy.popiaReady,
    gdprReady: policy.gdprReady,
  };
}

function computeSecurityScore(input: {
  mfaAdoptionPercent: number | null;
  failedLoginCount24h: number;
  unresolvedRiskAlerts: number;
  pendingActionCount: number;
  compliance: SecurityComplianceSummary;
  encryption: SecurityEncryptionSummary;
}): { score: number | null; factors: import('@titan/shared').SecurityScoreFactor[] } {
  const factors: import('@titan/shared').SecurityScoreFactor[] = [];
  let score = 100;

  if (input.mfaAdoptionPercent === null) {
    factors.push({
      label: 'MFA adoption',
      impact: 0,
      detail: 'Not assessed — no active users to measure adoption.',
    });
  } else {
    const mfaImpact = Math.max(0, 30 - Math.round(input.mfaAdoptionPercent * 0.3));
    if (mfaImpact > 0) {
      factors.push({
        label: 'MFA adoption',
        impact: -mfaImpact,
        detail: `${input.mfaAdoptionPercent}% of active users have MFA enabled.`,
      });
    }
    score -= mfaImpact;
  }

  const failedLoginImpact = Math.min(20, input.failedLoginCount24h * 2);
  if (failedLoginImpact > 0) {
    factors.push({
      label: 'Failed logins (24h)',
      impact: -failedLoginImpact,
      detail: `${input.failedLoginCount24h} failed login attempt(s) in the last 24 hours.`,
    });
    score -= failedLoginImpact;
  }

  const alertImpact = Math.min(25, input.unresolvedRiskAlerts * 5);
  if (alertImpact > 0) {
    factors.push({
      label: 'Unresolved risk alerts',
      impact: -alertImpact,
      detail: `${input.unresolvedRiskAlerts} unresolved risk alert(s).`,
    });
    score -= alertImpact;
  }

  const actionImpact = Math.min(10, input.pendingActionCount);
  if (actionImpact > 0) {
    factors.push({
      label: 'Pending security actions',
      impact: -actionImpact,
      detail: `${input.pendingActionCount} security action(s) awaiting approval.`,
    });
    score -= actionImpact;
  }

  if (!input.compliance.auditLoggingEnabled) {
    factors.push({ label: 'Audit logging', impact: -10, detail: 'Audit logging is disabled.' });
    score -= 10;
  }

  if (!input.encryption.integrationCredentialsEncrypted) {
    factors.push({
      label: 'Integration credential encryption',
      impact: -10,
      detail: 'Integration credentials are not fully encrypted.',
    });
    score -= 10;
  }

  if (factors.length === 0) {
    factors.push({
      label: 'Baseline',
      impact: 0,
      detail: 'No deductions from current security signals.',
    });
  }

  return { score: Math.max(0, Math.min(100, score)), factors };
}
