import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, EmptyState, LoadingState, PageHeader, Panel } from '@titan/ui';
import type {
  CapabilityDiscoveryResponse,
  CapabilityProposal,
  CreateCapabilityProposalRequest,
  TenantCapabilityDetail,
  TenantCapabilityTestSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  activateTenantCapability,
  createTenantCapabilityProposal,
  discoverTenantCapability,
  testTenantCapability,
  updateTenantCapabilityProposal,
} from '../../lib/tenant-capabilities-api';
import { useAuth } from '../../lib/auth-context';
import { AgentsNav } from '../../features/agents/AgentsNav';
import { canAccessAgents, canManageAgents } from '../../features/agents/utils';

type BuilderStep = 'describe' | 'proposal' | 'approvals' | 'test' | 'activate';

const STEPS: Array<{ id: BuilderStep; label: string }> = [
  { id: 'describe', label: 'Describe capability' },
  { id: 'proposal', label: 'Review proposal' },
  { id: 'approvals', label: 'Permissions & approvals' },
  { id: 'test', label: 'Test' },
  { id: 'activate', label: 'Activate' },
];

export function CapabilityBuilderPage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<BuilderStep>('describe');
  const [description, setDescription] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [discovery, setDiscovery] = useState<CapabilityDiscoveryResponse | null>(null);
  const [capability, setCapability] = useState<TenantCapabilityDetail | null>(null);
  const [testResult, setTestResult] = useState<TenantCapabilityTestSummary | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessAgents(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageAgents(user.permissions) : false), [user]);

  async function handleDiscover() {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    try {
      const result = await discoverTenantCapability(accessToken, { description, answers });
      setDiscovery(result);
      if (result.complete && result.recommendation !== 'needs_more_info') {
        setStep('proposal');
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to analyse your request');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleCreateProposal(resolution?: 'extend_existing' | 'create_separate') {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    try {
      const created = await createTenantCapabilityProposal(accessToken, {
        description,
        answers,
        duplicateResolution: resolution,
        extendAgentKey: discovery?.duplicateMatches.find((m) => m.matchType === 'registry_agent')
          ?.id as CreateCapabilityProposalRequest['extendAgentKey'],
      });
      setCapability(created);
      setStep('approvals');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create proposal');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleSaveApprovals() {
    if (!accessToken || !capability) return;
    setIsWorking(true);
    setError(null);
    try {
      const updated = await updateTenantCapabilityProposal(accessToken, capability.id, {
        allowedLowRiskActions: answers.actionMode?.toLowerCase().includes('perform') ?? false,
      });
      setCapability(updated);
      setStep('test');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save approval settings');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleTest() {
    if (!accessToken || !capability) return;
    setIsWorking(true);
    setError(null);
    try {
      const result = await testTenantCapability(accessToken, capability.id);
      setTestResult(result.test);
      setCapability(result.capability);
      if (result.test.result !== 'failed') {
        setStep('activate');
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Capability test failed');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleActivate() {
    if (!accessToken || !capability) return;
    setIsWorking(true);
    setError(null);
    try {
      await activateTenantCapability(accessToken, capability.id);
      navigate('/aura/agents');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to activate capability');
    } finally {
      setIsWorking(false);
    }
  }

  if (!canView) {
    return (
      <div className="agents-page page-shell">
        <PageHeader
          title="Create capability"
          description="You do not have permission to create capabilities."
        />
      </div>
    );
  }

  return (
    <div className="agents-page page-shell capability-builder">
      <PageHeader
        title="Create capability"
        description="Describe what you need in plain language. AURA will design the technical configuration for your review."
        actions={
          <Link href="/aura/agents">
            <Button variant="secondary" size="sm">
              Back to capabilities
            </Button>
          </Link>
        }
      />
      <AgentsNav />

      <nav className="capability-builder__steps" aria-label="Builder progress">
        {STEPS.map((item) => (
          <span
            key={item.id}
            className={`capability-builder__step ${step === item.id ? 'capability-builder__step--active' : ''}`}
          >
            {item.label}
          </span>
        ))}
      </nav>

      {error ? <p className="form-error">{error}</p> : null}

      {step === 'describe' ? (
        <Panel title="Describe the capability you need">
          <p className="page-muted">
            Example: Add an agent that follows up unpaid invoices, or monitors tenders for my
            business.
          </p>
          <label className="titan-input-group">
            <span className="titan-input-label">What should AURA help with?</span>
            <textarea
              className="titan-input capability-builder__textarea"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the capability in everyday business language…"
            />
          </label>

          {discovery && !discovery.complete
            ? discovery.questions.map((question) => (
                <label key={question.id} className="titan-input-group">
                  <span className="titan-input-label">{question.prompt}</span>
                  <input
                    className="titan-input"
                    value={answers[question.id] ?? ''}
                    onChange={(event) =>
                      setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
                    }
                  />
                </label>
              ))
            : null}

          <div className="panel-actions">
            <Button
              disabled={isWorking || description.trim().length < 8}
              onClick={() => void handleDiscover()}
            >
              {isWorking
                ? 'Analysing…'
                : discovery && !discovery.complete
                  ? 'Continue'
                  : 'Analyse request'}
            </Button>
          </div>
        </Panel>
      ) : null}

      {step === 'proposal' && discovery?.proposal ? (
        <ProposalPanel
          discovery={discovery}
          proposal={discovery.proposal}
          canManage={canManage}
          isWorking={isWorking}
          onExtend={() => void handleCreateProposal('extend_existing')}
          onCreateSeparate={() => void handleCreateProposal('create_separate')}
          onBack={() => setStep('describe')}
        />
      ) : null}

      {step === 'approvals' && capability ? (
        <Panel title="Permissions and approvals">
          <ProposalSummary proposal={capability.proposal} />
          <ul className="simple-list">
            <li>Approval mode: Ask before external actions</li>
            <li>Sensitive actions always require human approval</li>
            <li>
              Role scope:{' '}
              {((capability.configuration.roleScope as string[]) ?? []).join(', ') || 'Owner'}
            </li>
          </ul>
          <div className="panel-actions">
            <Button variant="secondary" onClick={() => setStep('proposal')}>
              Back
            </Button>
            <Button disabled={!canManage || isWorking} onClick={() => void handleSaveApprovals()}>
              Continue to test
            </Button>
          </div>
        </Panel>
      ) : null}

      {step === 'test' && capability ? (
        <Panel title="Test capability">
          <p className="page-muted">
            AURA runs safe tenant-scoped checks. No real customer messages, financial writes or
            external actions are performed.
          </p>
          {testResult ? (
            <div className={`capability-test-result capability-test-result--${testResult.result}`}>
              <strong>
                {testResult.result === 'passed'
                  ? 'Passed'
                  : testResult.result === 'passed_with_warnings'
                    ? 'Passed with warnings'
                    : 'Failed'}
              </strong>
              <p>{testResult.summary}</p>
            </div>
          ) : null}
          <div className="panel-actions">
            <Button variant="secondary" onClick={() => setStep('approvals')}>
              Back
            </Button>
            <Button disabled={!canManage || isWorking} onClick={() => void handleTest()}>
              {isWorking ? 'Testing…' : testResult ? 'Re-test capability' : 'Test capability'}
            </Button>
          </div>
        </Panel>
      ) : null}

      {step === 'activate' && capability ? (
        <Panel title="Activate capability">
          <p className="page-muted">
            Once activated, {capability.name} will appear in AURA Capabilities and become available
            to AURA routing for matching requests.
          </p>
          {testResult ? <p className="page-muted">Last test: {testResult.summary}</p> : null}
          {capability.capabilityType === 'code_backed' ? (
            <EmptyState
              title="App Builder required"
              description="This capability needs controlled code development through AURA App Builder before it can go live."
              action={
                <Link href="/app-builder">
                  <Button variant="secondary">Open AURA App Builder</Button>
                </Link>
              }
            />
          ) : (
            <div className="panel-actions">
              <Button disabled={!canManage || isWorking} onClick={() => void handleActivate()}>
                {isWorking ? 'Activating…' : 'Approve and activate'}
              </Button>
            </div>
          )}
        </Panel>
      ) : null}

      {isWorking && step === 'describe' ? (
        <LoadingState label="AURA is analysing your request…" />
      ) : null}
    </div>
  );
}

function ProposalPanel({
  discovery,
  proposal,
  canManage,
  isWorking,
  onExtend,
  onCreateSeparate,
  onBack,
}: {
  discovery: CapabilityDiscoveryResponse;
  proposal: CapabilityProposal;
  canManage: boolean;
  isWorking: boolean;
  onExtend: () => void;
  onCreateSeparate: () => void;
  onBack: () => void;
}) {
  return (
    <Panel title="Review AURA proposal">
      <p className="page-muted">{discovery.recommendationSummary}</p>
      <ProposalSummary proposal={proposal} />

      {discovery.duplicateMatches.length > 0 ? (
        <div className="capability-builder__duplicates">
          <h3>Similar capabilities found</h3>
          <ul className="simple-list">
            {discovery.duplicateMatches.map((match) => (
              <li key={`${match.matchType}:${match.id}`}>
                <strong>{match.name}</strong> — {match.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="capability-builder__advanced">
        <summary>Advanced details</summary>
        <p className="page-muted">
          Base specialist: {proposal.baseAgentKey ?? '—'} · Risk: {proposal.riskLevel} · Type:{' '}
          {proposal.configurationOnly ? 'Configuration only' : 'Code-backed'}
        </p>
      </details>

      <div className="panel-actions">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        {discovery.recommendation === 'extend_existing' ? (
          <>
            <Button disabled={!canManage || isWorking} onClick={onExtend}>
              Extend existing capability
            </Button>
            <Button
              variant="secondary"
              disabled={!canManage || isWorking}
              onClick={onCreateSeparate}
            >
              Create separate capability
            </Button>
          </>
        ) : discovery.recommendation === 'code_backed' ? (
          <Link href="/app-builder">
            <Button variant="secondary">Continue in App Builder</Button>
          </Link>
        ) : (
          <Button disabled={!canManage || isWorking} onClick={onCreateSeparate}>
            Approve proposal
          </Button>
        )}
      </div>
    </Panel>
  );
}

function ProposalSummary({ proposal }: { proposal: CapabilityProposal }) {
  return (
    <dl className="capability-proposal-summary">
      <div>
        <dt>Name</dt>
        <dd>{proposal.name}</dd>
      </div>
      <div>
        <dt>Department</dt>
        <dd>{proposal.departmentLabel}</dd>
      </div>
      <div>
        <dt>Purpose</dt>
        <dd>{proposal.purpose}</dd>
      </div>
      <div>
        <dt>Will access</dt>
        <dd>{proposal.dataAccess.join(', ')}</dd>
      </div>
      <div>
        <dt>May</dt>
        <dd>
          {proposal.allowedActions
            .filter((a) => a.allowed)
            .map((a) => a.label)
            .join(', ')}
        </dd>
      </div>
      <div>
        <dt>May not</dt>
        <dd>{proposal.prohibitedActions.slice(0, 4).join(' · ')}</dd>
      </div>
      <div>
        <dt>Approval</dt>
        <dd>{proposal.approvalRequirements.join(', ')}</dd>
      </div>
      {proposal.providerRequirements.length > 0 ? (
        <div>
          <dt>Provider required</dt>
          <dd>{proposal.providerRequirements.join(', ')}</dd>
        </div>
      ) : null}
    </dl>
  );
}
