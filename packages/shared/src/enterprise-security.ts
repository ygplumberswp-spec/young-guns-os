export type SecurityAuditCategory =
  | 'authentication'
  | 'authorization'
  | 'financial'
  | 'workflow'
  | 'ai'
  | 'crm'
  | 'inventory'
  | 'fleet'
  | 'dispatch'
  | 'quality'
  | 'communications'
  | 'personal_workspace'
  | 'reports'
  | 'integrations'
  | 'api'
  | 'settings'
  | 'security';

export type SecurityLoginEventType =
  'login_success' | 'login_failed' | 'logout' | 'session_revoked' | 'suspicious';

export type SecurityRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type SecurityActionType =
  | 'security_action'
  | 'permission_change'
  | 'integration_lockdown'
  | 'session_revocation'
  | 'privacy_request';

export type SecurityActionStatus =
  'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled';

export type SecurityPrivacyRequestType = 'data_export' | 'data_deletion' | 'consent_update';
export type SecurityPrivacyRequestStatus =
  'pending' | 'in_review' | 'approved' | 'completed' | 'rejected';

export type SecurityPermissionGrantType = 'temporary' | 'delegated' | 'executive_override';

export type SecurityTenantPolicySummary = {
  mfaRequired: boolean;
  sessionTimeoutMinutes: number;
  passwordExpiryDays: number | null;
  passwordHistoryCount: number;
  maxFailedLoginAttempts: number;
  trustedDeviceRequired: boolean;
  personalWorkspaceIsolation: boolean;
  auditRetentionDays: number;
  popiaReady: boolean;
  gdprReady: boolean;
};

export type SecurityMfaSettingsSummary = {
  enabled: boolean;
  verifiedAt: string | null;
  backupCodesRemaining: number;
};

export type SecurityTrustedDeviceSummary = {
  id: string;
  deviceLabel: string;
  deviceFingerprint: string;
  approved: boolean;
  lastSeenAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export type SecurityLoginEventSummary = {
  id: string;
  eventType: SecurityLoginEventType;
  ipAddress: string | null;
  userAgent: string | null;
  geoHint: string | null;
  riskLevel: SecurityRiskLevel;
  occurredAt: string;
};

export type SecuritySessionSummary = {
  id: string;
  userId: string;
  userName: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string | null;
  isTrustedDevice: boolean;
  isCurrent: boolean;
};

export type SecurityPermissionGrantSummary = {
  id: string;
  grantType: SecurityPermissionGrantType;
  permissions: string[];
  grantedToUserId: string;
  grantedToUserName: string | null;
  grantedByUserId: string | null;
  expiresAt: string | null;
  approved: boolean;
  createdAt: string;
};

export type SecurityAuditLogSummary = {
  id: string;
  category: SecurityAuditCategory;
  action: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  userName: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
};

export type SecurityRiskAlertSummary = {
  id: string;
  riskLevel: SecurityRiskLevel;
  subject: string;
  description: string;
  sourceCategory: SecurityAuditCategory | null;
  resolved: boolean;
  createdAt: string;
};

export type SecurityActionSummary = {
  id: string;
  actionType: SecurityActionType;
  status: SecurityActionStatus;
  subject: string;
  recommendation: string;
  payload: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: string;
};

export type SecurityPrivacyRequestSummary = {
  id: string;
  requestType: SecurityPrivacyRequestType;
  status: SecurityPrivacyRequestStatus;
  subject: string;
  notes: string | null;
  requestedByUserId: string | null;
  createdAt: string;
};

export type SecurityComplianceSummary = {
  popiaReady: boolean;
  gdprReady: boolean;
  consentTrackingEnabled: boolean;
  retentionPolicyConfigured: boolean;
  privacyRequestWorkflowEnabled: boolean;
  auditLoggingEnabled: boolean;
  encryptionAtRestEnabled: boolean;
  personalWorkspaceIsolated: boolean;
};

export type SecurityEncryptionSummary = {
  integrationCredentialsEncrypted: boolean;
  aiProviderCredentialsEncrypted: boolean;
  mfaSecretsEncrypted: boolean;
  refreshTokensHashed: boolean;
  apiKeysHashed: boolean;
  personalWorkspaceEncrypted: boolean;
};

export type SecurityScoreFactor = {
  label: string;
  impact: number;
  detail: string;
};

export type SecurityExecutiveDashboard = {
  summary: string;
  securityScore: number | null;
  securityScoreFactors: SecurityScoreFactor[];
  activeSessionCount: number;
  trustedDeviceCount: number;
  failedLoginCount24h: number;
  riskAlertCount: number;
  pendingActionCount: number;
  auditEventCount24h: number;
  mfaAdoptionPercent: number | null;
  compliance: SecurityComplianceSummary;
  encryption: SecurityEncryptionSummary;
  recentRiskAlerts: SecurityRiskAlertSummary[];
  recentAuditLogs: SecurityAuditLogSummary[];
};

export type SecurityAuraContext = {
  summary: string;
  securityScore: number | null;
  activeSessionCount: number;
  riskAlertCount: number;
  pendingActionCount: number;
  failedLoginCount24h: number;
};

export type UpdateSecurityTenantPolicyRequest = Partial<SecurityTenantPolicySummary>;

export type SetupSecurityMfaRequest = {
  verificationCode: string;
};

export type CreateSecurityPermissionGrantRequest = {
  grantType: SecurityPermissionGrantType;
  permissions: string[];
  grantedToUserId: string;
  expiresAt?: string;
  requiresApproval?: boolean;
};

export type CreateSecurityActionRequest = {
  actionType: SecurityActionType;
  subject: string;
  recommendation: string;
  payload?: Record<string, unknown>;
};

export type CreateSecurityPrivacyRequest = {
  requestType: SecurityPrivacyRequestType;
  subject: string;
  notes?: string;
};

export type RegisterTrustedDeviceRequest = {
  deviceLabel: string;
  deviceFingerprint: string;
};

export type RecordSecurityAuditRequest = {
  category: SecurityAuditCategory;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};
