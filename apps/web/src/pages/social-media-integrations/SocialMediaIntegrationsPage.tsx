import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import {
  formatSocialConnectionStatus,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  type SocialMediaDashboard,
  type SocialPlatform,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  checkSocialConnectionHealth,
  createSocialOutboundDraft,
  decideSocialOutboundDraft,
  disconnectSocialConnection,
  fetchSocialMediaDashboard,
  requestSocialOutboundPublish,
  requestSocialSync,
  SocialMediaIntegrationsApiClientError,
  upsertSocialConnection,
} from '../../lib/social-media-integrations-api-client';

type Tab = 'dashboard' | 'connections' | 'monitoring' | 'approvals' | 'activity';

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  return (
    permissions.includes('*') ||
    permissions.includes('marketing:read') ||
    permissions.includes('marketing:write') ||
    permissions.includes('marketing_intelligence:read') ||
    permissions.includes('marketing_intelligence:write') ||
    permissions.includes('marketing_intelligence:manage') ||
    permissions.includes('agents:read') ||
    permissions.includes('integrations:read')
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  return (
    permissions.includes('*') ||
    permissions.includes('marketing:write') ||
    permissions.includes('marketing_intelligence:write') ||
    permissions.includes('marketing_intelligence:manage')
  );
}

function canApprove(permissions: string[], roleName: string | undefined) {
  if (!canWrite(permissions, roleName)) return false;
  if (permissions.includes('*') || permissions.includes('marketing_intelligence:manage')) {
    return true;
  }
  return roleName === 'Company Owner' || roleName === 'Owner' || roleName === 'Platform Owner';
}

