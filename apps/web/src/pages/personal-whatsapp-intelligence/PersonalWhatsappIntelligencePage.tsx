import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type {
  PersonalWaIntelClassification,
  PersonalWaIntelDashboard,
  PersonalWaIntelLinkTargetType,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  classifyPersonalWaIntelThread,
  createPersonalWaLinkProposal,
  decidePersonalWaAuraSuggestion,
  decidePersonalWaLinkProposal,
  fetchPersonalWaIntelDashboard,
  PersonalWhatsappIntelligenceApiClientError,
  runPersonalWaIntelScan,
} from '../../lib/personal-whatsapp-intelligence-api-client';

type Tab = 'dashboard' | 'classifications' | 'approvals' | 'links';

const CLASSIFICATIONS: PersonalWaIntelClassification[] = [
  'customer',
  'supplier',
  'employee',
  'business_opportunity',
  'private_personal',
];

const LINK_TARGETS: PersonalWaIntelLinkTargetType[] = [
  'customer',
  'lead',
  'job',
  'property',
  'timeline',
];

function isPlatformOwner(roleName: string | undefined) {
  return roleName === 'Platform Owner';
}

export function PersonalWhatsappIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<PersonalWaIntelDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [overrideClassification, setOverrideClassification] =
    useState<PersonalWaIntelClassification>('private_personal');
  const [linkTargetType, setLinkTargetType] = useState<PersonalWaIntelLinkTargetType>('customer');
  const [linkTargetId, setLinkTargetId] = useState('');

  const canView = useMemo(() => isPlatformOwner(user?.roleName), [user?.roleName]);

  async function loadPage() {
    if (!accessToken) return;
    const data = await fetchPersonalWaIntelDashboard(accessToken);
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
        await loadPage();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof PersonalWhatsappIntelligenceApiClientError
              ? err.message
              : 'Unable to load Personal WhatsApp Intelligence',
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

  async function handleScan() {
    if (!accessToken) return;
    setError(null);
    setSuccess(null);
    try {
      const result = await runPersonalWaIntelScan(accessToken, { generateAuraSuggestions: true });
      setSuccess(
        `Classified ${result.classified} thread(s); created ${result.auraSuggestionsCreated} AURA draft(s) for approval.`,
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof PersonalWhatsappIntelligenceApiClientError
          ? err.message
          : 'Unable to run intelligence scan',
      );
    }
  }

  async function handleClassify(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !selectedThreadId) return;
    setError(null);
    setSuccess(null);
    try {
      await classifyPersonalWaIntelThread(accessToken, {
        personalThreadId: selectedThreadId,
        classificationOverride: overrideClassification,
      });
      setSuccess('Classification saved. Private-personal stays excluded from business indexes.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof PersonalWhatsappIntelligenceApiClientError
          ? err.message
          : 'Unable to classify thread',
      );
    }
  }

  async function handleProposeLink(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !selectedThreadId) return;
    setError(null);
    setSuccess(null);
    try {
      await createPersonalWaLinkProposal(accessToken, {
        personalThreadId: selectedThreadId,
        linkTargetType,
        linkTargetId: linkTargetId.trim() || undefined,
      });
      setSuccess('Link proposal queued for Owner approval — nothing was auto-linked.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof PersonalWhatsappIntelligenceApiClientError
          ? err.message
          : 'Unable to create link proposal',
      );
    }
  }

  async function handleDecideLink(proposalId: string, decision: 'approve' | 'reject') {
    if (!accessToken) return;
    setError(null);
    setSuccess(null);
    try {
      await decidePersonalWaLinkProposal(accessToken, proposalId, { decision });
      setSuccess(
        decision === 'approve'
          ? 'Link approved and executed as a business projection (not Business WhatsApp messages).'
          : 'Link proposal rejected.',
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof PersonalWhatsappIntelligenceApiClientError
          ? err.message
          : 'Unable to decide link proposal',
      );
    }
  }

  async function handleDecideAura(suggestionId: string, decision: 'approve' | 'reject') {
    if (!accessToken) return;
    setError(null);
    setSuccess(null);
    try {
      await decidePersonalWaAuraSuggestion(accessToken, suggestionId, { decision });
      setSuccess(
        decision === 'approve'
          ? 'AURA suggestion approved. Nothing was sent.'
          : 'AURA suggestion rejected.',
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof PersonalWhatsappIntelligenceApiClientError
          ? err.message
          : 'Unable to decide AURA suggestion',
      );
    }
  }

  if (!canView) {
    return (
      <div className="page">
        <PageHeader
          title="Personal WhatsApp Intelligence"
          description="Platform Owner only — owner-scoped personal threads."
        />
        <EmptyState
          title="Access Restricted"
          description="Personal WhatsApp Intelligence uses the same Platform Owner gate as Personal WhatsApp Assistant. Company staff should use Personal Communications Intelligence for Business WhatsApp analysis."
        />
        <p className="page-muted">
          <Link href="/personal-communications-intelligence">
            Open Personal Communications Intelligence
          </Link>
        </p>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'classifications', label: 'Classifications' },
    { id: 'approvals', label: 'Approval Queue' },
    { id: 'links', label: 'Conversation Links' },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Personal WhatsApp Intelligence"
        description="Classify owner-scoped personal threads, extract business fields, and queue CRM/timeline links plus AURA drafts for explicit Owner approval."
      />

      <Panel title="Product boundaries">
        <ul className="list">
          <li>
            <strong>Personal Communications Intelligence</strong> — analyses Business WhatsApp
            messages (`personal_comm_*`).{' '}
            <Link href="/personal-communications-intelligence">Open PCI</Link>
          </li>
          <li>
            <strong>Personal WhatsApp Assistant</strong> — Platform Owner credential path
            (`personal_whatsapp`); private by default; never auto-imported.{' '}
            <Link href="/communications-hub">Open Communications Hub</Link>
            {' · '}
            <Link href="/personal-whatsapp-connection">Open Connection Layer</Link>
          </li>
          <li>
            <strong>This workflow</strong> — intelligence on owner-scoped personal threads only.
            Never replaces WhatsApp Business. Never migrates personal numbers. Never fabricates
            messages. Never sends without approval.
          </li>
        </ul>
      </Panel>

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="tab-row">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'primary' : 'secondary'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {isLoading ? <p>Loading…</p> : null}

      {!isLoading && activeTab === 'dashboard' && dashboard ? (
        <div className="stack">
          <Panel title="Scan owner-scoped personal threads">
            <p>
              Source path:{' '}
              <strong>
                {dashboard.sourcePath === 'personal_whatsapp_credential'
                  ? 'Personal WhatsApp Assistant credential'
                  : 'None configured'}
              </strong>
              . Uses Business WhatsApp messages: <strong>no</strong>.
            </p>
            <Button onClick={() => void handleScan()}>Run Intelligence Scan</Button>
          </Panel>
          <div className="stat-grid">
            <StatCard label="Threads" value={String(dashboard.totalThreads)} />
            <StatCard label="Classified" value={String(dashboard.classifiedCount)} />
            <StatCard label="Private excluded" value={String(dashboard.privateExcludedCount)} />
            <StatCard label="Business-ready" value={String(dashboard.businessReadyCount)} />
            <StatCard label="Link approvals" value={String(dashboard.pendingLinkApprovals)} />
            <StatCard label="AURA approvals" value={String(dashboard.pendingAuraApprovals)} />
          </div>
          <Panel title="Classification mix">
            <ul className="list">
              {CLASSIFICATIONS.map((key) => (
                <li key={key}>
                  {key}: {dashboard.byClassification[key]}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Summary">
            <p>{dashboard.summary}</p>
            <p className="page-muted">{dashboard.productClarification.thisWorkflow}</p>
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'classifications' && dashboard ? (
        <div className="stack">
          <Panel title="Override classification">
            <form className="stack" onSubmit={handleClassify}>
              <label>
                Personal thread
                <select
                  value={selectedThreadId}
                  onChange={(e) => setSelectedThreadId(e.target.value)}
                >
                  <option value="">Select thread…</option>
                  {dashboard.recentThreads.map((thread) => (
                    <option key={thread.personalThreadId} value={thread.personalThreadId}>
                      {thread.contactName ?? thread.contactPhone ?? thread.personalThreadId} ·{' '}
                      {thread.classification}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Classification
                <select
                  value={overrideClassification}
                  onChange={(e) =>
                    setOverrideClassification(e.target.value as PersonalWaIntelClassification)
                  }
                >
                  {CLASSIFICATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit">Save classification</Button>
            </form>
          </Panel>
          <Panel title="Classified threads">
            {dashboard.recentThreads.length === 0 ? (
              <EmptyState
                title="No personal threads"
                description="Configure Personal WhatsApp Assistant (Owner only), then run a scan. No demo data is invented."
              />
            ) : (
              <ul className="list">
                {dashboard.recentThreads.map((thread) => (
                  <li key={thread.personalThreadId}>
                    <strong>
                      {thread.contactName ?? thread.contactPhone ?? thread.personalThreadId}
                    </strong>{' '}
                    · {thread.classification} ({thread.classificationConfidence}%)
                    {thread.privacyExcluded ? ' · private excluded' : ' · business-ready'}
                    {thread.extraction?.jobRequest
                      ? ` · job: ${thread.extraction.jobRequest}`
                      : ''}
                    {thread.extraction?.urgency
                      ? ` · urgency: ${thread.extraction.urgency}`
                      : ''}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'approvals' && dashboard ? (
        <div className="stack">
          <Panel title="Link approval queue">
            {dashboard.approvalQueue.length === 0 ? (
              <EmptyState
                title="No pending link approvals"
                description="Propose conversation links from the Conversation Links tab."
              />
            ) : (
              <ul className="list">
                {dashboard.approvalQueue.map((proposal) => (
                  <li key={proposal.id}>
                    <div>
                      <strong>{proposal.subject}</strong> — {proposal.recommendation}
                    </div>
                    <div className="tab-row">
                      <Button onClick={() => void handleDecideLink(proposal.id, 'approve')}>
                        Approve link
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void handleDecideLink(proposal.id, 'reject')}
                      >
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="AURA approval queue">
            <p className="page-muted">
              Suggest / draft / approve only — never send without approval (
              {dashboard.sendPolicy.draftApproveExecute ? 'draft → approve → execute' : 'gated'}).
            </p>
            {dashboard.auraQueue.length === 0 ? (
              <EmptyState
                title="No pending AURA suggestions"
                description="Run a scan with AURA drafts enabled to populate next actions and reply drafts."
              />
            ) : (
              <ul className="list">
                {dashboard.auraQueue.map((suggestion) => (
                  <li key={suggestion.id}>
                    <div>
                      <strong>
                        [{suggestion.suggestionType}] {suggestion.subject}
                      </strong>
                      <p>{suggestion.body}</p>
                    </div>
                    <div className="tab-row">
                      <Button onClick={() => void handleDecideAura(suggestion.id, 'approve')}>
                        Approve (no send)
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void handleDecideAura(suggestion.id, 'reject')}
                      >
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'links' && dashboard ? (
        <div className="stack">
          <Panel title="Propose CRM / timeline link">
            <p className="page-muted">
              Private-personal threads are blocked until reclassified. Links never auto-execute.
            </p>
            <form className="stack" onSubmit={handleProposeLink}>
              <label>
                Personal thread
                <select
                  value={selectedThreadId}
                  onChange={(e) => setSelectedThreadId(e.target.value)}
                >
                  <option value="">Select thread…</option>
                  {dashboard.recentThreads.map((thread) => (
                    <option key={thread.personalThreadId} value={thread.personalThreadId}>
                      {thread.contactName ?? thread.contactPhone ?? thread.personalThreadId} ·{' '}
                      {thread.classification}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Link target
                <select
                  value={linkTargetType}
                  onChange={(e) =>
                    setLinkTargetType(e.target.value as PersonalWaIntelLinkTargetType)
                  }
                >
                  {LINK_TARGETS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Target entity ID (optional UUID)"
                value={linkTargetId}
                onChange={(e) => setLinkTargetId(e.target.value)}
              />
              <Button type="submit">Queue link for approval</Button>
            </form>
          </Panel>
          <Panel title="Existing conversation links">
            <ul className="list">
              {dashboard.recentThreads
                .filter(
                  (t) =>
                    t.linkedCustomerId ||
                    t.linkedLeadId ||
                    t.linkedJobId ||
                    t.linkedPropertyId ||
                    t.timelineLinked,
                )
                .map((thread) => (
                  <li key={thread.personalThreadId}>
                    {thread.contactName ?? thread.contactPhone ?? thread.personalThreadId}
                    {thread.linkedCustomerId ? ` · customer ${thread.linkedCustomerId}` : ''}
                    {thread.linkedLeadId ? ` · lead ${thread.linkedLeadId}` : ''}
                    {thread.linkedJobId ? ` · job ${thread.linkedJobId}` : ''}
                    {thread.linkedPropertyId ? ` · property ${thread.linkedPropertyId}` : ''}
                    {thread.timelineLinked ? ' · timeline linked' : ''}
                  </li>
                ))}
            </ul>
            {dashboard.recentThreads.every(
              (t) =>
                !t.linkedCustomerId &&
                !t.linkedLeadId &&
                !t.linkedJobId &&
                !t.linkedPropertyId &&
                !t.timelineLinked,
            ) ? (
              <EmptyState
                title="No approved links yet"
                description="Approve a proposal to project a business link marker. Raw personal messages stay private."
              />
            ) : null}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
