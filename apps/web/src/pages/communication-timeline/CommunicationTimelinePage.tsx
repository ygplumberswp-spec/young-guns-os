import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { CommunicationTimelineResult } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { ApiClientError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import {
  createCommunicationTimelineNote,
  fetchCommunicationTimeline,
  syncCommunicationTimelineIndex,
} from '../../lib/email-centre-api';
import {
  canAccessCommunicationsHub,
  canManageCommunicationsHub,
} from '../../features/communications-hub/utils';

type ChannelFilter =
  | 'all'
  | 'email'
  | 'whatsapp'
  | 'note'
  | 'attachment'
  | 'voice'
  | 'sms';

export function CommunicationTimelinePage() {
  const { accessToken, user } = useAuth();
  const [timeline, setTimeline] = useState<CommunicationTimelineResult | null>(null);
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [customerId, setCustomerId] = useState('');
  const [jobId, setJobId] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [statusUpdate, setStatusUpdate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);

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
      const data = await fetchCommunicationTimeline(accessToken, {
        channel,
        customerId: customerId.trim() || undefined,
        jobId: jobId.trim() || undefined,
        limit: 80,
      });
      setTimeline(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load timeline');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [accessToken, channel]);

  async function runAction(action: () => Promise<unknown>, okMessage: string) {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      setSuccess(okMessage);
      await reload();
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
          title="Communication Timeline"
          description="You do not have permission to view the communication timeline."
        />
      </div>
    );
  }

  const entries = timeline?.entries ?? [];

  return (
    <div className="automation-page">
      <PageHeader
        title="Communication Timeline"
        description="Unified Email + WhatsApp Business + notes + attachments indexed into uc_timeline_index. Personal WA intelligence is readiness-only."
      />

      <p className="muted">
        <Link href="/email-centre">Email Centre</Link>
        {' · '}
        <Link href="/communications-hub">Communications Hub</Link>
      </p>

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="stat-grid">
        <StatCard label="Entries" value={String(timeline?.total ?? 0)} />
        <StatCard
          label="Email"
          value={String(entries.filter((e) => e.entryType === 'email').length)}
        />
        <StatCard
          label="WhatsApp"
          value={String(entries.filter((e) => e.entryType === 'whatsapp').length)}
        />
        <StatCard
          label="Notes"
          value={String(entries.filter((e) => e.entryType === 'internal_note').length)}
        />
      </div>

      <Panel title="Filters">
        <div className="form-grid">
          <label>
            Channel
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as ChannelFilter)}
            >
              <option value="all">All</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp Business</option>
              <option value="note">Notes</option>
              <option value="attachment">Attachments</option>
              <option value="voice">Voice</option>
              <option value="sms">SMS</option>
            </select>
          </label>
          <Input
            label="Customer ID"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            placeholder="Optional UUID"
          />
          <Input
            label="Job ID"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="Optional UUID"
          />
          <Button type="button" disabled={isLoading} onClick={() => void reload()}>
            Apply filters
          </Button>
          {canWrite ? (
            <Button
              type="button"
              disabled={isWorking}
              onClick={() =>
                void runAction(
                  () => syncCommunicationTimelineIndex(accessToken!),
                  'Timeline synced from Gmail index, WhatsApp Business, CRM, and notes.',
                )
              }
            >
              Sync timeline
            </Button>
          ) : null}
        </div>
        {timeline ? <p className="muted">{timeline.syncNote}</p> : null}
      </Panel>

      <Panel title="Unified timeline">
        {isLoading ? <p>Loading timeline…</p> : null}
        {!isLoading && entries.length === 0 ? (
          <EmptyState
            title="No timeline entries"
            description="Sync to ingest Gmail index, WhatsApp Business, CRM communications, notes, and attachment links into uc_timeline_index."
          />
        ) : (
          <ul className="portal-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <strong>
                  [{entry.entryType}] {entry.title}
                </strong>
                <span>
                  {entry.channel ?? 'internal'} · {entry.sourceModule}
                  {entry.customerId ? ` · customer ${entry.customerId.slice(0, 8)}` : ''}
                  {entry.jobId ? ` · job ${entry.jobId.slice(0, 8)}` : ''} · {entry.occurredAt}
                </span>
                <span>{entry.summary}</span>
                {entry.attachmentLinks.length > 0 ? (
                  <span>
                    Attachments:{' '}
                    {entry.attachmentLinks
                      .map((a) => `${a.attachmentKind}:${a.label}`)
                      .join(', ')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {canWrite ? (
        <Panel title="Add note / status update">
          <div className="form-grid">
            <label>
              Note
              <textarea
                rows={4}
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Internal communication note"
              />
            </label>
            <Input
              label="Status update (optional)"
              value={statusUpdate}
              onChange={(e) => setStatusUpdate(e.target.value)}
            />
            <Button
              type="button"
              disabled={isWorking || !noteBody.trim()}
              onClick={() =>
                void runAction(async () => {
                  await createCommunicationTimelineNote(accessToken!, {
                    body: noteBody.trim(),
                    statusUpdate: statusUpdate.trim() || undefined,
                    customerId: customerId.trim() || undefined,
                    jobId: jobId.trim() || undefined,
                  });
                  setNoteBody('');
                  setStatusUpdate('');
                }, 'Note added to timeline.')
              }
            >
              Add note
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel title="Sources">
        <ul className="portal-list">
          <li>Gmail inbox index — yes</li>
          <li>WhatsApp Business — yes</li>
          <li>CRM communications — yes (via UC sync)</li>
          <li>Timeline notes & attachment links — yes</li>
          <li>Personal WhatsApp intelligence — readiness only</li>
        </ul>
      </Panel>
    </div>
  );
}
