import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Button,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  Panel,
  StatCard,
  TabNav,
} from '@titan/ui';
import { useAuth } from '../../lib/auth-context';
import { buildQueryKey, invalidateQueryCachePrefix } from '../../lib/query-cache';
import { useCachedQuery } from '../../lib/use-cached-query';
import {
  EnterpriseSecurityApiClientError,
  createPrivacyRequest,
  createSecurityAction,
  fetchActiveSessions,
  fetchAuditLogs,
  fetchPrivacyRequests,
  fetchRiskAlerts,
  fetchSecurityActions,
  fetchSecurityDashboard,
  fetchSecurityPolicy,
  fetchTrustedDevices,
  resolveRiskAlert,
  revokeSession,
  revokeAllOtherSessions,
  updateSecurityPolicy,
} from '../../lib/enterprise-security-api-client';

type SecurityTab =
  'dashboard' | 'audit' | 'sessions' | 'devices' | 'alerts' | 'actions' | 'privacy' | 'policy';

function canAccess(permissions: string[]) {
  return (
    permissions.includes('security:read') ||
    permissions.includes('security:write') ||
    permissions.includes('settings:manage') ||
    permissions.includes('agents:read') ||
    permissions.includes('*')
  );
}

function canWrite(permissions: string[]) {
  return (
    permissions.includes('security:write') ||
    permissions.includes('settings:manage') ||
    permissions.includes('*')
  );
}

