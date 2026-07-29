import { useEffect, useState } from 'react';
import { PageHeader, Panel } from '@titan/ui';
import { PortalApiClientError, fetchPortalQuotes, createPortalRequest } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';

export function PortalQuotesPage() {
  const { accessToken } = usePortalAuth();
  const [quotes, setQuotes] = useState<Awaited<ReturnType<typeof fetchPortalQuotes>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void fetchPortalQuotes(accessToken)
      .then(setQuotes)
      .catch((err) => setError(err instanceof PortalApiClientError ? err.message : 'Unable to load quotes'));
  }, [accessToken]);

  async function requestClarification(quoteId: string, quoteNumber: string) {
    if (!accessToken) return;
    await createPortalRequest(accessToken, {
      requestType: 'quote_clarification',
      subject: `Clarification for quote ${quoteNumber}`,
      message: 'Please provide clarification on this quote.',
      entityType: 'quote',
      entityId: quoteId,
    });
  }

  return (
    <div className="portal-page">
      <PageHeader title="Quotes" description="View quote history and request clarification or approval." />
      {error ? <p className="form-error">{error}</p> : null}
      <Panel title="Quote history">
        <ul className="portal-list">
          {quotes.map((quote) => (
            <li key={quote.id}>
              <strong>{quote.quoteNumber}</strong> — {quote.title}
              <span>{quote.status}</span>
              {quote.canRequestClarification ? (
                <button type="button" onClick={() => void requestClarification(quote.id, quote.quoteNumber)}>
                  Request clarification
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
