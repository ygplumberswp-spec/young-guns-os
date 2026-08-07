import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import {
  canApproveFacebookContent,
  canManageFacebookConnection,
  canAccessFacebookBusiness,
  canWriteFacebookBusiness,
  FACEBOOK_CONTENT_STATUS_LABELS,
  FACEBOOK_PAGE_DISCOVERY_STATUS_LABELS,
  FACEBOOK_DIRECT_PAGE_LOOKUP_STATUS_LABELS,
  FACEBOOK_BUSINESS_PORTFOLIO_STATUS_LABELS,
  FACEBOOK_BUSINESS_PORTFOLIO_OAUTH_EXPLANATION,
  FACEBOOK_PAGE_READ_OAUTH_EXPLANATION,
  FACEBOOK_CONTENT_FEATURES_OAUTH_EXPLANATION,
  FACEBOOK_RECONNECT_WIZARD_OAUTH_EXPLANATION,
  FACEBOOK_SYNC_INACTIVE_UNTIL_READ_PERMISSION,
  hasFacebookPageReadEngagement,
  maskFacebookPageId,
  resolveFacebookFeatureMetricAvailability,
  formatFacebookScheduleForOwner,
  YOUNG_GUNS_BRAND,
  type FacebookContentStatus,
  type FacebookPageDiscoveryStatusCode,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { FacebookConnectionActions } from '../../features/integrations/FacebookConnectionActions';
import {
  acknowledgeFacebookPrivacy,
  approveAndSendFacebookReply,
  cancelFacebookContent,
  checkFacebookConnection,
  checkFacebookWebhookStatus,
  convertFacebookCommentToLead,
  createFacebookContent,
  disconnectFacebook,
  draftFacebookCommentReply,
  FacebookBusinessApiClientError,
  fetchFacebookComments,
  fetchFacebookConnection,
  fetchFacebookContent,
  fetchFacebookInsights,
  fetchFacebookLeads,
  fetchFacebookNotifications,
  fetchFacebookPages,
  fetchFacebookSyncRuns,
  fetchFacebookWebhookStatus,
  publishFacebookContent,
  refreshFacebookInsights,
  rejectFacebookContent,
  resolveFacebookLeadDuplicate,
  runFacebookSync,
  selectFacebookPage,
  startFacebookOAuth,
  subscribeFacebookWebhooks,
  startFacebookBusinessPortfolioOAuth,
  startFacebookPageReadOAuth,
  startFacebookContentFeaturesOAuth,
  startFacebookReconnectWizardOAuth,
  transitionFacebookContent,
  type FacebookCommentView,
  type FacebookConnectionView,
  type FacebookContentView,
  type FacebookInsightsView,
  type FacebookLeadView,
  type FacebookNotificationView,
  type FacebookPagesDiscoveryResponse,
  type FacebookSyncRunView,
  type FacebookWebhookStatusView,
} from '../../lib/facebook-business-api-client';

type Tab = 'connection' | 'content' | 'comments' | 'leads' | 'insights' | 'activity';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'connection', label: 'Connection' },
  { id: 'content', label: 'Content & Approvals' },
  { id: 'comments', label: 'Comments' },
  { id: 'leads', label: 'Leads' },
  { id: 'insights', label: 'Performance' },
  { id: 'activity', label: 'Sync & Alerts' },
];

/** Only `connected` is styled as healthy; limited and other states read as a problem. */
function stateClass(state: FacebookConnectionView['state']): string {
  return state === 'connected' ? 'titan-panel--success' : 'titan-panel--warning';
}

/** Clears Meta OAuth return query params so post-selection effects do not reload discovery. */
function clearFacebookOAuthReturnParams() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('facebook') && !params.has('reason')) return;
  params.delete('facebook');
  params.delete('reason');
  params.delete('declined');
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', nextUrl);
}

