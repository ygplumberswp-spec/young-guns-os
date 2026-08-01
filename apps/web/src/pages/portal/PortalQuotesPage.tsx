import { PageHeader } from '../../components/ux';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import { QUOTE_STATUS_OPTIONS } from '@titan/shared';
import {
  PortalApiClientError,
  fetchPortalQuotes,
  createPortalRequest,
} from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';
import { toPortalNestedHref } from '../../lib/portal-routing';

function formatStatus(status: string): string {
  return QUOTE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function PortalQuotesPage() {
  const { accessToken } = usePortalAuth();
  const [quotes, setQuotes] = useState<Awaited<ReturnType<typeof fetchPortalQuotes>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void fetchPortalQuotes(accessToken)
      .then(setQuotes)
      .catch((err) =>
        setError(err instanceof PortalApiClientError ? err.message : 'Unable to load quotes'),
      );
  }, [accessToken]);

  async function requestClarification(quoteId: string, quoteNumber: string) {
    if (!accessToken) return;
    setBusyId(quoteId);
    setError(null);
    setSuccess(null);
    try {
      await createPortalRequest(accessToken, {
        requestType: 'quote_clarification',
        subject: `Clarification for quote ${quoteNumber}`,
        message: 'Please provide clarification on this quote.',
        entityType: 'quote',
        entityId: quoteId,
      });
      setSuccess(`Clarification request sent for ${quoteNumber}.`);
    } catch (err) {
      setError(err instanceof PortalApiClientError ? err.message : 'Unable to send request');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="portal-page">
      <PageHeader
        title="Quotes"
        description="Review quote history, accept a quote, or request clarification."
      />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}
      <Panel title="Quote history">
        {quotes.length === 0 ? (
          <EmptyState
            className="titan-empty-state--compact"
            title="No quotes"
            description="Quotes shared with your account will appear here."
          />
        ) : (
          <ul className="portal-list">
            {quotes.map((quote) => (
              <li key={quote.id}>
                <Link
                  href={toPortalNestedHref(`/my/quotes/${quote.id}`)}
                  className="portal-list__link"
                >
                  <strong>
                    {quote.quoteNumber} · {quote.title}
                  </strong>
                  <span>
                    {formatStatus(quote.status)} · v{quote.versionNumber}
                  </span>
                </Link>
                <div className="portal-actions">
                  {quote.canRequestClarification ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === quote.id}
                      onClick={() => void requestClarification(quote.id, quote.quoteNumber)}
                    >
                      Request clarification
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
