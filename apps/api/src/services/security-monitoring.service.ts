import { and, desc, eq, gte, sql } from 'drizzle-orm';
import {
  SECMON_ATTRIBUTION_BOUNDARY,
  SECMON_CATEGORIES,
  SECMON_CATEGORY_LABELS,
  SECMON_DEFAULT_SETTINGS,
  SECMON_MIN_OBSERVATIONS_FOR_PATTERN,
  SECMON_RECOMMENDATION_BOUNDARY,
  applySecmonSeverityFloor,
  buildSecmonUnavailableSignal,
  canManageSecmonMonitoring,
  canReadSecmonMonitoring,
  canTriageSecmonSignals,
  filterSecmonSignalsForScope,
  groupSecmonSignals,
  isSecmonIncidentOpen,
  maskSecmonEmail,
  maskSecmonIdentifier,
  normaliseSecmonSettings,
  redactSecmonIp,
  redactSecmonSecretsInText,
  redactSecmonSignalForScope,
  redactSecmonUserAgent,
  resolveSecmonAudienceScope,
  scrubSecmonMetadata,
  secmonAvailabilityFor,
  secmonConfidenceFor,
  secmonSeverityFor,
  sortSecmonSignals,
  summariseSecmonPosture,
  type DecideSecmonRecommendationRequest,
  type OpenSecmonIncidentRequest,
  type SecmonAudienceScope,
  type SecmonAuditEntry,
  type SecmonCategory,
  type SecmonCoverage,
  type SecmonDashboard,
  type SecmonEvidence,
  type SecmonEvidenceSource,
  type SecmonGroupedSignal,
  type SecmonIncident,
  type SecmonRawSignal,
  type SecmonRecommendation,
  type SecmonRecommendedAction,
  type SecmonSettings,
  type SecmonSignal,
  type SecmonTriageState,
  type TriageSecmonSignalRequest,
  type UpdateSecmonIncidentRequest,
  type UpdateSecmonSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  integrationConnections,
  secmonActionDrafts,
  secmonAuditEvents,
  secmonIncidents,
  secmonSettings,
  secmonSignalStates,
  securityAiEvents,
  securityApiRateCounters,
  securityAuditLogs,
  securityCommAccessLogs,
  securityLoginEvents,
  securityPermissionGrants,
  securityTenantPolicies,
  sessions,
  users,
} from '@titan/db';

export class SecurityMonitoringError extends Error {
  constructor(
    public readonly code: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'SecurityMonitoringError';
  }
}

export interface SecmonActor {
  companyId: string;
  userId: string;
  roleName?: string | null;
  permissions?: string[] | null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function hoursSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.max((now.getTime() - then) / 3_600_000, 0);
}

/** Actions in the audit trail that represent a privileged operation. */
const PRIVILEGED_ACTION_FRAGMENTS = [
  'role.',
  'permission',
  'impersonat',
  'export',
  'delete',
  'purge',
  'override',
  'admin',
  'billing',
  'payout',
];

/** Audit actions that record a refused or mismatched tenant access. */
const CROSS_TENANT_ACTION_FRAGMENTS = [
  'cross_tenant',
  'cross-tenant',
  'tenant_mismatch',
  'company_mismatch',
  'foreign_company',
];

function matchesAny(value: string, fragments: readonly string[]): boolean {
  const lower = value.toLowerCase();
  return fragments.some((fragment) => lower.includes(fragment));
}

export class SecurityMonitoringService {
  constructor(private readonly db: DatabaseClient) {}

  /* ---------------------------------------------------------------------- */
  /* Access                                                                  */
  /* ---------------------------------------------------------------------- */

  private scopeFor(actor: SecmonActor): SecmonAudienceScope {
    return resolveSecmonAudienceScope({
      roleName: actor.roleName,
      permissions: actor.permissions,
      userId: actor.userId,
    });
  }

  private assertRead(actor: SecmonActor): SecmonAudienceScope {
    const scope = this.scopeFor(actor);
    if (scope === 'denied') {
      throw new SecurityMonitoringError(
        'FORBIDDEN',
        'Security monitoring is not available to this role.',
      );
    }
    return scope;
  }

  private assertOwner(actor: SecmonActor): void {
    if (!canManageSecmonMonitoring({ roleName: actor.roleName, permissions: actor.permissions })) {
      throw new SecurityMonitoringError(
        'FORBIDDEN',
        'Only the Owner can change security monitoring controls or decide a recommendation.',
      );
    }
  }

