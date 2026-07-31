import { FormEvent, useEffect, useState } from 'react';
import { Button, EmptyState, Input, PageHeader, Panel } from '@titan/ui';
import type { PortalCustomerCommunicationsCentre } from '@titan/shared';
import {
  PortalApiClientError,
  createPortalRequest,
  fetchPortalCommunications,
} from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';

function newPortalClientActionId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function PortalCommunicationsPage() {
  const { accessToken } = usePortalAuth();
  const [centre, setCentre] = useState<PortalCustomerCommunicationsCentre | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [clientActionId, setClientActionId] = useState(() =>
    newPortalClientActionId('portal-request'),
  );

  useEffect(() => {
    if (!accessToken) return;
    void fetchPortalCommunications(accessToken)
      .then(setCentre)
      .catch((err) =>
        setError(
          err instanceof PortalApiClientError ? err.message : 'Unable to load communications',
        ),
      );
  }, [accessToken]);

  async function handleCompose(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !subject.trim() || !message.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await createPortalRequest(accessToken, {
        requestType: 'support_message',
        subject: subject.trim(),
        message: message.trim(),
        clientActionId,
      });
      setSuccess('Message logged for the office. A team member will follow up — this is not a live chat.');
      setSubject('');
      setMessage('');
      setClientActionId(newPortalClientActionId('portal-request'));
      const refreshed = await fetchPortalCommunications(accessToken);
      setCentre(refreshed);
    } catch (err) {
      setError(err instanceof PortalApiClientError ? err.message : 'Unable to send message');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="portal-page">
      <PageHeader
        title="Communications"
        description="Messages, support conversations, and call summaries."
      />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel title="Compose message">
        <form className="auth-form" onSubmit={(event) => void handleCompose(event)}>
          <Input
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            maxLength={200}
          />
          <label className="titan-input-group">
            <span className="titan-input-label">Message</span>
            <textarea
              className="titan-input settings-textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={4}
              maxLength={4000}
            />
          </label>
          <Button type="submit" disabled={saving || !subject.trim() || !message.trim()}>
            {saving ? 'Submitting…' : 'Submit to office'}
          </Button>
        </form>
      </Panel>

      {centre ? (
        <>
          <Panel title="Messages">
            {centre.communications.length === 0 ? (
              <EmptyState
                className="titan-empty-state--compact"
                title="No messages yet"
                description="Outbound and inbound account messages will appear here."
              />
            ) : (
              <ul className="portal-list">
                {centre.communications.map((item) => (
                  <li key={item.id}>
                    <strong>{item.subject ?? item.channel}</strong>
                    <span>{new Date(item.occurredAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Support conversations">
            {centre.supportConversations.length === 0 ? (
              <EmptyState
                className="titan-empty-state--compact"
                title="No support conversations"
                description="Support threads linked to your account will appear here."
              />
            ) : (
              <ul className="portal-list">
                {centre.supportConversations.map((item) => (
                  <li key={item.id}>
                    <strong>{item.subject}</strong> — {item.status}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Voice call summaries">
            {centre.voiceCallSummaries.length === 0 ? (
              <EmptyState
                className="titan-empty-state--compact"
                title="No call summaries"
                description="Call summaries shared with your account will appear here."
              />
            ) : (
              <ul className="portal-list">
                {centre.voiceCallSummaries.map((item) => (
                  <li key={item.id}>
                    <strong>{item.subject}</strong>
                    <p>{item.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
