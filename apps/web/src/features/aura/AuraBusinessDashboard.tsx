import { Link } from 'wouter';
import { Button, EmptyState, LoadingState } from '@titan/ui';
import type { IntelligenceDashboard, Recommendation } from '@titan/shared';
import { useEffect, useState } from 'react';
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
      setIsLoading(true);
      setError(null);

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
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load business intelligence',
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
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
    return <LoadingState label="Loading business intelligence…" />;
  }

  if (error) {
    const providerMissing =
      error.toLowerCase().includes('provider') ||
      error.toLowerCase().includes('openai') ||
      error.toLowerCase().includes('not configured');

    if (providerMissing) {
      return (
        <EmptyState
          title="AI provider not configured"
          description="Connect an AI provider in Integration Settings before using AURA business intelligence."
          action={
            <Link href="/integrations">
              <Button>Open Integration Settings</Button>
            </Link>
          }
        />
      );
    }

    return (
      <EmptyState
        title="Business intelligence unavailable"
        description={error}
        action={
          <Link href="/integrations">
            <Button variant="secondary">Review integrations</Button>
          </Link>
        }
      />
    );
  }

  if (!dashboard) {
    return (
      <EmptyState
        title="No business intelligence yet"
        description="Insights will appear here once your workspace has operational data and an configured AI provider."
        action={
          <Link href="/integrations">
            <Button variant="secondary">Integration settings</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="aura-business-dashboard">
      <p className="page-muted">{dashboard.greeting.message}</p>
      {recommendations.length === 0 ? (
        <EmptyState
          title="No recommendations yet"
          description="Recommendations are generated from real tenant data when sufficient evidence is available."
        />
      ) : (
        <ul className="simple-list">
          {recommendations.slice(0, 5).map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong> — {item.description}
              <span className="page-muted"> · Draft recommendation</span>
            </li>
          ))}
        </ul>
      )}
      {canWriteMemory ? (
        <div className="aura-memory-form">
          <textarea
            className="settings-textarea"
            value={memoryDraft}
            onChange={(event) => setMemoryDraft(event.target.value)}
            placeholder="Enter a business rule for AURA to remember…"
            rows={3}
          />
          <Button
            disabled={isSavingMemory || !memoryDraft.trim()}
            onClick={() => void handleSaveMemory()}
          >
            {isSavingMemory ? 'Saving…' : 'Save to company memory'}
          </Button>
          {memorySuccess ? <p className="form-success">{memorySuccess}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