export function SocialMediaIntegrationsPage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<SocialMediaDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [displayName, setDisplayName] = useState('');
  const [externalAccountId, setExternalAccountId] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const [accessTokenValue, setAccessTokenValue] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [marketingDraftId, setMarketingDraftId] = useState('');

  const canView = useMemo(
    () => (user ? canAccess(user.permissions, user.roleName) : false),
    [user],
  );
  const canManage = useMemo(
    () => (user ? canWrite(user.permissions, user.roleName) : false),
    [user],
  );
  const canOwnerApprove = useMemo(
    () => (user ? canApprove(user.permissions, user.roleName) : false),
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    const data = await fetchSocialMediaDashboard(accessToken);
    setDashboard(data);
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        setError(null);
        await loadPage();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof SocialMediaIntegrationsApiClientError
              ? err.message
              : 'Unable to load Social Media Integrations',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  async function withAction(action: () => Promise<void>) {
    setError(null);
    setSuccess(null);
    try {
      await action();
      await loadPage();
    } catch (err) {
      setError(
        err instanceof SocialMediaIntegrationsApiClientError
          ? err.message
          : 'Social Media action failed',
      );
    }
  }

  async function handleSaveConnection(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManage) return;
    await withAction(async () => {
      await upsertSocialConnection(accessToken, {
        platform,
        displayName: displayName.trim() || undefined,
        externalAccountId: externalAccountId.trim() || undefined,
        pageOrProfileUrl: pageUrl.trim() || undefined,
        accessToken: accessTokenValue.trim() || undefined,
      });
      setAccessTokenValue('');
      setSuccess(
        'Connection settings saved. Credentials encrypt at rest when provided. Live OAuth is not verified in this foundation.',
      );
    });
  }

  async function handleDisconnect(p: SocialPlatform) {
    if (!accessToken || !canManage) return;
    await withAction(async () => {
      await disconnectSocialConnection(accessToken, p);
      setSuccess(`${SOCIAL_PLATFORM_LABELS[p]} disconnected. Encrypted credentials cleared.`);
    });
  }

  async function handleHealth(p: SocialPlatform) {
    if (!accessToken || !canManage) return;
    await withAction(async () => {
      const result = await checkSocialConnectionHealth(accessToken, p);
      setSuccess(result.message);
    });
  }

  async function handleSync(p: SocialPlatform) {
    if (!accessToken || !canManage) return;
    await withAction(async () => {
      const run = await requestSocialSync(accessToken, { platform: p });
      setSuccess(run.message);
    });
  }

  async function handleCreateDraft(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManage || !draftTitle.trim() || !draftBody.trim()) return;
    await withAction(async () => {
      await createSocialOutboundDraft(accessToken, {
        platform,
        outboundKind: 'publish_post',
        title: draftTitle.trim(),
        body: draftBody.trim(),
        marketingDraftId: marketingDraftId.trim() || undefined,
        submitForApproval: true,
      });
      setDraftTitle('');
      setDraftBody('');
      setMarketingDraftId('');
      setSuccess('Outbound draft queued for Owner approval — not published.');
    });
  }

  async function handleDecide(id: string, decision: 'approve' | 'reject') {
    if (!accessToken || !canOwnerApprove) return;
    await withAction(async () => {
      await decideSocialOutboundDraft(accessToken, id, { decision });
      setSuccess(
        decision === 'approve'
          ? 'Draft approved — execute remains gated. Nothing posted.'
          : 'Draft rejected.',
      );
    });
  }

  async function handlePublish(id: string) {
    if (!accessToken || !canOwnerApprove) return;
    await withAction(async () => {
      const result = await requestSocialOutboundPublish(accessToken, id);
      setSuccess(result.reason);
    });
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Social Media Integrations"
          description="Platform connections, monitoring, and Owner-gated publishing."
        />
        <EmptyState
          title="Access restricted"
          description="Requires marketing or marketing-intelligence access. Technician and Client roles are denied."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Social Media Integrations"
        description="Connect Facebook, Instagram, TikTok, LinkedIn, and Google Business Profile with honest status. Monitor real synced items only. Publish/reply only after Owner approval."
      />

      <Panel title="Canonical connection paths">
        <p className="page-muted">
          Facebook Page and Instagram Business account connections are managed on{' '}
          <Link href="/integrations" className="yg-link">
            Integrations → Social Connections
          </Link>
          . Facebook uses the Facebook Business workspace (
          <Link href="/facebook-business" className="yg-link">
            /facebook-business
          </Link>
          ) for Page OAuth and publishing. Manual token paste on this page does not replace Owner-approved OAuth on Integrations.
        </p>
      </Panel>

      <p className="text-sm text-slate-400">
        <Link href="/marketing-agent" className="yg-link">
          Marketing Agent
        </Link>
        {' · '}
        <Link href="/marketing" className="yg-link">
          Marketing
        </Link>
        {' · '}
        <Link href="/marketing-intelligence" className="yg-link">
          Marketing Intelligence
        </Link>
        {' · '}
        <Link href="/integrations" className="yg-link">
          Integrations
        </Link>
      </p>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['dashboard', 'Dashboard'],
            ['connections', 'Connections'],
            ['monitoring', `Monitoring (${dashboard?.monitoringCounts.total ?? 0})`],
            ['approvals', `Approvals (${dashboard?.approvalQueue.length ?? 0})`],
            ['activity', 'Activity'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === key
                ? 'yg-tab-active'
                : 'bg-zinc-900 text-slate-300 ring-1 ring-zinc-700 hover:bg-zinc-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-md border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-md border yg-info-banner px-3 py-2 text-sm">
          {success}
        </div>
      ) : null}

      {isLoading || !dashboard ? (
        <Panel title="Loading" className="bg-zinc-950/80 p-4 text-sm text-slate-400">Loading social media…</Panel>
      ) : (
        <>
          {tab === 'dashboard' ? (
            <div className="space-y-4">
              <Panel title="Summary" className="space-y-3 bg-zinc-950/80 p-4">
                <p className="text-sm text-slate-300">{dashboard.summary}</p>
                <p className="text-xs text-slate-500">{dashboard.runtimeHonesty.note}</p>
                <p className="text-xs text-slate-500">
                  Workflow: draft → Owner review → approved → execute (gated). Auto-publish and
                  auto-reply are off.
                </p>
              </Panel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Configured"
                  value={String(
                    dashboard.connections.filter((c) => c.status !== 'not_configured').length,
                  )}
                />
                <StatCard
                  label="With credentials"
                  value={String(dashboard.connections.filter((c) => c.hasCredentials).length)}
                />
                <StatCard label="Monitored items" value={String(dashboard.monitoringCounts.total)} />
                <StatCard label="Approval queue" value={String(dashboard.approvalQueue.length)} />
              </div>
              <Panel title="Marketing Agent" className="space-y-2 bg-zinc-950/80 p-4">
                <h3 className="text-sm font-medium yg-text-accent-soft">Marketing Agent link</h3>
                <p className="text-sm text-slate-400">{dashboard.marketingAgentLink.note}</p>
                <Link href={dashboard.marketingAgentLink.href} className="text-sm yg-link">
                  Open {dashboard.marketingAgentLink.label}
                </Link>
              </Panel>
            </div>
          ) : null}

          {tab === 'connections' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Connection settings" className="space-y-3 bg-zinc-950/80 p-4">
                  <h3 className="text-sm font-medium yg-text-accent-soft">Save connection settings</h3>
                  <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSaveConnection}>
                    <label className="space-y-1 text-sm text-slate-300">
                      <span>Platform</span>
                      <select
                        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value as SocialPlatform)}
                      >
                        {SOCIAL_PLATFORMS.map((p) => (
                          <option key={p} value={p}>
                            {SOCIAL_PLATFORM_LABELS[p]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input
                      label="Display name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Business Instagram"
                    />
                    <Input
                      label="External account ID"
                      value={externalAccountId}
                      onChange={(e) => setExternalAccountId(e.target.value)}
                      placeholder="Optional provider account id"
                    />
                    <Input
                      label="Page / profile URL"
                      value={pageUrl}
                      onChange={(e) => setPageUrl(e.target.value)}
                      placeholder="https://…"
                    />
                    <Input
                      label="Access token (encrypted at rest)"
                      type="password"
                      value={accessTokenValue}
                      onChange={(e) => setAccessTokenValue(e.target.value)}
                      placeholder="Optional — never shown after save"
                    />
                    <div className="flex items-end">
                      <Button type="submit">Save settings</Button>
                    </div>
                  </form>
                  <p className="text-xs text-slate-500">
                    Without a token, status stays Awaiting credentials. Connected never means live
                    OAuth verified in this foundation.
                  </p>
                </Panel>
              ) : null}

              <div className="grid gap-3 lg:grid-cols-2">
                {dashboard.connections.map((connection) => (
                  <Panel key={connection.platform} title={SOCIAL_PLATFORM_LABELS[connection.platform]} className="space-y-2 bg-zinc-950/80 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-medium text-slate-100">
                          {SOCIAL_PLATFORM_LABELS[connection.platform]}
                        </h3>
                        <p className="text-xs text-slate-500">{connection.displayName}</p>
                      </div>
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs yg-text-accent-soft">
                        {formatSocialConnectionStatus(connection.status)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Provider: {connection.provider.providerFamily} · OAuth app:{' '}
                      {connection.oauthAppConfigured ? 'env present' : 'not configured'} · Live
                      verified: no
                    </p>
                    <p className="text-xs text-slate-500">{connection.health.lastHealthMessage}</p>
                    {canManage ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button type="button" variant="secondary" onClick={() => handleHealth(connection.platform)}>
                          Health
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => handleSync(connection.platform)}>
                          Sync
                        </Button>
                        {connection.status !== 'not_configured' ? (
                          <Button type="button" variant="secondary" onClick={() => handleDisconnect(connection.platform)}>
                            Disconnect
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </Panel>
                ))}
              </div>
            </div>
          ) : null}

          {tab === 'monitoring' ? (
            <div className="space-y-4">
              <Panel title="Monitoring honesty" className="bg-zinc-950/80 p-4 text-sm text-slate-400">
                Comments, messages, mentions, reviews, and engagement events appear only when real
                provider data is ingested. Empty until live sync exists — metrics are not invented.
              </Panel>
              {dashboard.monitoredItems.length === 0 ? (
                <EmptyState
                  title="No monitored items"
                  description="Sync foundation is ready. Nothing ingested yet because live provider sync is not wired."
                />
              ) : (
                dashboard.monitoredItems.map((item) => (
                  <Panel key={item.id} title={`${SOCIAL_PLATFORM_LABELS[item.platform]} · ${item.itemKind}`} className="space-y-1 bg-zinc-950/80 p-4">
                    <p className="text-sm yg-text-accent-soft">
                      {SOCIAL_PLATFORM_LABELS[item.platform]} · {item.itemKind}
                    </p>
                    <p className="text-sm text-slate-200 whitespace-pre-wrap">{item.body}</p>
                    <p className="text-xs text-slate-500">
                      {item.authorName ?? 'Unknown author'} · engagement:{' '}
                      {item.engagementScore ?? 'unavailable'}
                    </p>
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'approvals' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Create outbound draft" className="space-y-3 bg-zinc-950/80 p-4">
                  <h3 className="text-sm font-medium yg-text-accent-soft">
                    Create outbound draft (publish workflow)
                  </h3>
                  <form className="grid gap-3" onSubmit={handleCreateDraft}>
                    <Input
                      label="Title"
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                    />
                    <label className="space-y-1 text-sm text-slate-300">
                      <span>Body</span>
                      <textarea
                        className="min-h-[100px] w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                      />
                    </label>
                    <Input
                      label="Marketing Agent draft ID (optional link)"
                      value={marketingDraftId}
                      onChange={(e) => setMarketingDraftId(e.target.value)}
                      placeholder="UUID from /marketing-agent"
                    />
                    <Button type="submit">Queue for Owner approval</Button>
                  </form>
                </Panel>
              ) : null}

              {dashboard.approvalQueue.length === 0 ? (
                <EmptyState
                  title="No drafts in approval queue"
                  description="Create a draft here or queue one from Marketing Agent. Nothing posts automatically."
                />
              ) : (
                dashboard.approvalQueue.map((draft) => (
                  <Panel key={draft.id} title={draft.title} className="space-y-2 bg-zinc-950/80 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-medium text-slate-100">{draft.title}</h3>
                      <span className="text-xs yg-text-accent-soft">{draft.status}</span>
                    </div>
                    <p className="text-sm text-slate-300 whitespace-pre-wrap">{draft.body}</p>
                    <p className="text-xs text-slate-500">
                      {SOCIAL_PLATFORM_LABELS[draft.platform]} · {draft.outboundKind}
                      {draft.marketingDraftId ? ` · marketing draft ${draft.marketingDraftId}` : ''}
                    </p>
                    {canOwnerApprove ? (
                      <div className="flex flex-wrap gap-2">
                        {draft.status === 'pending_approval' || draft.status === 'draft' ? (
                          <>
                            <Button type="button" onClick={() => handleDecide(draft.id, 'approve')}>
                              Approve
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => handleDecide(draft.id, 'reject')}
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}
                        {draft.status === 'approved' || draft.status === 'publish_gated' ? (
                          <Button type="button" onClick={() => handlePublish(draft.id)}>
                            Execute (gated)
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Owner approval required to decide/execute.</p>
                    )}
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'activity' ? (
            <div className="space-y-3">
              {dashboard.recentActivity.length === 0 ? (
                <EmptyState
                  title="No activity yet"
                  description="Connection, health, sync, and publish-gate events appear here with audit history."
                />
              ) : (
                dashboard.recentActivity.map((event) => (
                  <Panel key={event.id} title={event.eventType} className="bg-zinc-950/80 p-3 text-sm">
                    <p className="yg-text-accent-soft">
                      {event.eventType}
                      {event.platform ? ` · ${SOCIAL_PLATFORM_LABELS[event.platform]}` : ''}
                    </p>
                    <p className="text-slate-300">{event.message ?? '—'}</p>
                    <p className="text-xs text-slate-500">
                      {event.statusBefore ?? '—'} → {event.statusAfter ?? '—'} · {event.createdAt}
                    </p>
                  </Panel>
                ))
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