  private assertTriage(actor: SecmonActor): void {
    if (!canTriageSecmonSignals({ roleName: actor.roleName, permissions: actor.permissions })) {
      throw new SecurityMonitoringError(
        'FORBIDDEN',
        'Only the Owner or an approved security administrator can triage a security signal.',
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Settings                                                                */
  /* ---------------------------------------------------------------------- */

  async getSettings(companyId: string): Promise<SecmonSettings> {
    const row = await this.db.query.secmonSettings.findFirst({
      where: eq(secmonSettings.companyId, companyId),
    });
    if (!row) return { ...SECMON_DEFAULT_SETTINGS };
    return normaliseSecmonSettings({
      lookbackDays: row.lookbackDays,
      failedLoginThreshold: row.failedLoginThreshold,
      severityFloor: row.severityFloor,
      groupDuplicates: row.groupDuplicates,
    });
  }

  async updateSettings(
    actor: SecmonActor,
    input: UpdateSecmonSettingsRequest,
  ): Promise<SecmonSettings> {
    this.assertRead(actor);
    this.assertOwner(actor);

    const current = await this.getSettings(actor.companyId);
    const next = normaliseSecmonSettings({ ...current, ...input });

    const existing = await this.db.query.secmonSettings.findFirst({
      where: eq(secmonSettings.companyId, actor.companyId),
    });

    if (existing) {
      await this.db
        .update(secmonSettings)
        .set({
          lookbackDays: next.lookbackDays,
          failedLoginThreshold: next.failedLoginThreshold,
          severityFloor: next.severityFloor,
          groupDuplicates: next.groupDuplicates,
          // Re-asserted on every write so neither invariant can be flipped.
          autoRemediationEnabled: false,
          exposeSecretsEnabled: false,
          updatedByUserId: actor.userId,
          updatedAt: new Date(),
        })
        .where(eq(secmonSettings.companyId, actor.companyId));
    } else {
      await this.db.insert(secmonSettings).values({
        companyId: actor.companyId,
        lookbackDays: next.lookbackDays,
        failedLoginThreshold: next.failedLoginThreshold,
        severityFloor: next.severityFloor,
        groupDuplicates: next.groupDuplicates,
        autoRemediationEnabled: false,
        exposeSecretsEnabled: false,
        updatedByUserId: actor.userId,
      });
    }

    await this.recordEvent(actor, 'settings_updated', null, null, {
      lookbackDays: next.lookbackDays,
      failedLoginThreshold: next.failedLoginThreshold,
      severityFloor: next.severityFloor,
      groupDuplicates: next.groupDuplicates,
    });

    return next;
  }

  /* ---------------------------------------------------------------------- */
  /* Evidence collection                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * Read the security evidence this company already stores. Nothing here is
   * written back, and every value that leaves is redacted first.
   */
  private async collectRawSignals(
    companyId: string,
    settings: SecmonSettings,
    now: Date,
  ): Promise<{ raw: SecmonRawSignal[]; counts: Map<SecmonCategory, number> }> {
    const since = new Date(now.getTime() - settings.lookbackDays * 86_400_000);
    const raw: SecmonRawSignal[] = [];
    const counts = new Map<SecmonCategory, number>();

    const bump = (category: SecmonCategory, by = 1) => {
      counts.set(category, (counts.get(category) ?? 0) + by);
    };

    const [
      loginRows,
      sessionRows,
      grantRows,
      auditRows,
      aiRows,
      commRows,
      rateRows,
      policyRow,
      integrationRows,
    ] = await Promise.all([
      this.db
        .select({
          id: securityLoginEvents.id,
          userId: securityLoginEvents.userId,
          eventType: securityLoginEvents.eventType,
          ipAddress: securityLoginEvents.ipAddress,
          userAgent: securityLoginEvents.userAgent,
          riskLevel: securityLoginEvents.riskLevel,
          occurredAt: securityLoginEvents.occurredAt,
        })
        .from(securityLoginEvents)
        .where(
          and(
            eq(securityLoginEvents.companyId, companyId),
            gte(securityLoginEvents.occurredAt, since),
          ),
        )
        .orderBy(desc(securityLoginEvents.occurredAt))
        .limit(2000),
      this.db
        .select({
          id: sessions.id,
          userId: sessions.userId,
          ipAddress: sessions.ipAddress,
          userAgent: sessions.userAgent,
          isTrustedDevice: sessions.isTrustedDevice,
          revokedAt: sessions.revokedAt,
          expiresAt: sessions.expiresAt,
          lastActivityAt: sessions.lastActivityAt,
          createdAt: sessions.createdAt,
        })
        .from(sessions)
        .where(and(eq(sessions.companyId, companyId), gte(sessions.createdAt, since)))
        .orderBy(desc(sessions.createdAt))
        .limit(1000),
      this.db
        .select({
          id: securityPermissionGrants.id,
          grantType: securityPermissionGrants.grantType,
          grantedToUserId: securityPermissionGrants.grantedToUserId,
          approved: securityPermissionGrants.approved,
          expiresAt: securityPermissionGrants.expiresAt,
          createdAt: securityPermissionGrants.createdAt,
        })
        .from(securityPermissionGrants)
        .where(
          and(
            eq(securityPermissionGrants.companyId, companyId),
            gte(securityPermissionGrants.createdAt, since),
          ),
        )
        .orderBy(desc(securityPermissionGrants.createdAt))
        .limit(1000),
      this.db
        .select({
          id: securityAuditLogs.id,
          category: securityAuditLogs.category,
          action: securityAuditLogs.action,
          userId: securityAuditLogs.userId,
          entityType: securityAuditLogs.entityType,
          occurredAt: securityAuditLogs.occurredAt,
        })
        .from(securityAuditLogs)
        .where(
          and(eq(securityAuditLogs.companyId, companyId), gte(securityAuditLogs.occurredAt, since)),
        )
        .orderBy(desc(securityAuditLogs.occurredAt))
        .limit(3000),
      this.db
        .select({
          id: securityAiEvents.id,
          userId: securityAiEvents.userId,
          agentKey: securityAiEvents.agentKey,
          eventType: securityAiEvents.eventType,
          blocked: securityAiEvents.blocked,
          occurredAt: securityAiEvents.occurredAt,
        })
        .from(securityAiEvents)
        .where(
          and(
            eq(securityAiEvents.companyId, companyId),
            eq(securityAiEvents.blocked, true),
            gte(securityAiEvents.occurredAt, since),
          ),
        )
        .orderBy(desc(securityAiEvents.occurredAt))
        .limit(1000),
      this.db
        .select({
          id: securityCommAccessLogs.id,
          userId: securityCommAccessLogs.userId,
          channel: securityCommAccessLogs.channel,
          resourceType: securityCommAccessLogs.resourceType,
          consentVerified: securityCommAccessLogs.consentVerified,
          accessedAt: securityCommAccessLogs.accessedAt,
        })
        .from(securityCommAccessLogs)
        .where(
          and(
            eq(securityCommAccessLogs.companyId, companyId),
            eq(securityCommAccessLogs.consentVerified, false),
            gte(securityCommAccessLogs.accessedAt, since),
          ),
        )
        .orderBy(desc(securityCommAccessLogs.accessedAt))
        .limit(1000),
      this.db
        .select({
          id: securityApiRateCounters.id,
          windowKey: securityApiRateCounters.windowKey,
          requestCount: securityApiRateCounters.requestCount,
          windowStartedAt: securityApiRateCounters.windowStartedAt,
        })
        .from(securityApiRateCounters)
        .where(
          and(
            eq(securityApiRateCounters.companyId, companyId),
            gte(securityApiRateCounters.windowStartedAt, since),
          ),
        )
        .orderBy(desc(securityApiRateCounters.requestCount))
        .limit(500),
      this.db.query.securityTenantPolicies.findFirst({
        where: eq(securityTenantPolicies.companyId, companyId),
      }),
      this.db
        .select({
          id: integrationConnections.id,
          provider: integrationConnections.provider,
          status: integrationConnections.status,
          lastError: integrationConnections.lastError,
          updatedAt: integrationConnections.updatedAt,
        })
        .from(integrationConnections)
        .where(eq(integrationConnections.companyId, companyId))
        .limit(300),
    ]);

    for (const row of loginRows) {
      const occurredAt = toIso(row.occurredAt);
      const device = redactSecmonUserAgent(row.userAgent);
      const network = redactSecmonIp(row.ipAddress);
      if (row.eventType === 'login_failed') {
        raw.push({
          category: 'failed_authentication',
          groupKey: row.userId ?? `network:${network ?? 'unknown'}`,
          subjectUserId: row.userId,
          subjectLabel: null,
          occurredAt,
          source: 'security_login_events',
          summary: `Failed sign-in from ${network ?? 'an unrecorded network'} on ${device ?? 'an unrecorded device'}.`,
        });
        bump('failed_authentication');
      } else if (row.eventType === 'suspicious' || row.riskLevel === 'critical') {
        raw.push({
          category: 'suspicious_session',
          groupKey: row.userId ?? `network:${network ?? 'unknown'}`,
          subjectUserId: row.userId,
          subjectLabel: null,
          occurredAt,
          source: 'security_login_events',
          summary: `Sign-in flagged ${row.riskLevel} risk from ${network ?? 'an unrecorded network'}.`,
        });
        bump('suspicious_session');
      } else if (row.eventType === 'login_success') {
        raw.push({
          category: 'login_activity',
          groupKey: row.userId ?? 'unattributed',
          subjectUserId: row.userId,
          subjectLabel: null,
          occurredAt,
          source: 'security_login_events',
          summary: `Successful sign-in from ${network ?? 'an unrecorded network'}.`,
        });
        bump('login_activity');
      }
    }

    for (const row of sessionRows) {
      // Only sessions that are still live and were never tied to a trusted
      // device are worth review. An expired or revoked session is not a finding.
      const live = !row.revokedAt && new Date(row.expiresAt).getTime() > now.getTime();
      if (!live || row.isTrustedDevice) continue;
      raw.push({
        category: 'suspicious_session',
        groupKey: `session:${row.userId}`,
        subjectUserId: row.userId,
        subjectLabel: null,
        occurredAt: toIso(row.lastActivityAt ?? row.createdAt),
        source: 'sessions',
        summary: `Active session on an untrusted device from ${redactSecmonIp(row.ipAddress) ?? 'an unrecorded network'}.`,
      });
      bump('suspicious_session');
    }

    for (const row of grantRows) {
      raw.push({
        category: 'permission_change',
        groupKey: `grant:${row.grantedToUserId}`,
        subjectUserId: row.grantedToUserId,
        subjectLabel: null,
        occurredAt: toIso(row.createdAt),
        source: 'security_permission_grants',
        summary: `${row.grantType.replace(/_/g, ' ')} permission grant recorded${row.approved ? '' : ' without a recorded approval'}.`,
      });
      bump('permission_change');
    }

    for (const row of auditRows) {
      const occurredAt = toIso(row.occurredAt);
      const action = row.action ?? '';
      if (matchesAny(action, CROSS_TENANT_ACTION_FRAGMENTS)) {
        raw.push({
          category: 'cross_tenant_attempt',
          groupKey: `cross:${row.userId ?? 'unattributed'}`,
          subjectUserId: row.userId,
          subjectLabel: null,
          occurredAt,
          source: 'security_audit_logs',
          summary: `Audit trail recorded "${redactSecmonSecretsInText(action)}".`,
        });
        bump('cross_tenant_attempt');
        continue;
      }
      if (row.category === 'integrations') {
        raw.push({
          category: 'integration_security',
          groupKey: `integration:${row.entityType ?? 'general'}`,
          subjectUserId: row.userId,
          subjectLabel: null,
          occurredAt,
          source: 'security_audit_logs',
          summary: `Integration action "${redactSecmonSecretsInText(action)}" recorded.`,
        });
        bump('integration_security');
        continue;
      }
      if (row.category === 'authorization' || matchesAny(action, PRIVILEGED_ACTION_FRAGMENTS)) {
        raw.push({
          category: 'privileged_action',
          groupKey: `privileged:${row.userId ?? 'unattributed'}`,
          subjectUserId: row.userId,
          subjectLabel: null,
          occurredAt,
          source: 'security_audit_logs',
          summary: `Privileged action "${redactSecmonSecretsInText(action)}" recorded.`,
        });
        bump('privileged_action');
      }
    }

    for (const row of aiRows) {
      raw.push({
        category: 'ai_guardrail',
        groupKey: `ai:${row.agentKey ?? 'unknown'}`,
        subjectUserId: row.userId,
        subjectLabel: null,
        occurredAt: toIso(row.occurredAt),
        source: 'security_ai_events',
        summary: `AI guardrail blocked "${redactSecmonSecretsInText(row.eventType)}".`,
      });
      bump('ai_guardrail');
    }

    for (const row of commRows) {
      raw.push({
        category: 'data_access',
        groupKey: `access:${row.resourceType}`,
        subjectUserId: row.userId,
        subjectLabel: null,
        occurredAt: toIso(row.accessedAt),
        source: 'security_comm_access_logs',
        summary: `${row.channel} access to ${row.resourceType} recorded without a verified consent flag.`,
      });
      bump('data_access');
    }

    // An unusual API window is judged against this company's own median, so a
    // busy tenant is not flagged simply for being busy.
    if (rateRows.length >= SECMON_MIN_OBSERVATIONS_FOR_PATTERN) {
      const sorted = [...rateRows].map((row) => row.requestCount).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const threshold = Math.max(median * 4, median + 100);
      for (const row of rateRows) {
        if (median > 0 && row.requestCount > threshold) {
          raw.push({
            category: 'unusual_api_activity',
            groupKey: `api:${row.windowKey}`,
            subjectUserId: null,
            subjectLabel: null,
            occurredAt: toIso(row.windowStartedAt),
            source: 'security_api_rate_counters',
            summary: `${row.requestCount} requests in one window against a median of ${median}.`,
          });
          bump('unusual_api_activity');
        }
      }
    }

    if (policyRow) {
      const gaps: string[] = [];
      if (!policyRow.mfaRequired) gaps.push('multi-factor authentication is not required');
      if (!policyRow.trustedDeviceRequired) gaps.push('a trusted device is not required');
      if (policyRow.sessionTimeoutMinutes > 720) {
        gaps.push(`sessions stay valid for ${policyRow.sessionTimeoutMinutes} minutes`);
      }
      for (const gap of gaps) {
        raw.push({
          category: 'policy_posture',
          groupKey: `policy:${gap.slice(0, 40)}`,
          subjectUserId: null,
          subjectLabel: null,
          occurredAt: toIso(now),
          source: 'security_tenant_policies',
          summary: `Current policy: ${gap}.`,
        });
        bump('policy_posture');
      }
    }

    for (const row of integrationRows) {
      if (row.status !== 'error' && !row.lastError) continue;
      raw.push({
        category: 'integration_security',
        groupKey: `connection:${row.provider}`,
        subjectUserId: null,
        subjectLabel: null,
        occurredAt: toIso(row.updatedAt),
        source: 'integration_connections',
        summary: `${row.provider} connection reported ${row.status}${
          row.lastError ? `: ${redactSecmonSecretsInText(row.lastError).slice(0, 160)}` : ''
        }.`,
      });
      bump('integration_security');
    }

    return { raw, counts };
  }

  /** Attach a readable, already-masked label to the account a signal concerns. */
  private async labelSubjects(
    companyId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .select({ id: users.id, email: users.email, companyId: users.companyId })
      .from(users)
      .where(and(eq(users.companyId, companyId), sql`${users.id} = ANY(${unique})`))
      .limit(500);
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.id, maskSecmonEmail(row.email) ?? maskSecmonIdentifier(row.id) ?? 'account');
    }
    return map;
  }

  private buildSignal(
    group: SecmonGroupedSignal,
    settings: SecmonSettings,
    now: Date,
    labels: Map<string, string>,
    triageByKey: Map<string, SecmonTriageState>,
  ): SecmonSignal {
    const key = `${group.category}:${group.groupKey}`;
    const ageHours = hoursSince(group.lastObservedAt, now);
    const availability = secmonAvailabilityFor({
      observationCount: group.occurrenceCount,
      category: group.category,
    });
    const severity = secmonSeverityFor({
      category: group.category,
      observationCount: group.occurrenceCount,
      distinctSubjects: group.distinctSubjects,
    });
    const confidence = secmonConfidenceFor({
      observationCount: group.occurrenceCount,
      distinctSources: group.sources.length,
      ageHours,
    });

    const evidence: SecmonEvidence[] = group.sources.map((source) => ({
      source: source as SecmonEvidenceSource,
      observationCount: group.occurrenceCount,
      firstObservedAt: group.firstObservedAt,
      lastObservedAt: group.lastObservedAt,
      summary: group.summaries.join(' '),
    }));

    const belowThreshold =
      group.category === 'failed_authentication' &&
      group.occurrenceCount < settings.failedLoginThreshold;

    return {
      key,
      category: group.category,
      statementKind: 'fact',
      availability: belowThreshold && availability === 'available' ? 'needs_review' : availability,
      severity,
      confidence,
      title: SECMON_CATEGORY_LABELS[group.category],
      detail: redactSecmonSecretsInText(
        `${group.occurrenceCount} matching record${group.occurrenceCount === 1 ? '' : 's'} in the last ${settings.lookbackDays} days. ${group.summaries[0] ?? ''}`.trim(),
      ),
      occurrenceCount: group.occurrenceCount,
      groupedCount: group.occurrenceCount,
      subjectUserId: group.subjectUserId,
      subjectLabel: group.subjectUserId ? (labels.get(group.subjectUserId) ?? null) : null,
      evidence,
      triage: triageByKey.get(key) ?? 'new',
      attributionNote: SECMON_ATTRIBUTION_BOUNDARY,
      sensitiveDetailWithheld: false,
      observedAt: group.lastObservedAt,
    };
  }

  /**
   * Turn the strongest signals into recommendations. Every recommendation cites
   * the evidence it came from and can only ever be approved as a decision.
   */
  private buildRecommendations(signals: readonly SecmonSignal[]): SecmonRecommendation[] {
    const actionByCategory: Partial<Record<SecmonCategory, SecmonRecommendedAction>> = {
      failed_authentication: 'review_account',
      suspicious_session: 'review_session',
      permission_change: 'review_permission_grant',
      privileged_action: 'review_permission_grant',
      integration_security: 'review_integration',
      unusual_api_activity: 'review_api_client',
      cross_tenant_attempt: 'review_account',
      policy_posture: 'tighten_policy',
      data_access: 'review_account',
    };

    return signals
      .filter(
        (signal) =>
          signal.availability === 'available' &&
          signal.evidence.length > 0 &&
          (signal.severity === 'critical' || signal.severity === 'high'),
      )
      .map((signal) => {
        const action = actionByCategory[signal.category] ?? 'review_account';
        return {
          key: `rec:${signal.key}`,
          statementKind: 'aura_recommendation' as const,
          category: signal.category,
          action,
          severity: signal.severity,
          confidence: signal.confidence,
          title: `Review: ${SECMON_CATEGORY_LABELS[signal.category]}`,
          rationale: signal.detail,
          evidence: signal.evidence,
          boundary: SECMON_RECOMMENDATION_BOUNDARY,
          requiresOwnerApproval: true as const,
          decision: 'pending' as const,
        };
      });
  }

  /* ---------------------------------------------------------------------- */
  /* Dashboard                                                               */
  /* ---------------------------------------------------------------------- */

  async getDashboard(actor: SecmonActor): Promise<SecmonDashboard> {
    const scope = this.assertRead(actor);
    const now = new Date();
    const settings = await this.getSettings(actor.companyId);

    const { raw, counts } = await this.collectRawSignals(actor.companyId, settings, now);
    const grouped = settings.groupDuplicates
      ? groupSecmonSignals(raw)
      : groupSecmonSignals(raw.map((item, index) => ({ ...item, groupKey: `${item.groupKey}#${index}` })));

    const [stateRows, incidentRows, draftRows] = await Promise.all([
      this.db
        .select({
          signalKey: secmonSignalStates.signalKey,
          triage: secmonSignalStates.triage,
        })
        .from(secmonSignalStates)
        .where(eq(secmonSignalStates.companyId, actor.companyId))
        .limit(2000),
      this.db
        .select()
        .from(secmonIncidents)
        .where(eq(secmonIncidents.companyId, actor.companyId))
        .orderBy(desc(secmonIncidents.openedAt))
        .limit(200),
      this.db
        .select()
        .from(secmonActionDrafts)
        .where(eq(secmonActionDrafts.companyId, actor.companyId))
        .orderBy(desc(secmonActionDrafts.createdAt))
        .limit(200),
    ]);

    const triageByKey = new Map<string, SecmonTriageState>(
      stateRows.map((row) => [row.signalKey, row.triage]),
    );
    const labels = await this.labelSubjects(
      actor.companyId,
      grouped.map((group) => group.subjectUserId).filter((id): id is string => Boolean(id)),
    );

    const built = grouped.map((group) =>
      this.buildSignal(group, settings, now, labels, triageByKey),
    );

    // Categories with no evidence are stated as unavailable rather than passed
    // over, so a blind spot never reads as an all-clear.
    const coverage: SecmonCoverage[] = SECMON_CATEGORIES.map((category) => {
      const observationCount = counts.get(category) ?? 0;
      return {
        category,
        label: SECMON_CATEGORY_LABELS[category],
        availability: secmonAvailabilityFor({ observationCount, category }),
        observationCount,
      };
    });

    const missing = coverage
      .filter((item) => item.availability === 'unavailable')
      .map((item) => buildSecmonUnavailableSignal({ category: item.category }));

    const allSignals = sortSecmonSignals([...built, ...missing]);
    const { visible: aboveFloor, suppressed } = applySecmonSeverityFloor(
      allSignals,
      settings.severityFloor,
    );

    const { visible: permitted, withheld } = filterSecmonSignalsForScope(
      aboveFloor,
      scope,
      actor.userId,
    );
    const signals = permitted.map((signal) => redactSecmonSignalForScope(signal, scope));

    const decisionByKey = new Map(draftRows.map((row) => [row.recommendationKey, row.decision]));
    const recommendations =
      scope === 'owner_full'
        ? this.buildRecommendations(permitted).map((recommendation) => ({
            ...recommendation,
            decision: decisionByKey.get(recommendation.key) ?? recommendation.decision,
          }))
        : [];

    const incidents: SecmonIncident[] = incidentRows.map((row) => ({
      id: row.id,
      reference: row.reference,
      title: row.title,
      status: row.status,
      severity: row.severity,
      category: row.category,
      summary: redactSecmonSecretsInText(row.summary),
      linkedSignalKeys: row.linkedSignalKeys ?? [],
      openedAt: toIso(row.openedAt) ?? new Date(0).toISOString(),
      updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
      resolvedAt: toIso(row.resolvedAt),
    }));

    const visibleIncidents = scope === 'own_account_only' ? [] : incidents;

    await this.recordEvent(actor, 'dashboard_viewed', null, null, {
      scope,
      signalCount: signals.length,
      suppressedCount: suppressed.length,
    });

    return {
      scope,
      settings,
      posture: summariseSecmonPosture({
        signals,
        openIncidents: visibleIncidents.filter((incident) => isSecmonIncidentOpen(incident.status))
          .length,
        coverage,
      }),
      signals,
      // Suppressed signals stay countable but their detail is not shown.
      suppressed: scope === 'owner_full' ? suppressed : [],
      withheld,
      coverage: scope === 'own_account_only' ? [] : coverage,
      recommendations,
      incidents: visibleIncidents,
      generatedAt: now.toISOString(),
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Triage                                                                  */
  /* ---------------------------------------------------------------------- */

  async triageSignal(
    actor: SecmonActor,
    signalKey: string,
    input: TriageSecmonSignalRequest,
  ): Promise<{ signalKey: string; triage: SecmonTriageState }> {
    this.assertRead(actor);
    this.assertTriage(actor);

    const category = (SECMON_CATEGORIES.find((item) => signalKey.startsWith(`${item}:`)) ??
      null) as SecmonCategory | null;
    if (!category) {
      throw new SecurityMonitoringError('INVALID', 'That signal key is not recognised.');
    }

    const note = input.note ? redactSecmonSecretsInText(input.note) : null;
    const existing = await this.db.query.secmonSignalStates.findFirst({
      where: and(
        eq(secmonSignalStates.companyId, actor.companyId),
        eq(secmonSignalStates.signalKey, signalKey),
      ),
    });

    if (existing) {
      await this.db
        .update(secmonSignalStates)
        .set({
          triage: input.triage,
          note,
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(secmonSignalStates.id, existing.id));
    } else {
      await this.db.insert(secmonSignalStates).values({
        companyId: actor.companyId,
        signalKey,
        category,
        triage: input.triage,
        note,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
      });
    }

    await this.recordEvent(actor, 'signal_triaged', category, signalKey, {
      triage: input.triage,
    });

    return { signalKey, triage: input.triage };
  }

  /* ---------------------------------------------------------------------- */
  /* Incidents                                                               */
  /* ---------------------------------------------------------------------- */

  async openIncident(
    actor: SecmonActor,
    input: OpenSecmonIncidentRequest,
  ): Promise<SecmonIncident> {
    this.assertRead(actor);
    this.assertTriage(actor);

    const reference = `SEC-${Date.now().toString(36).toUpperCase()}`;
    const summary = redactSecmonSecretsInText(input.summary);

    const [row] = await this.db
      .insert(secmonIncidents)
      .values({
        companyId: actor.companyId,
        reference,
        title: redactSecmonSecretsInText(input.title),
        category: input.category,
        severity: input.severity,
        summary,
        linkedSignalKeys: input.linkedSignalKeys ?? [],
        openedByUserId: actor.userId,
      })
      .returning();

    await this.recordEvent(actor, 'incident_opened', input.category, reference, {
      severity: input.severity,
    });

    return {
      id: row.id,
      reference: row.reference,
      title: row.title,
      status: row.status,
      severity: row.severity,
      category: row.category,
      summary: row.summary,
      linkedSignalKeys: row.linkedSignalKeys ?? [],
      openedAt: toIso(row.openedAt) ?? new Date().toISOString(),
      updatedAt: toIso(row.updatedAt) ?? new Date().toISOString(),
      resolvedAt: toIso(row.resolvedAt),
    };
  }

  async updateIncident(
    actor: SecmonActor,
    incidentId: string,
    input: UpdateSecmonIncidentRequest,
  ): Promise<SecmonIncident> {
    this.assertRead(actor);
    this.assertTriage(actor);

    const existing = await this.db.query.secmonIncidents.findFirst({
      where: and(
        eq(secmonIncidents.companyId, actor.companyId),
        eq(secmonIncidents.id, incidentId),
      ),
    });
    if (!existing) {
      throw new SecurityMonitoringError('NOT_FOUND', 'That incident record was not found.');
    }

    const terminal = input.status === 'resolved' || input.status === 'closed';
    const [row] = await this.db
      .update(secmonIncidents)
      .set({
        status: input.status,
        summary: input.summary ? redactSecmonSecretsInText(input.summary) : existing.summary,
        resolvedAt: terminal ? (existing.resolvedAt ?? new Date()) : null,
        updatedAt: new Date(),
      })
      .where(eq(secmonIncidents.id, incidentId))
      .returning();

    await this.recordEvent(actor, 'incident_updated', existing.category, existing.reference, {
      status: input.status,
    });

    return {
      id: row.id,
      reference: row.reference,
      title: row.title,
      status: row.status,
      severity: row.severity,
      category: row.category,
      summary: row.summary,
      linkedSignalKeys: row.linkedSignalKeys ?? [],
      openedAt: toIso(row.openedAt) ?? new Date().toISOString(),
      updatedAt: toIso(row.updatedAt) ?? new Date().toISOString(),
      resolvedAt: toIso(row.resolvedAt),
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Recommendations                                                         */
  /* ---------------------------------------------------------------------- */

  /**
   * Record the Owner's decision on a recommendation. This writes a decision and
   * nothing else: no account, permission, credential, session or integration is
   * touched here or anywhere downstream of here.
   */
  async decideRecommendation(
    actor: SecmonActor,
    recommendationKey: string,
    input: DecideSecmonRecommendationRequest,
  ): Promise<{ recommendationKey: string; decision: 'approved' | 'rejected'; executed: false }> {
    this.assertRead(actor);
    this.assertOwner(actor);

    const dashboard = await this.getDashboard(actor);
    const recommendation = dashboard.recommendations.find(
      (item) => item.key === recommendationKey,
    );
    if (!recommendation) {
      throw new SecurityMonitoringError(
        'NOT_FOUND',
        'That recommendation is no longer supported by current evidence.',
      );
    }

    const evidence = recommendation.evidence.map((item) => ({ ...item }) as Record<string, unknown>);
    if (evidence.length === 0) {
      throw new SecurityMonitoringError(
        'INVALID',
        'A recommendation cannot be decided without cited evidence.',
      );
    }

    const note = input.note ? redactSecmonSecretsInText(input.note) : null;
    const existing = await this.db.query.secmonActionDrafts.findFirst({
      where: and(
        eq(secmonActionDrafts.companyId, actor.companyId),
        eq(secmonActionDrafts.recommendationKey, recommendationKey),
      ),
    });

    if (existing) {
      await this.db
        .update(secmonActionDrafts)
        .set({
          decision: input.decision,
          decisionNote: note,
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(secmonActionDrafts.id, existing.id));
    } else {
      await this.db.insert(secmonActionDrafts).values({
        companyId: actor.companyId,
        recommendationKey,
        category: recommendation.category,
        action: recommendation.action,
        severity: recommendation.severity,
        title: recommendation.title,
        rationale: recommendation.rationale,
        evidence,
        decision: input.decision,
        decisionNote: note,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        // Never true. Approval is a record of a decision, not an execution.
        executed: false,
      });
    }

    await this.recordEvent(
      actor,
      'recommendation_decided',
      recommendation.category,
      recommendationKey,
      { decision: input.decision, action: recommendation.action, executed: false },
    );

    return { recommendationKey, decision: input.decision, executed: false };
  }

  /* ---------------------------------------------------------------------- */
  /* Audit                                                                   */
  /* ---------------------------------------------------------------------- */

  /** Append-only. Detail is scrubbed before it is stored. */
  private async recordEvent(
    actor: SecmonActor,
    eventKind:
      | 'dashboard_viewed'
      | 'settings_updated'
      | 'signal_triaged'
      | 'incident_opened'
      | 'incident_updated'
      | 'recommendation_generated'
      | 'recommendation_decided'
      | 'access_denied',
    category: SecmonCategory | null,
    subjectKey: string | null,
    detail: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(secmonAuditEvents).values({
      companyId: actor.companyId,
      eventKind,
      category,
      subjectKey,
      detail: scrubSecmonMetadata(detail) as Record<string, unknown>,
      actorUserId: actor.userId,
    });
  }

  async recordAccessDenied(actor: SecmonActor, reason: string): Promise<void> {
    await this.recordEvent(actor, 'access_denied', null, null, {
      reason: redactSecmonSecretsInText(reason),
      roleName: actor.roleName ?? null,
    });
  }

  async listAudit(actor: SecmonActor, limit = 100): Promise<SecmonAuditEntry[]> {
    this.assertRead(actor);
    if (!canReadSecmonMonitoring({ roleName: actor.roleName, permissions: actor.permissions })) {
      throw new SecurityMonitoringError('FORBIDDEN', 'Security monitoring is not available.');
    }
    // The trail names who did what inside this department, so it stays with the
    // Owner and approved security administrators.
    this.assertTriage(actor);

    const rows = await this.db
      .select()
      .from(secmonAuditEvents)
      .where(eq(secmonAuditEvents.companyId, actor.companyId))
      .orderBy(desc(secmonAuditEvents.occurredAt))
      .limit(Math.min(Math.max(limit, 1), 500));

    return rows.map((row) => ({
      id: row.id,
      eventKind: row.eventKind,
      category: row.category,
      subjectKey: row.subjectKey,
      detail: (scrubSecmonMetadata(row.detail) ?? {}) as Record<string, unknown>,
      occurredAt: toIso(row.occurredAt) ?? new Date(0).toISOString(),
    }));
  }
}
