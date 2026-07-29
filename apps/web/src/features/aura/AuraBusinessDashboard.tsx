import { useEffect, useState } from 'react';
import { Button, Panel } from '@titan/ui';
import type { IntelligenceDashboard, Recommendation } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  createAuraMemory,
  fetchIntelligenceDashboard,
  fetchRecommendations,
} from '../../lib/intelligence-api';

type AuraBusinessDashboardProps = {
  accessToken: string;
  canWriteMemory: boolean;
};

export function AuraBusinessDashboard({ accessToken, canWriteMemory }: AuraBusinessDashboardProps) {
  const [dashboard, setDashboard] = useState<IntelligenceDashboard | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [memorySuccess, setMemorySuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [dashboardData, recommendationData] = await Promise.all([
          fetchIntelligenceDashboard(accessToken),
          fetchRecommendations(accessToken),
        ]);

        if (!cancelled) {
          setDashboard(dashboardData);
          setRecommendations(recommendationData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load intelligence dashboard');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleSaveMemory() {
    if (!canWriteMemory || !memoryDraft.trim()) return;

    setIsSavingMemory(true);
    setMemorySuccess(null);
    setError(null);

    try {
      await createAuraMemory(accessToken, {
        information: memoryDraft.trim(),
        category: 'business_rule',
        importance: 4,
      });
      setMemoryDraft('');
      setMemorySuccess('Business rule saved to company memory.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save memory');
    } finally {
      setIsSavingMemory(false);
    }
  }

  if (isLoading) {
    return <p className="page-muted">Loading business intelligence…</p>;
  }

  if (!dashboard) {
    return error ? <p className="form-error">{error}</p> : null;
  }

  return (
    <div className="aura-intelligence">
      <Panel title="Business intelligence">
        <p className="aura-intelligence__greeting">{dashboard.greeting.message}</p>
        <dl className="aura-intelligence__grid">
          <div>
            <dt>Jobs today</dt>
            <dd>{dashboard.todaysJobs.count}</dd>
          </div>
          <div>
            <dt>Upcoming schedule</dt>
            <dd>{dashboard.upcomingSchedule.count}</dd>
          </div>
          <div>
            <dt>Outstanding invoices</dt>
            <dd>{dashboard.outstandingInvoices.count}</dd>
          </div>
          <div>
            <dt>Follow-ups</dt>
            <dd>{dashboard.customerFollowUps.count}</dd>
          </div>
          <div>
            <dt>Pending approvals</dt>
            <dd>{dashboard.pendingApprovals.count}</dd>
          </div>
          <div>
            <dt>Automation failures</dt>
            <dd>{dashboard.automationFailures.count}</dd>
          </div>
          <div>
            <dt>Fleet issues</dt>
            <dd>{dashboard.fleetIssues.count}</dd>
          </div>
          <div>
            <dt>Low stock</dt>
            <dd>{dashboard.lowStockCount}</dd>
          </div>
        </dl>
      </Panel>

      {recommendations.length > 0 ? (
        <Panel title="Recommendations">
          <ul className="aura-intelligence__list">
            {recommendations.slice(0, 8).map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <span className="aura-intelligence__priority">{item.priority}</span>
                <p className="page-muted">{item.description}</p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {canWriteMemory ? (
        <Panel title="Save a business rule">
          <p className="page-muted">
            Example: Always create three quote options: Economy, Recommended, Premium.
          </p>
          <textarea
            className="titan-input aura-intelligence__memory-input"
            rows={3}
            value={memoryDraft}
            onChange={(event) => setMemoryDraft(event.target.value)}
            placeholder="Enter a business rule for AURA to remember…"
          />
          {memorySuccess ? <p className="form-success">{memorySuccess}</p> : null}
          <Button
            type="button"
            disabled={isSavingMemory || !memoryDraft.trim()}
            onClick={() => void handleSaveMemory()}
          >
            {isSavingMemory ? 'Saving…' : 'Save to company memory'}
          </Button>
        </Panel>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
