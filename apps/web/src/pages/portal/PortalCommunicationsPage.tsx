import { useEffect, useState } from 'react';
import { PageHeader, Panel } from '@titan/ui';
import type { PortalCustomerCommunicationsCentre } from '@titan/shared';
import { PortalApiClientError, fetchPortalCommunications } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';

export function PortalCommunicationsPage() {
  const { accessToken } = usePortalAuth();
  const [centre, setCentre] = useState<PortalCustomerCommunicationsCentre | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void fetchPortalCommunications(accessToken)
      .then(setCentre)
      .catch((err) => setError(err instanceof PortalApiClientError ? err.message : 'Unable to load communications'));
  }, [accessToken]);

  return (
    <div className="portal-page">
      <PageHeader title="Communications" description="Messages, support conversations, and call summaries." />
      {error ? <p className="form-error">{error}</p> : null}
      {centre ? (
        <>
          <Panel title="Messages">
            <ul className="portal-list">
              {centre.communications.map((item) => (
                <li key={item.id}>
                  <strong>{item.subject ?? item.channel}</strong>
                  <span>{new Date(item.occurredAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Support conversations">
            <ul className="portal-list">
              {centre.supportConversations.map((item) => (
                <li key={item.id}>
                  <strong>{item.subject}</strong> — {item.status}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Voice call summaries">
            <ul className="portal-list">
              {centre.voiceCallSummaries.map((item) => (
                <li key={item.id}>
                  <strong>{item.subject}</strong>
                  <p>{item.summary}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