export function FacebookBusinessPage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('connection');

  const [connection, setConnection] = useState<FacebookConnectionView | null>(null);
  const [pageDiscovery, setPageDiscovery] = useState<FacebookPagesDiscoveryResponse | null>(null);
  const [content, setContent] = useState<FacebookContentView[]>([]);
  const [comments, setComments] = useState<FacebookCommentView[]>([]);
  const [leads, setLeads] = useState<FacebookLeadView[]>([]);
  const [insights, setInsights] = useState<FacebookInsightsView | null>(null);
  const [syncRuns, setSyncRuns] = useState<FacebookSyncRunView[]>([]);
  const [notifications, setNotifications] = useState<FacebookNotificationView[]>([]);
  const [webhookStatus, setWebhookStatus] = useState<FacebookWebhookStatusView | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isSelectingPage, setIsSelectingPage] = useState(false);
  const [selectingPageId, setSelectingPageId] = useState<string | null>(null);
  const [pageSelectionError, setPageSelectionError] = useState<string | null>(null);
  const pagesLoadInFlight = useRef(false);
  const pageSelectInFlight = useRef(false);
  const oauthPagesAutoLoadDone = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftLink, setDraftLink] = useState('');
  const [draftSchedule, setDraftSchedule] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  /** Reply drafts saved this session, keyed by comment, awaiting approve-and-send. */
  const [pendingReplies, setPendingReplies] = useState<Record<string, { id: string; body: string }>>(
    {},
  );

  const identity = useMemo(
    () => ({ roleName: user?.roleName ?? '', permissions: user?.permissions ?? [] }),
    [user],
  );

  const canView = useMemo(() => (user ? canAccessFacebookBusiness(identity) : false), [user, identity]);
  const canWrite = useMemo(() => (user ? canWriteFacebookBusiness(identity) : false), [user, identity]);
  const canApprove = useMemo(
    () => (user ? canApproveFacebookContent(identity) : false),
    [user, identity],
  );
  const canManage = useMemo(
    () => (user ? canManageFacebookConnection(identity) : false),
    [user, identity],
  );

  const load = useCallback(async () => {
    if (!accessToken) return;
    const [nextConnection, nextContent, nextComments, nextLeads] = await Promise.all([
      fetchFacebookConnection(accessToken),
      fetchFacebookContent(accessToken),
      fetchFacebookComments(accessToken),
      fetchFacebookLeads(accessToken),
    ]);
    setConnection(nextConnection);
    setContent(nextContent);
    setComments(nextComments);
    setLeads(nextLeads);

    const [nextInsights, nextRuns, nextNotifications, nextWebhookStatus] = await Promise.all([
      fetchFacebookInsights(accessToken),
      fetchFacebookSyncRuns(accessToken),
      fetchFacebookNotifications(accessToken),
      fetchFacebookWebhookStatus(accessToken),
    ]);
    setInsights(nextInsights);
    setSyncRuns(nextRuns);
    setNotifications(nextNotifications);
    setWebhookStatus(nextWebhookStatus);
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        setError(null);
        await load();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof FacebookBusinessApiClientError
              ? err.message
              : 'Unable to load the Facebook Business workspace.',
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
  }, [accessToken, canView, load]);

  // Meta redirects back with ?facebook=select-page once authorisation succeeds.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('facebook');
    if (outcome === 'select-page') {
      setSuccess('Facebook authorisation completed. Select a Page returned by Meta to finish.');
      setTab('connection');
    } else if (outcome === 'reconnect-wizard') {
      setSuccess(
        'Facebook reconnect authorisation completed. Select the Page returned by Meta to finish rebinding.',
      );
      setTab('connection');
    } else if (outcome === 'page-read-granted') {
      clearFacebookOAuthReturnParams();
      setSuccess('Page read access granted. TITAN can now verify and read Page content from Meta.');
      setTab('connection');
    } else if (outcome === 'content-features-granted') {
      clearFacebookOAuthReturnParams();
      setSuccess(
        'Facebook content features enabled. Publishing, comment moderation, webhooks and insights are now available where Meta granted the permissions.',
      );
      setTab('connection');
    } else if (outcome === 'content-features-partial') {
      clearFacebookOAuthReturnParams();
      const declined = params.get('declined');
      setSuccess(
        declined
          ? `Facebook content authorisation completed. Meta declined: ${declined}. Your connected Page and working permissions were preserved.`
          : 'Facebook content authorisation completed with partial permissions. Your connected Page was preserved.',
      );
      setTab('connection');
    } else if (outcome === 'error') {
      const reason = params.get('reason');
      if (reason === 'PAGE_READ_PERMISSION_REQUIRED') {
        setError(
          'Page read access was not granted. Your selected Page and stored credentials were preserved.',
        );
      } else {
        setError(
          `Facebook authorisation did not complete (${reason ?? 'unknown reason'}). Nothing was connected.`,
        );
      }
    }
  }, []);

  async function withAction(run: () => Promise<void>) {
    setError(null);
    setSuccess(null);
    setIsBusy(true);
    try {
      await run();
      await load();
    } catch (err) {
      setError(
        err instanceof FacebookBusinessApiClientError ? err.message : 'That Facebook action failed.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReconnect() {
    if (!accessToken || !canManage) return;
    await withAction(async () => {
      const result = await startFacebookReconnectWizardOAuth(accessToken, '/facebook-business');
      window.location.assign(result.authorizationUrl);
    });
  }

  async function handleConnect() {
    if (!accessToken || !canManage) return;
    await withAction(async () => {
      const result = await startFacebookOAuth(accessToken, '/facebook-business');
      // Full navigation, not a popup: Meta blocks its OAuth dialog inside iframes.
      window.location.assign(result.authorizationUrl);
    });
  }

  async function handleLoadPages() {
    if (!accessToken || !canManage) return;
    if (pagesLoadInFlight.current) return;
    pagesLoadInFlight.current = true;
    setError(null);
    setSuccess(null);
    setIsLoadingPages(true);
    try {
      const discovery = await fetchFacebookPages(accessToken);
      setPageDiscovery(discovery);
      const verified = discovery.pendingPageCandidate;
      const verifiedSelectable =
        discovery.pages.some((page) => page.selectable && page.id === verified?.pageId) ||
        (discovery.directLookup?.selectable &&
          discovery.directLookup.candidatePageId === verified?.pageId);
      if (discovery.needsBusinessPortfolioAccess) {
        setError(
          'Meta requires Business Portfolio access before managed Pages can be listed. Grant Business Portfolio access to continue Page discovery.',
        );
      } else if (verifiedSelectable && verified) {
        setSuccess(
          `Verified Page found: ${verified.pageName} (ID ending ${maskFacebookPageId(verified.pageId)?.replace(/^···/, '') ?? 'unknown'}). Select it below to finish binding.`,
        );
      } else if (discovery.pages.some((page) => page.selectable)) {
        setSuccess('Selectable Pages loaded from Meta. Choose the Page you want to connect.');
      } else {
        setError(`${FACEBOOK_PAGE_DISCOVERY_STATUS_LABELS[discovery.status]}: ${discovery.detail}`);
      }
    } catch (err) {
      setError(
        err instanceof FacebookBusinessApiClientError
          ? err.message
          : 'Could not load Pages from Meta.',
      );
    } finally {
      setIsLoadingPages(false);
      pagesLoadInFlight.current = false;
    }
  }

  async function handleGrantPageRead() {
    if (!accessToken || !canManage) return;
    await withAction(async () => {
      const result = await startFacebookPageReadOAuth(accessToken, '/facebook-business');
      window.location.assign(result.authorizationUrl);
    });
  }

  async function handleEnableContentFeatures() {
    if (!accessToken || !canManage) return;
    await withAction(async () => {
      const result = await startFacebookContentFeaturesOAuth(accessToken, '/facebook-business');
      window.location.assign(result.authorizationUrl);
    });
  }

  async function handleGrantBusinessPortfolio() {
    if (!accessToken || !canManage) return;
    await withAction(async () => {
      const result = await startFacebookBusinessPortfolioOAuth(accessToken, '/facebook-business');
      window.location.assign(result.authorizationUrl);
    });
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('facebook');
    if (
      (outcome === 'select-page' || outcome === 'reconnect-wizard') &&
      accessToken &&
      canManage &&
      !pageDiscovery &&
      !pagesLoadInFlight.current &&
      !oauthPagesAutoLoadDone.current &&
      !connection?.pageId
    ) {
      oauthPagesAutoLoadDone.current = true;
      void handleLoadPages();
    }
  }, [accessToken, canManage, pageDiscovery, connection?.pageId]);

  async function handleSelectPage(pageId: string) {
    if (!accessToken || !canManage) {
      setPageSelectionError('You do not have permission to select a Facebook Page for this company.');
      return;
    }

    const normalizedPageId = pageId?.trim();
    if (!normalizedPageId) {
      setPageSelectionError(
        'The selected Page row is missing an id. Reload Pages from Meta and try again.',
      );
      return;
    }

    const discoverySessionToken = pageDiscovery?.discoverySessionToken ?? null;
    if (!discoverySessionToken) {
      setPageSelectionError('Page selection expired. Choose Page again.');
      return;
    }

    if (pageSelectInFlight.current) {
      setPageSelectionError('Page selection is already in progress. Please wait.');
      return;
    }

    pageSelectInFlight.current = true;
    setPageSelectionError(null);
    setError(null);
    setSuccess(null);
    setIsSelectingPage(true);
    setSelectingPageId(normalizedPageId);

    try {
      const next = await selectFacebookPage(accessToken, normalizedPageId, discoverySessionToken);
      clearFacebookOAuthReturnParams();
      oauthPagesAutoLoadDone.current = true;
      setConnection(next);
      setPageDiscovery(null);
      setPageSelectionError(null);
      if (next.state === 'connected_limited') {
        setSuccess(
          `${next.pageName ?? 'Young Guns Plumbing – Cape Town'} is connected with limited permissions. Grant Page read access when you are ready.`,
        );
      } else if (next.state === 'connected') {
        setSuccess(`Connected and verified against Facebook as "${next.pageName}".`);
      } else {
        setSuccess(`Page selected — ${next.stateLabel}. ${next.detail}`);
      }
      try {
        await load();
      } catch {
        // Selection succeeded; a secondary refresh failure must not hide success.
      }
    } catch (err) {
      setPageSelectionError(
        err instanceof FacebookBusinessApiClientError
          ? err.message
          : 'Could not select that Page. Your stored credentials were preserved.',
      );
    } finally {
      setIsSelectingPage(false);
      setSelectingPageId(null);
      pageSelectInFlight.current = false;
    }
  }

  async function handleCheck() {
    if (!accessToken) return;
    await withAction(async () => {
      const next = await checkFacebookConnection(accessToken);
      setSuccess(`Connection check complete — ${next.stateLabel}. ${next.detail}`);
    });
  }

  async function handleDisconnect() {
    if (!accessToken || !canManage) return;
    await withAction(async () => {
      await disconnectFacebook(accessToken);
      setPageDiscovery(null);
      setSuccess('Facebook disconnected. Stored credentials were cleared.');
    });
  }

  async function handleCreateDraft(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canWrite || !draftTitle.trim() || !draftBody.trim()) return;
    await withAction(async () => {
      await createFacebookContent(accessToken, {
        title: draftTitle.trim(),
        body: draftBody.trim(),
        contentType: draftLink.trim() ? 'link' : 'text',
        linkUrl: draftLink.trim() || null,
        scheduledFor: draftSchedule ? new Date(draftSchedule).toISOString() : null,
      });
      setDraftTitle('');
      setDraftBody('');
      setDraftLink('');
      setDraftSchedule('');
      setSuccess('Draft created. Nothing reaches Facebook until it is approved.');
    });
  }

  async function handleTransition(id: string, to: FacebookContentStatus) {
    if (!accessToken) return;
    await withAction(async () => {
      await transitionFacebookContent(accessToken, id, to);
      setSuccess(`Post moved to ${FACEBOOK_CONTENT_STATUS_LABELS[to]}.`);
    });
  }

  async function handleReject(id: string) {
    if (!accessToken || !canApprove) return;
    const notes = window.prompt('Why is this post being rejected?');
    if (!notes?.trim()) return;
    await withAction(async () => {
      await rejectFacebookContent(accessToken, id, notes.trim());
      setSuccess('Post rejected and returned to Draft.');
    });
  }

  async function handlePublish(item: FacebookContentView) {
    if (!accessToken || !canApprove) return;
    const confirmed = window.confirm(
      `Publish "${item.title}" to the ${connection?.pageName ?? 'connected'} Facebook Page now? This is visible to the public immediately.`,
    );
    if (!confirmed) return;
    await withAction(async () => {
      const published = await publishFacebookContent(accessToken, item.id);
      setSuccess(
        published.externalPostId
          ? `Published. Facebook confirmed post ${published.externalPostId}.`
          : 'Publish completed.',
      );
    });
  }

  async function handleCancel(id: string) {
    if (!accessToken || !canApprove) return;
    await withAction(async () => {
      await cancelFacebookContent(accessToken, id);
      setSuccess('Scheduled post cancelled.');
    });
  }

  async function handleAcknowledgePrivacy(id: string) {
    if (!accessToken || !canWrite) return;
    await withAction(async () => {
      await acknowledgeFacebookPrivacy(accessToken, id);
      setSuccess('Privacy confirmed for the attached media.');
    });
  }

  async function handleDraftReply(commentId: string) {
    if (!accessToken || !canWrite) return;
    const body = replyDrafts[commentId]?.trim();
    if (!body) return;
    await withAction(async () => {
      const draft = await draftFacebookCommentReply(accessToken, commentId, body);
      setReplyDrafts((current) => ({ ...current, [commentId]: '' }));
      setPendingReplies((current) => ({ ...current, [commentId]: { id: draft.id, body } }));
      setSuccess('Reply drafted for approval. Nothing was sent to Facebook.');
    });
  }

  async function handleSendReply(commentId: string) {
    const pending = pendingReplies[commentId];
    if (!accessToken || !canApprove || !pending) return;
    const confirmed = window.confirm(
      `Send this reply publicly on the Facebook Page?\n\n${pending.body}`,
    );
    if (!confirmed) return;
    await withAction(async () => {
      await approveAndSendFacebookReply(accessToken, pending.id);
      setPendingReplies((current) => {
        const next = { ...current };
        delete next[commentId];
        return next;
      });
      setSuccess('Reply approved and sent to Facebook.');
    });
  }

  async function handleConvertComment(commentId: string) {
    if (!accessToken) return;
    await withAction(async () => {
      await convertFacebookCommentToLead(accessToken, commentId);
      setSuccess('Comment converted into a lead.');
    });
  }

  async function handleResolveDuplicate(fbLeadId: string, decision: 'merge' | 'separate') {
    if (!accessToken) return;
    const lead = leads.find((entry) => entry.id === fbLeadId);
    let mergeIntoLeadId: string | undefined;
    if (decision === 'merge') {
      mergeIntoLeadId = window.prompt(`Merge into which existing lead id? ${lead?.duplicateReason ?? ''}`) ?? undefined;
      if (!mergeIntoLeadId) return;
    }
    await withAction(async () => {
      await resolveFacebookLeadDuplicate(accessToken, fbLeadId, decision, mergeIntoLeadId);
      setSuccess(
        decision === 'merge' ? 'Lead merged into the existing record.' : 'Kept as a separate lead.',
      );
    });
  }

  async function handleSync() {
    if (!accessToken) return;
    await withAction(async () => {
      const run = await runFacebookSync(accessToken);
      setSuccess(
        run.skippedCapabilities.length > 0
          ? `Synced ${run.commentsIngested} comment(s). Skipped for missing Meta permissions: ${run.skippedCapabilities.join(', ')}.`
          : `Synced ${run.commentsIngested} comment(s).`,
      );
    });
  }

  async function handleSubscribeWebhooks() {
    if (!accessToken) return;
    await withAction(async () => {
      const status = await subscribeFacebookWebhooks(accessToken);
      setWebhookStatus(status);
      setSuccess(
        status.state === 'subscribed'
          ? `Facebook webhooks subscribed for ${status.subscribedFields.join(', ')}.`
          : status.detail,
      );
    });
  }

  async function handleCheckWebhookStatus() {
    if (!accessToken) return;
    await withAction(async () => {
      const status = await checkFacebookWebhookStatus(accessToken);
      setWebhookStatus(status);
      setSuccess(`Webhook status: ${status.label}. ${status.detail}`);
    });
  }

  async function handleRefreshInsights() {
    if (!accessToken) return;
    await withAction(async () => {
      const result = await refreshFacebookInsights(accessToken);
      setSuccess(`Stored ${result.stored} insight value(s). ${result.coverage.note}`);
    });
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Facebook Business"
          description="Page connection, approval-gated publishing, comments, leads and performance."
        />
        <EmptyState
          title="Access restricted"
          description="Facebook Business requires marketing access. Technician and Client roles are denied."
        />
      </div>
    );
  }

  const awaitingApproval = content.filter((item) => item.status === 'in_review');
  const unanswered = comments.filter((item) => !item.answered);
  const newLeads = leads.filter((item) => item.stage === 'imported');
  const readPermissionGranted = hasFacebookPageReadEngagement(connection?.grantedPermissions ?? []);
  const newLeadsMetric = resolveFacebookFeatureMetricAvailability({
    grantedPermissions: connection?.grantedPermissions ?? [],
    requiredPermission: 'pages_read_engagement',
    numericValue: readPermissionGranted ? newLeads.length : null,
    label: 'New leads',
  });
  const unansweredCommentsMetric = resolveFacebookFeatureMetricAvailability({
    grantedPermissions: connection?.grantedPermissions ?? [],
    requiredPermission: 'pages_read_engagement',
    numericValue: readPermissionGranted ? unanswered.length : null,
    label: 'Unanswered comments',
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facebook Business"
        description={`Connect the ${YOUNG_GUNS_BRAND.businessName} Facebook Page, plan and approve posts, and work the enquiries they produce. Nothing is published or replied to without an explicit approval.`}
      />

      {error ? (
        <Panel title="Something went wrong" className="titan-panel--danger">
          {error}
        </Panel>
      ) : null}
      {success ? (
        <Panel title="Done" className="titan-panel--success">
          {success}
        </Panel>
      ) : null}
      {pageSelectionError ? (
        <Panel title="Page selection failed" className="titan-panel--danger">
          <p className="form-error" role="alert">
            {pageSelectionError}
          </p>
        </Panel>
      ) : null}

      {isLoading ? (
        <Panel title="Facebook Business">Loading the Facebook workspace…</Panel>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              label="Connection"
              value={connection?.stateLabel ?? 'Unknown'}
              hint={connection?.requiredAction ?? undefined}
            />
            <StatCard label="Awaiting approval" value={String(awaitingApproval.length)} />
            <StatCard label="New leads" value={newLeadsMetric.displayValue} />
            <StatCard label="Unanswered comments" value={unansweredCommentsMetric.displayValue} />
          </div>

          <nav className="flex flex-wrap gap-2">
            {TABS.map((entry) => (
              <Button
                key={entry.id}
                variant={tab === entry.id ? 'primary' : 'secondary'}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </Button>
            ))}
          </nav>

          {tab === 'connection' ? (
            <ConnectionTab
              connection={connection}
              pageDiscovery={pageDiscovery}
              canManage={canManage}
              isBusy={isBusy}
              isLoadingPages={isLoadingPages}
              isSelectingPage={isSelectingPage}
              selectingPageId={selectingPageId}
              pageSelectionError={pageSelectionError}
              onConnect={handleConnect}
              onLoadPages={handleLoadPages}
              onGrantBusinessPortfolio={handleGrantBusinessPortfolio}
              onGrantPageRead={handleGrantPageRead}
              onEnableContentFeatures={handleEnableContentFeatures}
              onSelectPage={handleSelectPage}
              onCheck={handleCheck}
              onDisconnect={handleDisconnect}
              onReconnect={handleReconnect}
            />
          ) : null}

          {tab === 'content' ? (
            <ContentTab
              content={content}
              connection={connection}
              canWrite={canWrite}
              canApprove={canApprove}
              isBusy={isBusy}
              draftTitle={draftTitle}
              draftBody={draftBody}
              draftLink={draftLink}
              draftSchedule={draftSchedule}
              onDraftTitle={setDraftTitle}
              onDraftBody={setDraftBody}
              onDraftLink={setDraftLink}
              onDraftSchedule={setDraftSchedule}
              onCreate={handleCreateDraft}
              onTransition={handleTransition}
              onReject={handleReject}
              onPublish={handlePublish}
              onCancel={handleCancel}
              onAcknowledgePrivacy={handleAcknowledgePrivacy}
            />
          ) : null}

          {tab === 'comments' ? (
            <CommentsTab
              comments={comments}
              connection={connection}
              canWrite={canWrite}
              canApprove={canApprove}
              isBusy={isBusy}
              replyDrafts={replyDrafts}
              pendingReplies={pendingReplies}
              onReplyDraftChange={(id, value) =>
                setReplyDrafts((current) => ({ ...current, [id]: value }))
              }
              onDraftReply={handleDraftReply}
              onSendReply={handleSendReply}
              onConvert={handleConvertComment}
            />
          ) : null}

          {tab === 'leads' ? (
            <LeadsTab leads={leads} isBusy={isBusy} onResolveDuplicate={handleResolveDuplicate} />
          ) : null}

          {tab === 'insights' ? (
            <InsightsTab
              insights={insights}
              connection={connection}
              isBusy={isBusy}
              onRefresh={handleRefreshInsights}
            />
          ) : null}

          {tab === 'activity' ? (
            <ActivityTab
              syncRuns={syncRuns}
              notifications={notifications}
              connection={connection}
              webhookStatus={webhookStatus}
              canManage={canManage}
              isBusy={isBusy}
              onSync={handleSync}
              onSubscribeWebhooks={handleSubscribeWebhooks}
              onCheckWebhookStatus={handleCheckWebhookStatus}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function pageDiscoveryRowSelectable(input: {
  pageId: string;
  selectable: boolean;
}): boolean {
  return input.selectable && Boolean(input.pageId.trim());
}

function UseThisPageButton({
  pageId,
  isLoadingPages,
  isSelectingPage,
  selectingPageId,
  onSelectPage,
}: {
  pageId: string;
  isLoadingPages: boolean;
  isSelectingPage: boolean;
  selectingPageId: string | null;
  onSelectPage: (pageId: string) => void;
}) {
  const isThisPageSelecting = isSelectingPage && selectingPageId === pageId;
  const selectionBlocked =
    isLoadingPages || (isSelectingPage && selectingPageId !== null && !isThisPageSelecting);

  return (
    <Button
      type="button"
      onClick={() => onSelectPage(pageId)}
      disabled={selectionBlocked || isThisPageSelecting}
    >
      {isThisPageSelecting ? 'Selecting Page…' : 'Use this Page'}
    </Button>
  );
}

function emptyPageDiscoveryMessage(status: FacebookPageDiscoveryStatusCode): string {
  switch (status) {
    case 'META_PAGE_LIST_EMPTY':
      return 'Meta returned no managed Pages for this token. TITAN will attempt direct Page lookup for the server-controlled Young Guns candidate when you load Pages.';
    case 'META_PAGE_LIST_FAILED':
      return 'Meta did not return a successful Page list. Retry after confirming Business Integrations access.';
    case 'META_PAGE_TOKEN_UNAVAILABLE':
      return 'Meta listed Pages but did not expose a usable Page access token for any of them.';
    case 'META_TOKEN_SCOPE_MISMATCH':
      return 'The stored token is missing pages_show_list, so Meta will not return managed Pages.';
    default:
      return 'No selectable Pages are available yet.';
  }
}

function formatDirectPageLookupDiagnosis(directLookup: NonNullable<FacebookPagesDiscoveryResponse['directLookup']>): string {
  return [
    `Graph version: ${directLookup.graphVersion}`,
    `Endpoint: ${directLookup.endpoint}`,
    `Identity probe fields: ${directLookup.identityProbeFields}`,
    `Token probe fields: ${directLookup.tokenProbeFields}`,
    `Identity probe HTTP status: ${directLookup.identityProbeHttpStatus}`,
    `Token probe HTTP status: ${directLookup.tokenProbeHttpStatus ?? 'skipped'}`,
    `HTTP status: ${directLookup.httpStatus}`,
    `Provider error code: ${directLookup.providerErrorCode ?? 'none'}`,
    `Provider error subcode: ${directLookup.providerErrorSubcode ?? 'none'}`,
    `Provider error type: ${directLookup.providerErrorType ?? 'none'}`,
    `Provider message classification: ${directLookup.providerMessageClassification ?? 'none'}`,
    `Has id: ${directLookup.hasId}`,
    `Has name: ${directLookup.hasName}`,
    `Name matches: ${directLookup.nameMatches}`,
    `ID matches: ${directLookup.idMatches}`,
    `Has access_token: ${directLookup.hasAccessToken}`,
    `Has tasks: ${directLookup.hasTasks}`,
    `Task count: ${directLookup.taskCount}`,
    `Candidate Page id: ${directLookup.candidatePageId}`,
    `Returned Page id: ${directLookup.returnedPageId ?? 'none'}`,
    `Returned Page name: ${directLookup.returnedPageName ?? 'none'}`,
  ].join('\n');
}

function formatBusinessPortfolioDiagnosis(
  discovery: NonNullable<FacebookPagesDiscoveryResponse['businessPortfolio']>,
): string {
  const d = discovery.diagnosis;
  return [
    `Graph version: ${d.graphVersion}`,
    `Portfolio list endpoint: ${d.portfolioListEndpoint}`,
    `Portfolio list fields: ${d.portfolioListFields}`,
    `Owned Pages fields: ${d.ownedPagesFields}`,
    `Client Pages fields: ${d.clientPagesFields}`,
    `HTTP status: ${d.httpStatus}`,
    `Provider error code: ${d.providerErrorCode ?? 'none'}`,
    `Provider error subcode: ${d.providerErrorSubcode ?? 'none'}`,
    `Provider error type: ${d.providerErrorType ?? 'none'}`,
    `Portfolio count: ${d.portfolioCount}`,
    `Raw Page count: ${d.rawPageCount}`,
    `Selectable Page count: ${d.selectablePageCount}`,
    `Granted scopes: ${d.grantedScopes.join(', ') || 'none'}`,
    `pages_show_list: ${d.hasPagesShowList}`,
    `business_management: ${d.hasBusinessManagement}`,
    `Verified Page id: ${d.verifiedPageId ?? 'none'}`,
    `Verified Page name: ${d.verifiedPageName ?? 'none'}`,
    `Verified Page found: ${d.verifiedPageFound}`,
    `Verified Page id matches: ${d.verifiedPageIdMatches}`,
    `Verified Page name matches: ${d.verifiedPageNameMatches}`,
  ].join('\n');
}

function formatPageDiscoveryDiagnosis(discovery: FacebookPagesDiscoveryResponse): string {
  const d = discovery.diagnosis;
  return [
    `Graph version: ${d.graphVersion}`,
    `Endpoint: ${d.endpoint}`,
    `Fields: ${d.fields}`,
    `HTTP status: ${d.httpStatus}`,
    `Provider error code: ${d.providerErrorCode ?? 'none'}`,
    `Raw rows: ${d.rawRowCount}`,
    `Retained rows: ${d.retainedRowCount}`,
    `Selectable rows: ${d.selectableRowCount}`,
    `Paging: ${d.hasPaging ? `yes (${d.pagingPageCount} page(s))` : 'no'}`,
    `Granted scopes: ${d.grantedScopes.join(', ') || 'none'}`,
    `pages_show_list: ${d.hasPagesShowList}`,
    `business_management: ${d.hasBusinessManagement}`,
    `App ID matches token: ${d.appIdMatches}`,
    `Token valid: ${d.tokenValid}`,
    `Token expired: ${d.tokenExpired}`,
    `Authenticated user present: ${d.authenticatedUserIdPresent}`,
    `Young Guns Page seen in raw response: ${d.youngGunsPageSeenInRawResponse}`,
    `Applied filters: ${d.appliedFilters.join('; ')}`,
  ].join('\n');
}

function ConnectionTab({
  connection,
  pageDiscovery,
  canManage,
  isBusy,
  isLoadingPages,
  isSelectingPage,
  selectingPageId,
  pageSelectionError,
  onConnect,
  onLoadPages,
  onGrantBusinessPortfolio,
  onGrantPageRead,
  onEnableContentFeatures,
  onSelectPage,
  onCheck,
  onDisconnect,
  onReconnect,
}: {
  connection: FacebookConnectionView | null;
  pageDiscovery: FacebookPagesDiscoveryResponse | null;
  canManage: boolean;
  isBusy: boolean;
  isLoadingPages: boolean;
  isSelectingPage: boolean;
  selectingPageId: string | null;
  pageSelectionError: string | null;
  onConnect: () => void;
  onLoadPages: () => void;
  onGrantBusinessPortfolio: () => void;
  onGrantPageRead: () => void;
  onEnableContentFeatures: () => void;
  onSelectPage: (pageId: string) => void;
  onCheck: () => void;
  onDisconnect: () => Promise<void>;
  onReconnect: () => void;
}) {
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const verifiedPageId = pageDiscovery?.pendingPageCandidate?.pageId ?? null;

  async function handleDisconnectConfirmed() {
    await onDisconnect();
    setConfirmDisconnect(false);
  }

  if (!connection) {
    return <Panel title="Connection">No connection information is available.</Panel>;
  }

  const needsConfiguration = connection.state === 'configuration_required';
  const isConnectedLimited = connection.state === 'connected_limited';
  const pageSelectionMismatch = Boolean(connection.pageIdentity);
  const needsBusinessPortfolioAccess =
    !isConnectedLimited &&
    !pageSelectionMismatch &&
    (pageDiscovery?.needsBusinessPortfolioAccess ??
      (connection.state === 'partial' &&
        connection.hasStoredCredentials &&
        !connection.grantedPermissions.includes('business_management')));
  const showPageDiscovery =
    Boolean(pageDiscovery) && (pageSelectionMismatch || !connection.pageId);

  return (
    <div className="space-y-4">
      <Panel
        title={connection.pageName ?? 'No Page connected'}
        className={stateClass(connection.state)}
      >
        <p>
          <strong>{connection.stateLabel}</strong> — {connection.detail}
        </p>
        {connection.requiredAction ? <p>Next step: {connection.requiredAction}</p> : null}
        {connection.pageId ? (
          <p className="page-muted">
            Connected Page ID ending{' '}
            {maskFacebookPageId(connection.pageId)?.replace(/^···/, '') ?? 'unknown'}
          </p>
        ) : null}
        {connection.pageIdentity ? (
          <dl className="facebook-page-identity-mismatch">
            <dt>Currently stored</dt>
            <dd>
              {connection.pageIdentity.storedPageName ?? 'Unknown Page'}
              {connection.pageIdentity.storedPageIdMasked
                ? ` · Page ID ending ${connection.pageIdentity.storedPageIdMasked.replace(/^···/, '')}`
                : null}
            </dd>
            <dt>Expected</dt>
            <dd>
              {connection.pageIdentity.expectedPageName ?? 'Verified Page'}
              {connection.pageIdentity.expectedPageIdMasked
                ? ` · Page ID ending ${connection.pageIdentity.expectedPageIdMasked.replace(/^···/, '')}`
                : null}
            </dd>
          </dl>
        ) : null}
        {connection.pageUrl ? (
          <p>
            <a href={connection.pageUrl} target="_blank" rel="noreferrer">
              Open the Page on Facebook
            </a>
          </p>
        ) : null}
        <dl>
          <dt>Last connection attempt</dt>
          <dd>{connection.lastConnectionAttemptAt ?? 'Never'}</dd>
          <dt>Last successful verification</dt>
          <dd>{connection.lastSuccessfulVerificationAt ?? 'Never'}</dd>
          <dt>Last failed verification</dt>
          <dd>{connection.lastFailedVerificationAt ?? 'None recorded'}</dd>
          <dt>Last sync</dt>
          <dd>{connection.lastSyncedAt ?? 'Never'}</dd>
          <dt>Webhooks</dt>
          <dd>
            {connection.state === 'connected_limited' ||
            connection.syncPolicy.pollingBackfillMinutes === 0 ? (
              FACEBOOK_SYNC_INACTIVE_UNTIL_READ_PERMISSION
            ) : (
              <>
                See Sync &amp; Alerts for webhook status. Polling fallback remains every{' '}
                {connection.syncPolicy.pollingBackfillMinutes} minutes.
              </>
            )}
          </dd>
        </dl>
      </Panel>

      {needsConfiguration ? (
        <Panel title="Meta app not configured" className="titan-panel--warning">
          <p>
            This TITAN host has no Meta app credentials, so Facebook cannot be contacted at all.
            Set <code>META_APP_ID</code> and <code>META_APP_SECRET</code> on the API host, then
            return here to authorise the Page.
          </p>
          <p>
            Redirect URI to register in the Meta app:{' '}
            <code>/api/v1/facebook-business/oauth/callback</code>
          </p>
        </Panel>
      ) : null}

      <Panel title="What Meta has granted">
        {connection.capabilities.length === 0 ? (
          <p>No permissions have been reported yet.</p>
        ) : (
          <ul>
            {connection.capabilities.map((capability) => (
              <li key={capability.capability}>
                <strong>{capability.label}:</strong>{' '}
                {capability.available ? 'Available' : capability.blockedReason}
              </li>
            ))}
          </ul>
        )}
        {connection.missingPermissions.length > 0 ? (
          <p>
            Meta has not granted: {connection.missingPermissions.join(', ')}. These usually require
            Meta App Review before they can be granted to a live app.
          </p>
        ) : null}
        <p>{connection.messenger.reason}</p>
      </Panel>

      <Panel title="Brand details used on posts">
        <p>
          {YOUNG_GUNS_BRAND.businessName} · {YOUNG_GUNS_BRAND.phone} · {YOUNG_GUNS_BRAND.email} ·{' '}
          {YOUNG_GUNS_BRAND.serviceArea}
        </p>
        <p>{YOUNG_GUNS_BRAND.logoNote}</p>
      </Panel>

      {canManage ? (
        <Panel title="Manage the connection">
          {pageSelectionMismatch || connection.state === 'reauthorisation_required' ? (
            <p className="page-muted">{FACEBOOK_RECONNECT_WIZARD_OAUTH_EXPLANATION}</p>
          ) : null}
          {pageDiscovery?.needsBusinessPortfolioAccess && !isConnectedLimited && !pageSelectionMismatch ? (
            <p className="page-muted">{FACEBOOK_BUSINESS_PORTFOLIO_OAUTH_EXPLANATION}</p>
          ) : null}
          {isConnectedLimited && !connection.grantedPermissions.includes('pages_read_engagement') ? (
            <p className="page-muted">
              {connection.pageReadOAuthExplanation ?? FACEBOOK_PAGE_READ_OAUTH_EXPLANATION}
            </p>
          ) : null}
          {connection.pageId &&
          connection.grantedPermissions.includes('pages_read_engagement') &&
          connection.missingPermissions.some((permission) =>
            [
              'pages_manage_posts',
              'pages_manage_engagement',
              'pages_manage_metadata',
              'read_insights',
              'pages_read_user_content',
            ].includes(permission),
          ) ? (
            <p className="page-muted">
              {connection.contentFeaturesOAuthExplanation ??
                FACEBOOK_CONTENT_FEATURES_OAUTH_EXPLANATION}
            </p>
          ) : null}
          <FacebookConnectionActions
            connectionState={connection.state}
            busy={isBusy || isLoadingPages}
            canManage={canManage}
            needsConfiguration={needsConfiguration}
            needsBusinessPortfolioAccess={needsBusinessPortfolioAccess}
            pageSelectionMismatch={pageSelectionMismatch}
            pageStored={Boolean(connection.pageId)}
            grantedPermissions={connection.grantedPermissions}
            confirmDisconnect={confirmDisconnect}
            onConnect={onConnect}
            onChoosePage={onLoadPages}
            onGrantBusinessPortfolio={onGrantBusinessPortfolio}
            onGrantPageRead={onGrantPageRead}
            onEnableContentFeatures={onEnableContentFeatures}
            onCheckHealth={onCheck}
            onReconnect={onReconnect}
            onDisconnect={() => void handleDisconnectConfirmed()}
            onRequestDisconnect={() => setConfirmDisconnect(true)}
            onCancelDisconnect={() => setConfirmDisconnect(false)}
          />

          {isLoadingPages ? (
            <p className="page-muted" role="status" aria-live="polite">
              Loading Pages…
            </p>
          ) : null}

          {pageSelectionError ? (
            <p className="form-error" role="alert">
              {pageSelectionError}
            </p>
          ) : null}

          {pageSelectionMismatch && pageDiscovery?.needsBusinessPortfolioAccess ? (
            <Panel title="Business Portfolio access required" className="titan-panel--warning">
              <p className="page-muted">
                Meta did not return managed Pages with the current token. Grant Business Portfolio
                access to continue discovery for the verified Young Guns Page.
              </p>
              <Button size="sm" variant="primary" disabled={isBusy} onClick={onGrantBusinessPortfolio}>
                Grant Business Portfolio access
              </Button>
            </Panel>
          ) : null}

          {!isConnectedLimited && pageDiscovery?.businessPortfolio ? (
            <div className="space-y-3">
              <p className="page-muted">
                {FACEBOOK_BUSINESS_PORTFOLIO_STATUS_LABELS[pageDiscovery.businessPortfolio.status]}:{' '}
                {pageDiscovery.businessPortfolio.detail}
              </p>
              {pageDiscovery.businessPortfolio.portfolios.length > 0 ? (
                <ul>
                  {pageDiscovery.businessPortfolio.portfolios.map((portfolio) => (
                    <li key={portfolio.id}>
                      <strong>{portfolio.name}</strong>
                    </li>
                  ))}
                </ul>
              ) : null}
              {pageDiscovery.businessPortfolio.pages.length > 0 ? (
                <ul>
                  {pageDiscovery.businessPortfolio.pages.map((page) => (
                    <li key={`${page.businessPortfolioId}-${page.id}`}>
                      <strong>{page.name}</strong>
                      {` · ${page.businessPortfolioName}`}
                      {page.source === 'assigned' ? ' · assigned' : ' · owned'}
                      <p className="page-muted">{page.statusDetail}</p>
                      {pageDiscoveryRowSelectable({
                        pageId: page.id,
                        selectable: page.selectable,
                      }) ? (
                        <UseThisPageButton
                          pageId={page.id}
                          isLoadingPages={isLoadingPages}
                          isSelectingPage={isSelectingPage}
                          selectingPageId={selectingPageId}
                          onSelectPage={onSelectPage}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {canManage ? (
                <details>
                  <summary className="page-muted">Sanitized Business Portfolio diagnosis</summary>
                  <pre className="social-connection-card__setup">
                    {formatBusinessPortfolioDiagnosis(pageDiscovery.businessPortfolio)}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : null}

          {showPageDiscovery && pageDiscovery ? (
            <div className="space-y-3">
              <p className="page-muted">
                {FACEBOOK_PAGE_DISCOVERY_STATUS_LABELS[pageDiscovery.status]}: {pageDiscovery.detail}
              </p>
              {pageDiscovery.pages.length === 0 && !pageDiscovery.directLookup?.selectable ? (
                <p>{emptyPageDiscoveryMessage(pageDiscovery.status)}</p>
              ) : null}
              {pageDiscovery.directLookup ? (
                <div className="space-y-2">
                  <p>
                    <strong>Direct Page lookup</strong> —{' '}
                    {FACEBOOK_DIRECT_PAGE_LOOKUP_STATUS_LABELS[pageDiscovery.directLookup.status]}:{' '}
                    {pageDiscovery.directLookup.detail}
                  </p>
                  {pageDiscovery.directLookup.selectable ? (
                    <div>
                      <p>
                        <strong>{pageDiscovery.directLookup.candidatePageName}</strong>
                        {pageDiscovery.directLookup.taskCount > 0
                          ? ` · tasks: ${pageDiscovery.directLookup.taskCount}`
                          : null}
                        {verifiedPageId
                          ? ` · Page ID ending ${maskFacebookPageId(verifiedPageId)?.replace(/^···/, '') ?? ''}`
                          : null}
                      </p>
                      {pageDiscoveryRowSelectable({
                        pageId: pageDiscovery.directLookup.candidatePageId,
                        selectable: pageDiscovery.directLookup.selectable,
                      }) ? (
                        <UseThisPageButton
                          pageId={pageDiscovery.directLookup.candidatePageId}
                          isLoadingPages={isLoadingPages}
                          isSelectingPage={isSelectingPage}
                          selectingPageId={selectingPageId}
                          onSelectPage={onSelectPage}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  {canManage ? (
                    <details>
                      <summary className="page-muted">Sanitized direct Page lookup diagnosis</summary>
                      <pre className="social-connection-card__setup">
                        {formatDirectPageLookupDiagnosis(pageDiscovery.directLookup)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ) : null}
              {pageDiscovery.pages.length > 0 ? (
                <ul>
                  {pageDiscovery.pages.map((page) => (
                    <li key={page.id || page.name}>
                      <strong>{page.name}</strong>
                      {page.category ? ` · ${page.category}` : ''}
                      {page.tasks.length > 0 ? ` · tasks: ${page.tasks.join(', ')}` : null}
                      <p className="page-muted">{page.statusDetail}</p>
                      {pageDiscoveryRowSelectable({
                        pageId: page.id,
                        selectable: page.selectable,
                      }) ? (
                        <UseThisPageButton
                          pageId={page.id}
                          isLoadingPages={isLoadingPages}
                          isSelectingPage={isSelectingPage}
                          selectingPageId={selectingPageId}
                          onSelectPage={onSelectPage}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {canManage ? (
                <details>
                  <summary className="page-muted">Sanitized provider diagnosis</summary>
                  <pre className="social-connection-card__setup">
                    {formatPageDiscoveryDiagnosis(pageDiscovery)}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : null}
        </Panel>
      ) : (
        <Panel title="Manage the connection">
          Only the Company Owner may connect or disconnect the Facebook Page.
        </Panel>
      )}

      <Panel title="Related">
        <p>
          <Link href="/social-media-integrations">Social Media Integrations</Link> holds the generic
          platform connection settings and outbound draft queue.{' '}
          <Link href="/marketing-agent">Marketing Agent</Link> remains the campaign and content
          planning layer. <Link href="/integrations">Integrations</Link> shows connection status
          alongside every other provider.
        </p>
      </Panel>
    </div>
  );
}

// ─── Content ─────────────────────────────────────────────────────────────────

function ContentTab({
  content,
  connection,
  canWrite,
  canApprove,
  isBusy,
  draftTitle,
  draftBody,
  draftLink,
  draftSchedule,
  onDraftTitle,
  onDraftBody,
  onDraftLink,
  onDraftSchedule,
  onCreate,
  onTransition,
  onReject,
  onPublish,
  onCancel,
  onAcknowledgePrivacy,
}: {
  content: FacebookContentView[];
  connection: FacebookConnectionView | null;
  canWrite: boolean;
  canApprove: boolean;
  isBusy: boolean;
  draftTitle: string;
  draftBody: string;
  draftLink: string;
  draftSchedule: string;
  onDraftTitle: (value: string) => void;
  onDraftBody: (value: string) => void;
  onDraftLink: (value: string) => void;
  onDraftSchedule: (value: string) => void;
  onCreate: (event: FormEvent) => void;
  onTransition: (id: string, to: FacebookContentStatus) => void;
  onReject: (id: string) => void;
  onPublish: (item: FacebookContentView) => void;
  onCancel: (id: string) => void;
  onAcknowledgePrivacy: (id: string) => void;
}) {
  const publishBlocked = !connection?.usable;

  return (
    <div className="space-y-4">
      {canWrite ? (
        <Panel title="New Facebook post">
          <form onSubmit={onCreate} className="space-y-3">
            <Input
              label="Internal title"
              value={draftTitle}
              onChange={(event) => onDraftTitle(event.target.value)}
              required
            />
            <div className="titan-input-group">
              <label className="titan-input-label" htmlFor="fb-post-copy">
                Post copy
              </label>
              <textarea
                id="fb-post-copy"
                className="titan-input"
                value={draftBody}
                onChange={(event) => onDraftBody(event.target.value)}
                rows={5}
                required
              />
            </div>
            <Input
              label="Link (optional)"
              value={draftLink}
              onChange={(event) => onDraftLink(event.target.value)}
              placeholder="https://…"
            />
            <Input
              label="Schedule for (optional, Cape Town time)"
              type="datetime-local"
              value={draftSchedule}
              onChange={(event) => onDraftSchedule(event.target.value)}
            />
            <Button type="submit" disabled={isBusy}>
              Create draft
            </Button>
            <p>
              Drafts go to review first. Approval is a separate, Owner-only step and nothing reaches
              Facebook before it.
            </p>
          </form>
        </Panel>
      ) : null}

      {publishBlocked ? (
        <Panel title="Publishing unavailable" className="titan-panel--warning">
          Publishing is unavailable because the Facebook connection is{' '}
          {connection?.stateLabel ?? 'not established'}. Drafts and approvals still work.
        </Panel>
      ) : null}

      {content.length === 0 ? (
        <EmptyState
          title="No Facebook posts yet"
          description="Create a draft to start the approval workflow."
        />
      ) : (
        <Panel title="Content workspace">
          <ul className="space-y-4">
            {content.map((item) => {
              const needsPrivacy =
                item.media.some((entry) => entry.privacyReviewRequired) && !item.privacyAcknowledgedAt;

              return (
                <li key={item.id} className="space-y-2">
                  <p>
                    <strong>{item.title}</strong> —{' '}
                    {FACEBOOK_CONTENT_STATUS_LABELS[item.status]}
                    {item.scheduledFor
                      ? ` · scheduled ${formatFacebookScheduleForOwner(new Date(item.scheduledFor))}`
                      : ''}
                  </p>
                  <p>{item.body}</p>

                  {item.brandCheckWarnings.length > 0 ? (
                    <p>Brand check: {item.brandCheckWarnings.join(' ')}</p>
                  ) : null}
                  {item.lastPublishError ? <p>Last publish error: {item.lastPublishError}</p> : null}
                  {item.externalPostId ? (
                    <p>Facebook confirmed post id {item.externalPostId}.</p>
                  ) : null}
                  {needsPrivacy ? (
                    <p>
                      Attached media needs a privacy confirmation before publishing:{' '}
                      {item.media.flatMap((entry) => entry.privacyNotes).join(' ')}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {canWrite && item.status === 'draft' ? (
                      <Button onClick={() => onTransition(item.id, 'in_review')} disabled={isBusy}>
                        Submit for approval
                      </Button>
                    ) : null}
                    {canApprove && item.status === 'in_review' ? (
                      <>
                        <Button onClick={() => onTransition(item.id, 'approved')} disabled={isBusy}>
                          Approve
                        </Button>
                        <Button variant="secondary" onClick={() => onReject(item.id)} disabled={isBusy}>
                          Reject
                        </Button>
                      </>
                    ) : null}
                    {canApprove && item.status === 'approved' && item.scheduledFor ? (
                      <Button onClick={() => onTransition(item.id, 'scheduled')} disabled={isBusy}>
                        Schedule
                      </Button>
                    ) : null}
                    {canApprove && (item.status === 'approved' || item.status === 'failed') ? (
                      <Button
                        onClick={() => onPublish(item)}
                        disabled={isBusy || publishBlocked || needsPrivacy}
                      >
                        {item.status === 'failed' ? 'Retry publish' : 'Publish now'}
                      </Button>
                    ) : null}
                    {canApprove && (item.status === 'scheduled' || item.status === 'approved') ? (
                      <Button variant="secondary" onClick={() => onCancel(item.id)} disabled={isBusy}>
                        Cancel
                      </Button>
                    ) : null}
                    {canWrite && needsPrivacy ? (
                      <Button
                        variant="secondary"
                        onClick={() => onAcknowledgePrivacy(item.id)}
                        disabled={isBusy}
                      >
                        Confirm privacy
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}

// ─── Comments ────────────────────────────────────────────────────────────────

function CommentsTab({
  comments,
  connection,
  canWrite,
  canApprove,
  isBusy,
  replyDrafts,
  pendingReplies,
  onReplyDraftChange,
  onDraftReply,
  onSendReply,
  onConvert,
}: {
  comments: FacebookCommentView[];
  connection: FacebookConnectionView | null;
  canWrite: boolean;
  canApprove: boolean;
  isBusy: boolean;
  replyDrafts: Record<string, string>;
  pendingReplies: Record<string, { id: string; body: string }>;
  onReplyDraftChange: (id: string, value: string) => void;
  onDraftReply: (id: string) => void;
  onSendReply: (commentId: string) => void;
  onConvert: (id: string) => void;
}) {
  const canReply =
    connection?.capabilities.find((entry) => entry.capability === 'reply_comments')?.available ?? false;

  return (
    <div className="space-y-4">
      <Panel title="How comments are handled">
        <p>
          Comments are imported and classified so enquiries surface quickly. TITAN never hides,
          deletes or bans — moderate on the Page itself so the action is attributable to a person.
        </p>
        {!canReply ? (
          <p>
            {connection?.capabilities.find((entry) => entry.capability === 'reply_comments')
              ?.blockedReason ?? 'Replying requires pages_manage_engagement.'}
          </p>
        ) : null}
      </Panel>

      {comments.length === 0 ? (
        <EmptyState
          title="No comments imported"
          description="Comments appear here once a Page is connected and a sync or webhook delivers them."
        />
      ) : (
        <Panel title="Comments">
          <ul className="space-y-4">
            {comments.map((comment) => (
              <li key={comment.id} className="space-y-2">
                <p>
                  <strong>{comment.authorName ?? 'Facebook user'}</strong> ·{' '}
                  {comment.classification}
                  {comment.classificationConfident ? '' : ' (needs a human read)'}
                  {comment.answered ? ' · answered' : ''}
                </p>
                <p>{comment.body}</p>

                {canWrite && !comment.answered ? (
                  <>
                    <div className="titan-input-group">
                      <label className="titan-input-label" htmlFor={`fb-reply-${comment.id}`}>
                        Draft a reply
                      </label>
                      <textarea
                        id={`fb-reply-${comment.id}`}
                        className="titan-input"
                        rows={3}
                        value={replyDrafts[comment.id] ?? ''}
                        onChange={(event) => onReplyDraftChange(comment.id, event.target.value)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => onDraftReply(comment.id)} disabled={isBusy}>
                        Save draft for approval
                      </Button>
                      {comment.leadCandidate ? (
                        <Button
                          variant="secondary"
                          onClick={() => onConvert(comment.id)}
                          disabled={isBusy}
                        >
                          Convert to lead
                        </Button>
                      ) : null}
                    </div>
                  </>
                ) : null}
                {pendingReplies[comment.id] ? (
                  <div className="space-y-1">
                    <p>Awaiting approval: {pendingReplies[comment.id]?.body}</p>
                    {canApprove ? (
                      <Button
                        onClick={() => onSendReply(comment.id)}
                        disabled={isBusy || !canReply}
                      >
                        Approve and send
                      </Button>
                    ) : (
                      <p>Only the Company Owner may approve and send this reply.</p>
                    )}
                  </div>
                ) : null}
                {canApprove && !canReply ? (
                  <p>Approved replies cannot be sent until Meta grants pages_manage_engagement.</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

// ─── Leads ───────────────────────────────────────────────────────────────────

function LeadsTab({
  leads,
  isBusy,
  onResolveDuplicate,
}: {
  leads: FacebookLeadView[];
  isBusy: boolean;
  onResolveDuplicate: (id: string, decision: 'merge' | 'separate') => void;
}) {
  if (leads.length === 0) {
    return (
      <EmptyState
        title="No Facebook leads yet"
        description="Lead Ads, Messenger enquiries and converted comments appear here and link into the CRM."
      />
    );
  }

  return (
    <Panel title="Facebook leads">
      <ul className="space-y-4">
        {leads.map((lead) => (
          <li key={lead.id} className="space-y-1">
            <p>
              <strong>{lead.fullName ?? 'Unnamed enquiry'}</strong> · {lead.source} · {lead.stage} ·
              urgency {lead.urgency}
            </p>
            {lead.message ? <p>{lead.message}</p> : null}
            <p>
              {lead.email ?? 'no email'} · {lead.phone ?? 'no phone'}
              {lead.utmCampaign ? ` · campaign ${lead.utmCampaign}` : ''}
            </p>
            {lead.leadId ? (
              <p>
                Linked to CRM lead <Link href={`/leads/${lead.leadId}`}>{lead.leadId}</Link>.
              </p>
            ) : null}
            {lead.reviewRequired ? (
              <div className="space-y-2">
                <p>{lead.duplicateReason}</p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => onResolveDuplicate(lead.id, 'merge')} disabled={isBusy}>
                    Merge into existing lead
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => onResolveDuplicate(lead.id, 'separate')}
                    disabled={isBusy}
                  >
                    Keep separate
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ─── Insights ────────────────────────────────────────────────────────────────

function InsightsTab({
  insights,
  connection,
  isBusy,
  onRefresh,
}: {
  insights: FacebookInsightsView | null;
  connection: FacebookConnectionView | null;
  isBusy: boolean;
  onRefresh: () => void;
}) {
  const canRead =
    connection?.capabilities.find((entry) => entry.capability === 'read_insights')?.available ?? false;

  const canReadEngagement = hasFacebookPageReadEngagement(connection?.grantedPermissions ?? []);
  const performanceAvailability = resolveFacebookFeatureMetricAvailability({
    grantedPermissions: connection?.grantedPermissions ?? [],
    requiredPermission: 'pages_read_engagement',
    numericValue: null,
    label: 'Performance',
  });

  return (
    <div className="space-y-4">
      <Panel title="Post performance">
        <p>
          Figures come from the Facebook Graph API only. When Facebook returns nothing for a range,
          nothing is shown — no zero-filled charts.
        </p>
        {!canReadEngagement ? (
          <p>{performanceAvailability.displayValue}</p>
        ) : (
          <>
            {insights ? <p>{insights.coverage.note}</p> : null}
            {!canRead ? (
              <p>
                {connection?.capabilities.find((entry) => entry.capability === 'read_insights')
                  ?.blockedReason ?? 'Insights require the read_insights permission.'}
              </p>
            ) : (
              <Button onClick={onRefresh} disabled={isBusy}>
                Refresh from Facebook
              </Button>
            )}
          </>
        )}
      </Panel>

      {!canReadEngagement ? null : !insights || insights.metrics.length === 0 ? (
        <EmptyState
          title="No performance data"
          description="Insights appear once posts are published and Facebook returns figures for them."
        />
      ) : (
        <Panel title="Metrics">
          <ul>
            {insights.metrics.map((metric, index) => (
              <li key={`${metric.externalPostId}-${metric.metricName}-${index}`}>
                {metric.metricName}: {metric.metricValue} ({metric.source}, to {metric.periodEnd})
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

// ─── Activity ────────────────────────────────────────────────────────────────

function ActivityTab({
  syncRuns,
  notifications,
  connection,
  webhookStatus,
  canManage,
  isBusy,
  onSync,
  onSubscribeWebhooks,
  onCheckWebhookStatus,
}: {
  syncRuns: FacebookSyncRunView[];
  notifications: FacebookNotificationView[];
  connection: FacebookConnectionView | null;
  webhookStatus: FacebookWebhookStatusView | null;
  canManage: boolean;
  isBusy: boolean;
  onSync: () => void;
  onSubscribeWebhooks: () => void;
  onCheckWebhookStatus: () => void;
}) {
  const webhookPanelClass =
    webhookStatus?.state === 'subscribed'
      ? 'titan-panel--success'
      : webhookStatus?.state === 'ready_to_subscribe'
        ? 'titan-panel'
        : 'titan-panel--warning';

  return (
    <div className="space-y-4">
      <Panel title="Webhooks" className={webhookPanelClass}>
        {webhookStatus ? (
          <>
            <p>
              <strong>{webhookStatus.label}</strong> — {webhookStatus.detail}
            </p>
            <dl>
              <dt>Subscribed Page</dt>
              <dd>
                {webhookStatus.subscribedPageName
                  ? `${webhookStatus.subscribedPageName}${webhookStatus.subscribedPageId ? ` (${webhookStatus.subscribedPageId})` : ''}`
                  : 'None'}
              </dd>
              <dt>Requested fields</dt>
              <dd>
                {webhookStatus.requestedFields.length > 0
                  ? webhookStatus.requestedFields.join(', ')
                  : 'None available'}
              </dd>
              <dt>Provider-confirmed fields</dt>
              <dd>
                {webhookStatus.providerSubscribedFields?.length
                  ? webhookStatus.providerSubscribedFields.join(', ')
                  : 'Not confirmed by Meta yet'}
              </dd>
              <dt>Last verification</dt>
              <dd>{webhookStatus.lastWebhookVerificationAt ?? 'Never'}</dd>
              <dt>Last event received</dt>
              <dd>{webhookStatus.lastWebhookEventReceivedAt ?? 'None'}</dd>
              <dt>Last event processed</dt>
              <dd>{webhookStatus.lastWebhookEventProcessedAt ?? 'None'}</dd>
              <dt>Last webhook error</dt>
              <dd>{webhookStatus.lastSubscriptionError ?? 'None'}</dd>
              <dt>Polling fallback</dt>
              <dd>
                {webhookStatus.pollingFallbackActive
                  ? `Active — every ${webhookStatus.pollingFallbackMinutes} minutes`
                  : 'Inactive until Page read access is granted'}
              </dd>
            </dl>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={onSubscribeWebhooks}
                  disabled={
                    isBusy ||
                    !webhookStatus.canSubscribe ||
                    webhookStatus.state === 'subscribed' ||
                    webhookStatus.state === 'not_configured'
                  }
                >
                  Subscribe Facebook webhooks
                </Button>
                <Button
                  onClick={onCheckWebhookStatus}
                  disabled={isBusy || webhookStatus.state === 'not_configured'}
                >
                  Check webhook status
                </Button>
                {webhookStatus.canRetrySubscription ? (
                  <Button onClick={onSubscribeWebhooks} disabled={isBusy || !webhookStatus.canSubscribe}>
                    Retry subscription
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <p>Loading webhook status…</p>
        )}
      </Panel>

      <Panel title="Sync">
        <p>{connection?.syncPolicy.note ?? ''}</p>
        <Button
          onClick={onSync}
          disabled={
            isBusy ||
            !connection?.usable ||
            connection?.state === 'connected_limited' ||
            connection?.syncPolicy.pollingBackfillMinutes === 0
          }
        >
          Sync now
        </Button>
      </Panel>

      {notifications.length > 0 ? (
        <Panel title="Open alerts" className="titan-panel--warning">
          <ul>
            {notifications.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.title}</strong> — {entry.body}
                {entry.sendCount > 1 ? ` (raised ${entry.sendCount} times)` : ''}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {syncRuns.length === 0 ? (
        <EmptyState title="No sync history" description="Sync runs are recorded here once they run." />
      ) : (
        <Panel title="Sync history">
          <ul>
            {syncRuns.map((run) => (
              <li key={run.id}>
                {run.startedAt ?? run.id} · {run.status} · {run.commentsIngested} comment(s)
                {run.skippedCapabilities.length > 0
                  ? ` · skipped: ${run.skippedCapabilities.join(', ')}`
                  : ''}
                {run.message ? ` — ${run.message}` : ''}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