export function EnterpriseSecurityPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<SecurityTab>('dashboard');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionSubject, setActionSubject] = useState('');
  const [actionRecommendation, setActionRecommendation] = useState('');
  const [privacySubject, setPrivacySubject] = useState('');
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [isRevoking, setIsRevoking] = useState(false);

  const canView = useMemo(() => (user ? canAccess(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canWrite(user.permissions) : false), [user]);

  const dashboardQuery = useCachedQuery({
    queryKey: 'security/dashboard',
    accessToken,
    enabled: canView,
    staleTimeMs: 60_000,
    fetcher: async () => fetchSecurityDashboard(accessToken!),
  });

  const auditQuery = useCachedQuery({
    queryKey: 'security/audit-logs',
    accessToken,
    enabled: canView && activeTab === 'audit',
    staleTimeMs: 60_000,
    fetcher: async () => fetchAuditLogs(accessToken!),
  });

  const sessionsQuery = useCachedQuery({
    queryKey: 'security/sessions',
    accessToken,
    enabled: canView && activeTab === 'sessions',
    staleTimeMs: 30_000,
    fetcher: async () => fetchActiveSessions(accessToken!),
  });

  const devicesQuery = useCachedQuery({
    queryKey: 'security/trusted-devices',
    accessToken,
    enabled: canView && activeTab === 'devices',
    staleTimeMs: 60_000,
    fetcher: async () => fetchTrustedDevices(accessToken!),
  });

  const alertsQuery = useCachedQuery({
    queryKey: 'security/risk-alerts',
    accessToken,
    enabled: canView && activeTab === 'alerts',
    staleTimeMs: 30_000,
    fetcher: async () => fetchRiskAlerts(accessToken!),
  });

  const actionsQuery = useCachedQuery({
    queryKey: 'security/actions',
    accessToken,
    enabled: canView && activeTab === 'actions',
    staleTimeMs: 60_000,
    fetcher: async () => fetchSecurityActions(accessToken!),
  });

  const privacyQuery = useCachedQuery({
    queryKey: 'security/privacy-requests',
    accessToken,
    enabled: canView && activeTab === 'privacy',
    staleTimeMs: 60_000,
    fetcher: async () => fetchPrivacyRequests(accessToken!),
  });

  const policyQuery = useCachedQuery({
    queryKey: 'security/policy',
    accessToken,
    enabled: canView && activeTab === 'policy',
    staleTimeMs: 60_000,
    fetcher: async () => fetchSecurityPolicy(accessToken!),
  });

  const dashboard = dashboardQuery.data ?? null;
  const auditLogs = auditQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const trustedDevices = devicesQuery.data ?? [];
  const riskAlerts = alertsQuery.data ?? [];
  const actions = actionsQuery.data ?? [];
  const privacyRequests = privacyQuery.data ?? [];
  const [mfaRequired, setMfaRequired] = useState(false);

  useEffect(() => {
    if (policyQuery.data) {
      setMfaRequired(policyQuery.data.mfaRequired);
    }
  }, [policyQuery.data]);

  useEffect(() => {
    const loadError =
      dashboardQuery.error ??
      auditQuery.error ??
      sessionsQuery.error ??
      devicesQuery.error ??
      alertsQuery.error ??
      actionsQuery.error ??
      privacyQuery.error ??
      policyQuery.error;
    if (loadError) {
      setError(loadError);
    }
  }, [
    dashboardQuery.error,
    auditQuery.error,
    sessionsQuery.error,
    devicesQuery.error,
    alertsQuery.error,
    actionsQuery.error,
    privacyQuery.error,
    policyQuery.error,
  ]);

  async function loadPage() {
    if (!accessToken) return;
    invalidateQueryCachePrefix(buildQueryKey(accessToken, 'security/'));
    await Promise.all([
      dashboardQuery.refetch(),
      activeTab === 'audit' ? auditQuery.refetch() : Promise.resolve(),
      activeTab === 'sessions' ? sessionsQuery.refetch() : Promise.resolve(),
      activeTab === 'devices' ? devicesQuery.refetch() : Promise.resolve(),
      activeTab === 'alerts' ? alertsQuery.refetch() : Promise.resolve(),
      activeTab === 'actions' ? actionsQuery.refetch() : Promise.resolve(),
      activeTab === 'privacy' ? privacyQuery.refetch() : Promise.resolve(),
      activeTab === 'policy' ? policyQuery.refetch() : Promise.resolve(),
    ]);
  }

  async function handleCreateAction(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManage || !actionSubject.trim() || !actionRecommendation.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      await createSecurityAction(accessToken, {
        actionType: 'security_action',
        subject: actionSubject.trim(),
        recommendation: actionRecommendation.trim(),
      });
      setActionSubject('');
      setActionRecommendation('');
      setSuccess('Security action drafted for approval.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof EnterpriseSecurityApiClientError
          ? err.message
          : 'Unable to create security action',
      );
    }
  }

  async function handleCreatePrivacyRequest(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManage || !privacySubject.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      await createPrivacyRequest(accessToken, {
        requestType: 'data_export',
        subject: privacySubject.trim(),
      });
      setPrivacySubject('');
      setSuccess('Privacy request submitted.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof EnterpriseSecurityApiClientError
          ? err.message
          : 'Unable to create privacy request',
      );
    }
  }

  async function handleSavePolicy() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await updateSecurityPolicy(accessToken, { mfaRequired });
      setSuccess('Security policy updated.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof EnterpriseSecurityApiClientError
          ? err.message
          : 'Unable to update security policy',
      );
    }
  }

  if (!canView) {
    return (
      <div className="page-shell">
        <PageHeader
          title="Security"
          description="Enterprise security, zero-trust, and compliance platform."
        />
        <EmptyState
          title="Access denied"
          description="You do not have permission to view the security platform."
        />
      </div>
    );
  }

  const tabs: Array<{ id: SecurityTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'audit', label: 'Audit Logs' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'devices', label: 'Trusted Devices' },
    { id: 'alerts', label: 'Risk Alerts' },
    { id: 'actions', label: 'Actions' },
    { id: 'privacy', label: 'Privacy' },
    { id: 'policy', label: 'Policy' },
  ];

  return (
    <div className="page-shell">
      <PageHeader
        title="Security"
        description="Zero-trust controls, audit logging, compliance readiness, and security recommendations."
      />

      {error ? <Panel title="Error">{error}</Panel> : null}
      {success ? <Panel title="Success">{success}</Panel> : null}

      <TabNav
        tabs={tabs}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as SecurityTab)}
        ariaLabel="Security sections"
      />

      {activeTab === 'dashboard' ? (
        dashboardQuery.isLoading ? (
          <LoadingState label="Loading security dashboard…" />
        ) : dashboard ? (
        <div className="stack gap-lg">
          <div className="stat-grid">
            <StatCard
              label="Security Score"
              value={
                dashboard.securityScore != null ? String(dashboard.securityScore) : 'Not assessed'
              }
            />
            <StatCard label="Active Sessions" value={String(dashboard.activeSessionCount)} />
            <StatCard label="Risk Alerts" value={String(dashboard.riskAlertCount)} />
            <StatCard label="Failed Logins (24h)" value={String(dashboard.failedLoginCount24h)} />
            <StatCard label="Audit Events (24h)" value={String(dashboard.auditEventCount24h)} />
            <StatCard
              label="MFA Adoption"
              value={
                dashboard.mfaAdoptionPercent != null
                  ? `${dashboard.mfaAdoptionPercent}%`
                  : 'Not assessed'
              }
            />
          </div>
          <Panel title="Score calculation">
            {dashboard.securityScore == null ? (
              <p className="page-muted">
                Not assessed — insufficient security evidence to calculate a score.
              </p>
            ) : (
              <ul className="simple-list">
                {dashboard.securityScoreFactors.map((factor) => (
                  <li key={factor.label}>
                    <strong>{factor.label}</strong> ({factor.impact >= 0 ? '+' : ''}
                    {factor.impact}) — {factor.detail}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Compliance & Encryption">
            <p>{dashboard.summary}</p>
            <ul>
              <li>POPIA ready: {dashboard.compliance.popiaReady ? 'Yes' : 'No'}</li>
              <li>GDPR ready: {dashboard.compliance.gdprReady ? 'Yes' : 'No'}</li>
              <li>
                Audit logging: {dashboard.compliance.auditLoggingEnabled ? 'Enabled' : 'Disabled'}
              </li>
              <li>
                Personal workspace isolated:{' '}
                {dashboard.compliance.personalWorkspaceIsolated ? 'Yes' : 'No'}
              </li>
              <li>
                Integration credentials encrypted:{' '}
                {dashboard.encryption.integrationCredentialsEncrypted ? 'Yes' : 'No'}
              </li>
              <li>
                AI provider credentials encrypted:{' '}
                {dashboard.encryption.aiProviderCredentialsEncrypted ? 'Yes' : 'No'}
              </li>
            </ul>
          </Panel>
        </div>
        ) : (
          <EmptyState title="No dashboard data" description="Security dashboard is unavailable." />
        )
      ) : activeTab === 'audit' ? (
        auditQuery.isLoading ? (
          <LoadingState label="Loading audit logs…" />
        ) : (
        <Panel title="Audit Logs">
          {auditLogs.length === 0 ? (
            <EmptyState
              title="No audit events yet"
              description="Audit logs appear from real tenant activity only."
            />
          ) : (
            <ul>
              {auditLogs.map((row) => (
                <li key={row.id}>
                  [{row.category}] {row.action} — {row.userName ?? 'System'} —{' '}
                  {new Date(row.occurredAt).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        )
      ) : activeTab === 'sessions' ? (
        sessionsQuery.isLoading ? (
          <LoadingState label="Loading active sessions…" />
        ) : (
        <Panel title="Active Sessions">
          <p className="page-muted">
            Count includes only non-revoked, non-expired sessions. Test and audit logins may
            accumulate over time.
          </p>
          {canManage ? (
            <div className="page-header-actions">
              <Button
                variant="secondary"
                disabled={isRevoking || selectedSessionIds.length === 0}
                onClick={() => {
                  if (
                    !accessToken ||
                    !window.confirm(`Revoke ${selectedSessionIds.length} selected session(s)?`)
                  ) {
                    return;
                  }
                  setIsRevoking(true);
                  void (async () => {
                    try {
                      for (const sessionId of selectedSessionIds) {
                        await revokeSession(accessToken, sessionId);
                      }
                      setSelectedSessionIds([]);
                      setSuccess('Selected sessions revoked.');
                      await loadPage();
                    } catch (err) {
                      setError(
                        err instanceof EnterpriseSecurityApiClientError
                          ? err.message
                          : 'Unable to revoke selected sessions',
                      );
                    } finally {
                      setIsRevoking(false);
                    }
                  })();
                }}
              >
                Revoke selected
              </Button>
              <Button
                variant="secondary"
                disabled={isRevoking}
                onClick={() => {
                  if (
                    !accessToken ||
                    !window.confirm('Revoke all other sessions for this tenant?')
                  ) {
                    return;
                  }
                  setIsRevoking(true);
                  void (async () => {
                    try {
                      const count = await revokeAllOtherSessions(accessToken);
                      setSuccess(`${count} other session(s) revoked.`);
                      await loadPage();
                    } catch (err) {
                      setError(
                        err instanceof EnterpriseSecurityApiClientError
                          ? err.message
                          : 'Unable to revoke other sessions',
                      );
                    } finally {
                      setIsRevoking(false);
                    }
                  })();
                }}
              >
                Revoke all other sessions
              </Button>
            </div>
          ) : null}
          {sessions.length === 0 ? (
            <EmptyState
              title="No active sessions"
              description="Sessions appear when users authenticate."
            />
          ) : (
            <div className="integrations-table-wrap">
              <table className="integrations-table">
                <thead>
                  <tr>
                    {canManage ? <th scope="col">Select</th> : null}
                    <th scope="col">User</th>
                    <th scope="col">Device / browser</th>
                    <th scope="col">IP address</th>
                    <th scope="col">Created</th>
                    <th scope="col">Expires</th>
                    <th scope="col">Status</th>
                    {canManage ? <th scope="col">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((row) => (
                    <tr key={row.id}>
                      {canManage ? (
                        <td>
                          {!row.isCurrent ? (
                            <input
                              type="checkbox"
                              checked={selectedSessionIds.includes(row.id)}
                              onChange={(event) => {
                                setSelectedSessionIds((current) =>
                                  event.target.checked
                                    ? [...current, row.id]
                                    : current.filter((id) => id !== row.id),
                                );
                              }}
                              aria-label={`Select session for ${row.userName}`}
                            />
                          ) : null}
                        </td>
                      ) : null}
                      <td>{row.userName}</td>
                      <td className="page-muted">{row.userAgent ?? 'Unknown device'}</td>
                      <td>{row.ipAddress ?? 'Unknown'}</td>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td>{new Date(row.expiresAt).toLocaleString()}</td>
                      <td>{row.isCurrent ? 'Current session' : 'Active'}</td>
                      {canManage && !row.isCurrent ? (
                        <td>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={isRevoking}
                            onClick={() => {
                              if (!accessToken || !window.confirm('Revoke this session?')) return;
                              void (async () => {
                                setIsRevoking(true);
                                try {
                                  await revokeSession(accessToken, row.id);
                                  setSuccess('Session revoked.');
                                  await loadPage();
                                } catch (err) {
                                  setError(
                                    err instanceof EnterpriseSecurityApiClientError
                                      ? err.message
                                      : 'Unable to revoke session',
                                  );
                                } finally {
                                  setIsRevoking(false);
                                }
                              })();
                            }}
                          >
                            Revoke
                          </Button>
                        </td>
                      ) : canManage ? (
                        <td>—</td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        )
      ) : activeTab === 'devices' ? (
        devicesQuery.isLoading ? (
          <LoadingState label="Loading trusted devices…" />
        ) : (
        <Panel title="Trusted Devices">
          {trustedDevices.length === 0 ? (
            <EmptyState
              title="No trusted devices"
              description="Register devices from authenticated clients."
            />
          ) : (
            <ul>
              {trustedDevices.map((row) => (
                <li key={row.id}>
                  {row.deviceLabel} — {row.approved ? 'Approved' : 'Pending approval'} — last seen{' '}
                  {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : 'never'}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        )
      ) : activeTab === 'alerts' ? (
        alertsQuery.isLoading ? (
          <LoadingState label="Loading risk alerts…" />
        ) : (
        <Panel title="Risk Alerts">
          {riskAlerts.length === 0 ? (
            <EmptyState
              title="No risk alerts"
              description="Alerts are created from real suspicious activity only."
            />
          ) : (
            <ul>
              {riskAlerts.map((row) => (
                <li key={row.id}>
                  [{row.riskLevel}] {row.subject} — {row.description}
                  {canManage && !row.resolved ? (
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        if (!accessToken) return;
                        await resolveRiskAlert(accessToken, row.id);
                        await loadPage();
                      }}
                    >
                      Resolve
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        )
      ) : activeTab === 'actions' ? (
        actionsQuery.isLoading ? (
          <LoadingState label="Loading security actions…" />
        ) : (
        <div className="stack gap-lg">
          <Panel title="Pending Security Actions">
            {actions.length === 0 ? (
              <EmptyState
                title="No security actions"
                description="Draft recommendations follow approval workflow."
              />
            ) : (
              <ul>
                {actions.map((row) => (
                  <li key={row.id}>
                    [{row.status}] {row.subject} — {row.recommendation}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {canManage ? (
            <Panel title="Draft Security Action">
              <form className="stack gap-md" onSubmit={handleCreateAction}>
                <Input
                  value={actionSubject}
                  onChange={(event) => setActionSubject(event.target.value)}
                  placeholder="Subject"
                />
                <Input
                  value={actionRecommendation}
                  onChange={(event) => setActionRecommendation(event.target.value)}
                  placeholder="Recommendation"
                />
                <Button type="submit">Draft for approval</Button>
              </form>
            </Panel>
          ) : null}
        </div>
        )
      ) : activeTab === 'privacy' ? (
        privacyQuery.isLoading ? (
          <LoadingState label="Loading privacy requests…" />
        ) : (
        <div className="stack gap-lg">
          <Panel title="Privacy Requests">
            {privacyRequests.length === 0 ? (
              <EmptyState
                title="No privacy requests"
                description="POPIA/GDPR export and deletion workflows start here."
              />
            ) : (
              <ul>
                {privacyRequests.map((row) => (
                  <li key={row.id}>
                    [{row.status}] {row.requestType} — {row.subject}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {canManage ? (
            <Panel title="Submit Privacy Request">
              <form className="stack gap-md" onSubmit={handleCreatePrivacyRequest}>
                <Input
                  value={privacySubject}
                  onChange={(event) => setPrivacySubject(event.target.value)}
                  placeholder="Subject"
                />
                <Button type="submit">Submit data export request</Button>
              </form>
            </Panel>
          ) : null}
        </div>
        )
      ) : policyQuery.isLoading ? (
        <LoadingState label="Loading security policy…" />
      ) : (
        <Panel title="Tenant Security Policy">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={mfaRequired}
              disabled={!canManage}
              onChange={(event) => setMfaRequired(event.target.checked)}
            />
            Require MFA for all users
          </label>
          {canManage ? <Button onClick={handleSavePolicy}>Save policy</Button> : null}
        </Panel>
      )}
    </div>
  );
}
