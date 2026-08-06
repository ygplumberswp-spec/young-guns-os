import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type {
  CommAttachmentKind,
  EmailCentreDashboard,
  EmailCentreDraftSummary,
  EmailCentreMessageSummary,
  EmailCentreThreadHistory,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { ApiClientError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import {
  approveEmailCentreDraft,
  createEmailCentreAttachment,
  createEmailCentreDraft,
  executeEmailCentreDraft,
  fetchEmailCentreDashboard,
  fetchEmailThread,
  linkEmailCentreMessage,
  listEmailCentreDrafts,
} from '../../lib/email-centre-api';
import {
  canAccessCommunicationsHub,
  canManageCommunicationsHub,
} from '../../features/communications-hub/utils';

type CentreTab = 'mailbox' | 'thread' | 'compose' | 'drafts' | 'attachments';

const ATTACHMENT_KINDS: CommAttachmentKind[] = [
  'quote',
  'boq',
  'invoice',
  'receipt',
  'coc',
  'report',
  'job_photo',
  'document',
];

export function EmailCentrePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<CentreTab>('mailbox');
  const [dashboard, setDashboard] = useState<EmailCentreDashboard | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<EmailCentreThreadHistory | null>(null);
  const [drafts, setDrafts] = useState<EmailCentreDraftSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);

  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeMode, setComposeMode] = useState<'reply' | 'forward' | 'new'>('reply');

  const [linkType, setLinkType] = useState<'customer' | 'job'>('customer');
  const [linkId, setLinkId] = useState('');

  const [attachKind, setAttachKind] = useState<CommAttachmentKind>('document');
  const [attachEntityId, setAttachEntityId] = useState('');
  const [attachLabel, setAttachLabel] = useState('');

  const canView = useMemo(
    () => (user ? canAccessCommunicationsHub(user.permissions) : false),
    [user],
  );
  const canWrite = useMemo(
    () => (user ? canManageCommunicationsHub(user.permissions) : false),
    [user],
  );

  async function reload() {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [dash, draftList] = await Promise.all([
        fetchEmailCentreDashboard(accessToken),
        listEmailCentreDrafts(accessToken),
      ]);
      setDashboard(dash);
      setDrafts(draftList);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load Email Centre');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [accessToken]);

  async function openThread(item: EmailCentreMessageSummary) {
    if (!accessToken) return;
    setSelectedId(item.id);
    setTab('thread');
    setError(null);
    try {
      const history = await fetchEmailThread(accessToken, item.id);
      setThread(history);
      setComposeTo(item.participantLabel?.includes('@') ? item.participantLabel : '');
      setComposeSubject(
        item.subject?.startsWith('Re:') || item.subject?.startsWith('Fwd:')
          ? item.subject
          : `Re: ${item.subject ?? ''}`,
      );
      setComposeBody('');
      setComposeMode('reply');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load thread');
    }
  }

  async function runAction(action: () => Promise<unknown>, okMessage: string) {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      setSuccess(okMessage);
      await reload();
      if (selectedId) {
        setThread(await fetchEmailThread(accessToken, selectedId));
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setIsWorking(false);
    }
  }

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader
          title="Email Centre"
          description="You do not have permission to view the Email Centre."
        />
      </div>
    );
  }

  const items = dashboard?.mailbox.items ?? [];

  return (
    <div className="automation-page">
      <PageHeader
        title="Email Centre"
        description="Business email from the Gmail index. Reply/forward uses Gmail draft → approve → execute. Resend stays transactional-only."
      />

      <p className="muted">
        <Link href="/communications-hub">Communications Hub</Link>
        {' · '}
        <Link href="/communication-timeline">Communication Timeline</Link>
      </p>

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="stat-grid">
        <StatCard label="Mailbox" value={String(dashboard?.mailbox.total ?? 0)} />
        <StatCard
          label="Drafts pending"
          value={String(dashboard?.draftsPendingApproval ?? 0)}
        />
        <StatCard
          label="Recent attachments"
          value={String(dashboard?.recentAttachments.length ?? 0)}
        />
      </div>

      <div className="tab-row" role="tablist" aria-label="Email Centre">
        {(
          [
            ['mailbox', 'Mailbox'],
            ['thread', 'Thread'],
            ['compose', 'Compose'],
            ['drafts', 'Drafts'],
            ['attachments', 'Attachments'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'tab-button active' : 'tab-button'}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? <p>Loading Email Centre…</p> : null}

      {tab === 'mailbox' ? (
        <Panel title="Business Gmail Index">
          <p className="muted">
            Source: Communications Platform Gmail sync — not a separate inbox silo.
          </p>
          {items.length === 0 ? (
            <EmptyState
              title="No emails indexed"
              description={
                dashboard?.mailbox.emptyReason === 'not_configured'
                  ? 'Connect and sync Business Gmail in Communications Hub first.'
                  : 'Sync Gmail from Communications Hub to populate this mailbox.'
              }
            />
          ) : (
            <ul className="portal-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button type="button" className="link-button" onClick={() => void openThread(item)}>
                    <strong>{item.subject ?? '(no subject)'}</strong>
                  </button>
                  <span>
                    {item.direction} · {item.participantLabel ?? 'Unknown'} ·{' '}
                    {item.attachmentCount} attachment(s) · {item.occurredAt}
                  </span>
                  <span>{item.preview}</span>
                  {item.linkTargetType ? (
                    <span>
                      Linked: {item.linkTargetType} {item.linkTargetId?.slice(0, 8)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === 'thread' ? (
        <Panel title="Email history">
          {!thread ? (
            <EmptyState
              title="Select an email"
              description="Open a message from the mailbox to view thread history and link it to a customer or job."
            />
          ) : (
            <>
              <p className="muted">{thread.composeNote}</p>
              <ul className="portal-list">
                {thread.messages.map((msg) => (
                  <li key={msg.id}>
                    <strong>{msg.subject ?? '(no subject)'}</strong>
                    <span>
                      {msg.direction} · {msg.participantLabel ?? 'Unknown'} · {msg.occurredAt}
                    </span>
                    <span>{msg.preview}</span>
                  </li>
                ))}
              </ul>

              {canWrite ? (
                <div className="form-grid" style={{ marginTop: '1rem' }}>
                  <label>
                    Link type
                    <select
                      value={linkType}
                      onChange={(e) => setLinkType(e.target.value as 'customer' | 'job')}
                    >
                      <option value="customer">Customer</option>
                      <option value="job">Job</option>
                    </select>
                  </label>
                  <Input
                    label="Customer / Job ID"
                    value={linkId}
                    onChange={(e) => setLinkId(e.target.value)}
                    placeholder="UUID"
                  />
                  <Button
                    type="button"
                    disabled={isWorking || !linkId || !selectedId}
                    onClick={() =>
                      void runAction(
                        () =>
                          linkEmailCentreMessage(accessToken!, selectedId!, {
                            linkTargetType: linkType,
                            linkTargetId: linkId.trim(),
                          }),
                        'Email linked.',
                      )
                    }
                  >
                    Link email
                  </Button>
                  <Button type="button" disabled={!selectedId} onClick={() => setTab('compose')}>
                    Reply / Forward
                  </Button>
                </div>
              ) : null}

              {thread.attachmentLinks.length > 0 ? (
                <div style={{ marginTop: '1rem' }}>
                  <h3>Linked documents</h3>
                  <ul className="portal-list">
                    {thread.attachmentLinks.map((a) => (
                      <li key={a.id}>
                        <strong>
                          {a.attachmentKind}: {a.label}
                        </strong>
                        <span>
                          {a.entityType}/{a.entityId.slice(0, 8)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </Panel>
      ) : null}

      {tab === 'compose' ? (
        <Panel title="Compose (Gmail draft → approve → execute)">
          <p className="muted">
            Manual compose creates a Gmail draft only. Nothing is sent until approve and execute.
            Binary re-upload is not used — attach TITAN document entity IDs instead.
          </p>
          {!canWrite ? (
            <EmptyState title="Read only" description="You need communications write access to compose." />
          ) : (
            <div className="form-grid">
              <label>
                Mode
                <select
                  value={composeMode}
                  onChange={(e) => {
                    const mode = e.target.value as 'reply' | 'forward' | 'new';
                    setComposeMode(mode);
                    if (thread?.messages[0]?.subject) {
                      const base = thread.messages[0].subject.replace(/^(Re:|Fwd:)\s*/i, '');
                      setComposeSubject(mode === 'forward' ? `Fwd: ${base}` : `Re: ${base}`);
                    }
                  }}
                >
                  <option value="reply">Reply</option>
                  <option value="forward">Forward</option>
                  <option value="new">New</option>
                </select>
              </label>
              <Input
                label="To (comma-separated emails)"
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
              />
              <Input
                label="Subject"
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
              />
              <label>
                Body
                <textarea
                  rows={8}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                />
              </label>
              <Button
                type="button"
                disabled={isWorking || !composeTo || !composeSubject || !composeBody}
                onClick={() =>
                  void runAction(async () => {
                    const to = composeTo
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    await createEmailCentreDraft(accessToken!, {
                      to,
                      subject: composeSubject,
                      bodyText: composeBody,
                      inboxItemId: selectedId ?? undefined,
                      replyToMessageId:
                        composeMode === 'reply'
                          ? thread?.messages[0]?.externalMessageId ?? undefined
                          : undefined,
                      forwardOfMessageId:
                        composeMode === 'forward'
                          ? thread?.messages[0]?.externalMessageId ?? undefined
                          : undefined,
                    });
                    setTab('drafts');
                  }, 'Draft saved. Approve then execute to send via Gmail.')
                }
              >
                Save draft
              </Button>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === 'drafts' ? (
        <Panel title="Gmail drafts (approval required)">
          {drafts.length === 0 ? (
            <EmptyState title="No drafts" description="Compose a reply or forward to create a draft." />
          ) : (
            <ul className="portal-list">
              {drafts.map((draft) => (
                <li key={draft.id}>
                  <strong>{draft.subject}</strong>
                  <span>
                    {draft.status} · {draft.to.join(', ')} · {draft.createdAt}
                  </span>
                  <span>{draft.note}</span>
                  {canWrite && (draft.status === 'draft' || draft.status === 'pending_approval') ? (
                    <Button
                      type="button"
                      disabled={isWorking}
                      onClick={() =>
                        void runAction(
                          () => approveEmailCentreDraft(accessToken!, draft.id),
                          'Draft approved. Execute is a separate step.',
                        )
                      }
                    >
                      Approve
                    </Button>
                  ) : null}
                  {canWrite && draft.status === 'approved' ? (
                    <Button
                      type="button"
                      disabled={isWorking}
                      onClick={() =>
                        void runAction(
                          () => executeEmailCentreDraft(accessToken!, draft.id),
                          'Sent via Gmail API after approval.',
                        )
                      }
                    >
                      Execute send
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === 'attachments' ? (
        <Panel title="Link TITAN documents">
          <p className="muted">
            Prefer linking existing Quotes, BOQs, Invoices, Receipts, COCs, Reports, job photos, and
            Documents by ID — metadata only, no blob re-upload.
          </p>
          {(dashboard?.recentAttachments.length ?? 0) === 0 ? (
            <EmptyState
              title="No linked attachments yet"
              description="Attach an existing document entity to a selected email or draft."
            />
          ) : (
            <ul className="portal-list">
              {dashboard!.recentAttachments.map((a) => (
                <li key={a.id}>
                  <strong>
                    {a.attachmentKind}: {a.label}
                  </strong>
                  <span>
                    {a.anchorType} · {a.entityType}/{a.entityId.slice(0, 8)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {canWrite ? (
            <div className="form-grid" style={{ marginTop: '1rem' }}>
              <label>
                Kind
                <select
                  value={attachKind}
                  onChange={(e) => setAttachKind(e.target.value as CommAttachmentKind)}
                >
                  {ATTACHMENT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Entity ID"
                value={attachEntityId}
                onChange={(e) => setAttachEntityId(e.target.value)}
                placeholder="Existing TITAN entity UUID"
              />
              <Input
                label="Label"
                value={attachLabel}
                onChange={(e) => setAttachLabel(e.target.value)}
              />
              <Button
                type="button"
                disabled={isWorking || !selectedId || !attachEntityId || !attachLabel}
                onClick={() =>
                  void runAction(
                    () =>
                      createEmailCentreAttachment(accessToken!, {
                        anchorType: 'inbox_item',
                        anchorId: selectedId!,
                        attachmentKind: attachKind,
                        entityType:
                          attachKind === 'boq'
                            ? 'boq_document'
                            : attachKind === 'receipt'
                              ? 'payment_receipt'
                              : attachKind,
                        entityId: attachEntityId.trim(),
                        label: attachLabel.trim(),
                      }),
                    'Attachment linked to selected email.',
                  )
                }
              >
                Link to selected email
              </Button>
            </div>
          ) : null}
        </Panel>
      ) : null}

      <Panel title="Policies">
        <ul className="portal-list">
          <li>Email source: Gmail index</li>
          <li>Outbound compose: Gmail draft → approve → execute</li>
          <li>Transactional provider: Resend (unchanged)</li>
          <li>Auto-send: disabled</li>
        </ul>
      </Panel>
    </div>
  );
}
