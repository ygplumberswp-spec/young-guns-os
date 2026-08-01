import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { EnterpriseNotificationsDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  acknowledgeAlert,
  captureNotificationsAnalytics,
  createNotificationRule,
  createNotificationTemplate,
  fetchNotificationsAuditLogs,
  fetchNotificationsDashboard,
  markAllNotificationsRead,
  resolveAlert,
  syncPlatformAlerts,
} from '../../lib/enterprise-notifications-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessNotifications,
  canAdministerNotifications,
  canManageNotifications,
  formatAlertLevel,
  formatChannel,
  formatDeliveryStatus,
  formatModuleSource,
  formatSeverity,
} from '../../features/notifications/utils';

type NotificationsTab =
  | 'inbox'
  | 'alerts'
  | 'escalations'
  | 'templates'
  | 'delivery'
  | 'rules'
  | 'preferences'
  | 'analytics'
  | 'audit'
  | 'settings'
  | 'assistant';

export function NotificationsPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<NotificationsTab>('inbox');
  const [dashboard, setDashboard] = useState<EnterpriseNotificationsDashboard | null>(null);
  const [auditLogs, setAuditLogs] = useState<
    Awaited<ReturnType<typeof fetchNotificationsAuditLogs>>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupplementaryLoading, setIsSupplementaryLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    agentMessages,
    isSending,
    pendingTasks,
    sendAgentMessage,
    updateTask,
    error: assistantError,
  } = useAuraChat();

  const canView = useMemo(() => (user ? canAccessNotifications(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageNotifications(user.permissions) : false), [user]);
  const canManage = useMemo(
    () => (user ? canAdministerNotifications(user.permissions) : false),
    [user],
  );

  const tabs: Array<{ id: NotificationsTab; label: string }> = [
    { id: 'inbox', label: 'Inbox' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'escalations', label: 'Escalations' },
    { id: 'templates', label: 'Templates' },
    { id: 'delivery', label: 'Delivery' },
    { id: 'rules', label: 'Rules' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'audit', label: 'Audit' },
    { id: 'settings', label: 'Settings' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchNotificationsDashboard(accessToken);
    setDashboard(data);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        await loadDashboard();
        if (!cancelled) setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load notifications dashboard',
          );
          setIsLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  useEffect(() => {
    if (!accessToken || !canView || isLoading || activeTab !== 'audit') return;
    let cancelled = false;
    async function loadTabData() {
      setIsSupplementaryLoading(true);
      try {
        const logs = await fetchNotificationsAuditLogs(accessToken!);
        if (!cancelled) setAuditLogs(logs);
      } catch {
        if (!cancelled) setAuditLogs([]);
      } finally {
        if (!cancelled) setIsSupplementaryLoading(false);
      }
    }
    void loadTabData();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, activeTab, isLoading]);

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    if (!accessToken || !canWrite) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await loadDashboard();
      setSuccess(successMessage);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setIsWorking(false);
    }
  }

  if (!canView) {
    return (
      <div className="p-6">
        <EmptyState
          title="Access denied"
          description="You do not have permission to view the notification center."
        />
      </div>
    );
  }

  if (isLoading || !dashboard) {
    return (
      <div className="p-6">
        <PageHeader title="Notification Center" description="Loading notification platform..." />
      </div>
    );
  }

  const health = dashboard.notificationHealth;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Notification Center"
        description="Unified notification platform — inbox, alerts, escalations, delivery tracking, and rules."
        actions={
          canWrite ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(() => syncPlatformAlerts(accessToken!), 'Platform alerts synced.')
                }
              >
                Sync Alerts
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => captureNotificationsAnalytics(accessToken!),
                    'Analytics captured.',
                  )
                }
              >
                Capture Analytics
              </Button>
            </div>
          ) : null
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'inbox' ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Inbox Items" value={String(dashboard.inboxItems.length)} />
            <StatCard
              label="Unread"
              value={String(dashboard.inboxItems.filter((i) => !i.isRead).length)}
            />
            <StatCard
              label="Pinned"
              value={String(dashboard.inboxItems.filter((i) => i.isPinned).length)}
            />
            <StatCard
              label="Archived"
              value={String(dashboard.inboxItems.filter((i) => i.isArchived).length)}
            />
          </div>
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() =>
                void runAction(
                  () => markAllNotificationsRead(accessToken!),
                  'All notifications marked read.',
                )
              }
            >
              Mark All Read
            </Button>
          ) : null}
          <Panel title="Inbox">
            {dashboard.inboxItems.length === 0 ? (
              <EmptyState
                title="No notifications"
                description="Your inbox is empty. Notifications appear here when modules dispatch legitimate events."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.inboxItems.map((item) => (
                  <li key={item.id} className="py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p
                          className={`font-medium ${item.isRead ? 'text-slate-600' : 'text-slate-900'}`}
                        >
                          {item.title}
                        </p>
                        <p className="text-sm text-slate-500">{item.body}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {formatModuleSource(item.notificationType)} ·{' '}
                          {new Date(item.createdAt).toLocaleString()}
                          {item.isPinned ? ' · Pinned' : ''}
                          {item.isArchived ? ' · Archived' : ''}
                        </p>
                      </div>
                      {!item.isRead ? (
                        <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white">
                          New
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'alerts' ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Active Alerts" value={String(health.activeAlertCount)} />
            <StatCard label="Critical" value={String(health.criticalAlertCount)} />
            <StatCard label="Platform Alerts" value={String(health.openPlatformAlertCount)} />
          </div>
          <Panel title="Alerts">
            {dashboard.alerts.length === 0 ? (
              <EmptyState
                title="No active alerts"
                description="Alerts appear when modules raise notification events."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.alerts.map((alert) => (
                  <li key={alert.id} className="flex items-start justify-between gap-4 py-3">
                    <div>
                      <p className="font-medium">{alert.title}</p>
                      <p className="text-sm text-slate-500">
                        {alert.description ?? 'No description'}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatAlertLevel(alert.alertLevel)} · {alert.status}
                        {alert.moduleSource ? ` · ${formatModuleSource(alert.moduleSource)}` : ''}
                      </p>
                    </div>
                    {canWrite && alert.status === 'open' ? (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isWorking}
                          onClick={() =>
                            void runAction(
                              () => acknowledgeAlert(accessToken!, alert.id),
                              'Alert acknowledged.',
                            )
                          }
                        >
                          Acknowledge
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isWorking}
                          onClick={() =>
                            void runAction(
                              () => resolveAlert(accessToken!, alert.id),
                              'Alert resolved.',
                            )
                          }
                        >
                          Resolve
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'escalations' ? (
        <Panel title="Escalations">
          {dashboard.escalations.length === 0 ? (
            <EmptyState
              title="No pending escalations"
              description="Escalations are created when alerts are not acknowledged within configured time limits."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {dashboard.escalations.map((esc) => (
                <li key={esc.id} className="py-3">
                  <p className="font-medium">
                    Step {esc.escalationStep} · {esc.status}
                  </p>
                  <p className="text-sm text-slate-500">
                    Escalate to {esc.escalateToType}: {esc.escalateToRef ?? 'default'} after{' '}
                    {esc.escalateAfterMinutes} min
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'templates' ? (
        <div className="space-y-4">
          {canManage ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() =>
                void runAction(
                  () =>
                    createNotificationTemplate(accessToken!, {
                      templateKey: `template_${Date.now()}`,
                      name: 'New Template',
                      subjectTemplate: '{{title}}',
                      bodyTemplate: '{{body}}',
                    }),
                  'Template created.',
                )
              }
            >
              Create Template
            </Button>
          ) : null}
          <Panel title="Templates">
            {dashboard.templates.length === 0 ? (
              <EmptyState
                title="No templates"
                description="Create reusable notification templates with variables and localization."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.templates.map((t) => (
                  <li key={t.id} className="py-3">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-sm text-slate-500">{t.subjectTemplate}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {t.templateKey} · {t.locale} · {t.isActive ? 'Active' : 'Inactive'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'delivery' ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Queued" value={String(health.queuedDeliveryCount)} />
            <StatCard label="Failed" value={String(health.failedDeliveryCount)} />
            <StatCard label="Total Jobs" value={String(dashboard.deliveryJobs.length)} />
          </div>
          <Panel title="Delivery Jobs">
            {dashboard.deliveryJobs.length === 0 ? (
              <EmptyState
                title="No delivery jobs"
                description="Delivery jobs are created when notifications are dispatched through configured channels."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.deliveryJobs.map((job) => (
                  <li key={job.id} className="py-3">
                    <p className="font-medium">{job.title}</p>
                    <p className="text-sm text-slate-500">
                      {formatDeliveryStatus(job.status)} · {formatChannel(job.channel)}
                    </p>
                    {job.errorMessage ? (
                      <p className="mt-1 text-xs text-red-600">{job.errorMessage}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'rules' ? (
        <div className="space-y-4">
          {canManage ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() =>
                void runAction(
                  () =>
                    createNotificationRule(accessToken!, {
                      name: 'Default in-app rule',
                      moduleSource: 'mission_control',
                      channels: ['in_app'],
                    }),
                  'Rule created.',
                )
              }
            >
              Create Rule
            </Button>
          ) : null}
          <Panel title="Notification Rules">
            {dashboard.rules.length === 0 ? (
              <EmptyState
                title="No rules configured"
                description="Configure rules by user, role, department, severity, module, and event type."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.rules.map((rule) => (
                  <li key={rule.id} className="py-3">
                    <p className="font-medium">{rule.name}</p>
                    <p className="text-sm text-slate-500">
                      {rule.scope} · {rule.deliveryMode} ·{' '}
                      {rule.channels.map(formatChannel).join(', ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'preferences' ? (
        <Panel title="User Preferences">
          {dashboard.userPreferences.length === 0 ? (
            <EmptyState
              title="No channel preferences"
              description="Configure delivery preferences per channel, module, and event type."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {dashboard.userPreferences.map((pref) => (
                <li key={pref.id} className="py-3">
                  <p className="font-medium">{formatChannel(pref.channel)}</p>
                  <p className="text-sm text-slate-500">
                    {pref.enabled ? 'Enabled' : 'Disabled'} · {pref.deliveryMode}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'analytics' ? (
        <Panel title="Analytics">
          {dashboard.analytics ? (
            <pre className="overflow-auto rounded bg-slate-50 p-4 text-xs">
              {JSON.stringify(dashboard.analytics.metrics, null, 2)}
            </pre>
          ) : (
            <EmptyState
              title="No analytics captured"
              description="Capture analytics to track notification platform health and delivery metrics."
            />
          )}
        </Panel>
      ) : null}

      {activeTab === 'audit' ? (
        <Panel title="Audit Log">
          {isSupplementaryLoading ? (
            <p className="text-sm text-slate-500">Loading audit logs...</p>
          ) : auditLogs.length === 0 ? (
            <EmptyState
              title="No audit entries"
              description="All notification platform actions are logged for auditability."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <li key={log.id} className="py-2 text-sm">
                  <span className="font-medium">{log.actionType}</span>
                  {log.entityType ? ` · ${log.entityType}` : ''}
                  <span className="text-slate-400">
                    {' '}
                    · {new Date(log.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'settings' ? (
        <Panel title="Platform Settings">
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-slate-500">Audit retention</dt>
              <dd className="font-medium">{dashboard.platformConfig.auditRetentionDays} days</dd>
            </div>
            <div>
              <dt className="text-slate-500">Health status</dt>
              <dd className="font-medium">
                {formatSeverity(dashboard.overallNotificationHealthStatus)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Default channels</dt>
              <dd className="font-medium">
                {Array.isArray(dashboard.platformConfig.deliveryPolicy.defaultChannels)
                  ? (dashboard.platformConfig.deliveryPolicy.defaultChannels as string[])
                      .map(formatChannel)
                      .join(', ')
                  : 'In App'}
              </dd>
            </div>
          </dl>
        </Panel>
      ) : null}

      {activeTab === 'assistant' ? (
        <Panel title="AURA Notification Intelligence">
          <AuraMessageList messages={agentMessages} isSending={isSending} />
          {pendingTasks.map((task) => (
            <AuraTaskApprovalCard
              key={task.id}
              task={task}
              accessToken={accessToken ?? ''}
              onUpdated={updateTask}
            />
          ))}
          <AuraComposer
            disabled={isSending}
            onSend={(content) =>
              void sendAgentMessage(
                content,
                'notification_intelligence' as import('@titan/shared').AgentKey,
              )
            }
          />
          {assistantError ? <p className="mt-2 text-sm text-red-600">{assistantError}</p> : null}
        </Panel>
      ) : null}
    </div>
  );
}
