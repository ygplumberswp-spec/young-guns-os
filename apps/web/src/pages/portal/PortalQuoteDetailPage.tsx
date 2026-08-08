import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'wouter';
import { Button, EmptyState, LoadingState, Panel } from '@titan/ui';
import { formatMoney, QUOTE_STATUS_OPTIONS, type PortalQuoteDetail } from '@titan/shared';
import {
  PortalApiClientError,
  acceptPortalQuote,
  createPortalRequest,
  declinePortalQuote,
  fetchPortalQuote,
} from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';
import { toPortalNestedHref } from '../../lib/portal-routing';

function newPortalClientActionId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatStatus(status: PortalQuoteDetail['status']): string {
  return QUOTE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function PortalQuoteDetailPage() {
  const params = useParams<{ quoteId: string }>();
  const quoteId = params.quoteId;
  const { accessToken } = usePortalAuth();

  const [quote, setQuote] = useState<PortalQuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [accepterName, setAccepterName] = useState('');
  const [ackScope, setAckScope] = useState(false);
  const [ackExclusions, setAckExclusions] = useState(false);
  const [ackPrice, setAckPrice] = useState(false);
  const [ackVat, setAckVat] = useState(false);
  const [ackPaymentTerms, setAckPaymentTerms] = useState(false);
  const [ackValidity, setAckValidity] = useState(false);
  const [typedSignature, setTypedSignature] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);

  const [declineDecision, setDeclineDecision] = useState<'declined' | 'change_requested'>(
    'change_requested',
  );
  const [declineReason, setDeclineReason] = useState('');
  const [declineMessage, setDeclineMessage] = useState('');
  const [isDeclining, setIsDeclining] = useState(false);

  const [isRequestingClarification, setIsRequestingClarification] = useState(false);

  async function loadQuote() {
    if (!accessToken || !quoteId) return;
    const data = await fetchPortalQuote(accessToken, quoteId);
    setQuote(data);
  }

  useEffect(() => {
    if (!accessToken || !quoteId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchPortalQuote(accessToken, quoteId)
      .then((data) => {
        if (!cancelled) setQuote(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof PortalApiClientError ? err.message : 'Unable to load quote');
          setQuote(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, quoteId]);

  async function handleAccept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !quote) return;

    if (!accepterName.trim()) {
      setError('Enter your name to accept this quote');
      return;
    }
    if (!ackScope || !ackExclusions || !ackPrice || !ackVat || !ackPaymentTerms || !ackValidity) {
      setError('All acknowledgements are required to accept this quote');
      return;
    }

    setIsAccepting(true);
    setError(null);
    setSuccess(null);
    try {
      await acceptPortalQuote(accessToken, quote.id, {
        clientActionId: newPortalClientActionId('portal-quote-accept'),
        accepterName: accepterName.trim(),
        acknowledgeScope: ackScope,
        acknowledgeExclusions: ackExclusions,
        acknowledgePrice: ackPrice,
        acknowledgeVat: ackVat,
        acknowledgePaymentTerms: ackPaymentTerms,
        acknowledgeValidity: ackValidity,
        typedSignature: typedSignature.trim() || null,
      });
      setSuccess('Quote accepted. Thank you — the office has been notified.');
      await loadQuote();
    } catch (err) {
      setError(err instanceof PortalApiClientError ? err.message : 'Unable to accept quote');
    } finally {
      setIsAccepting(false);
    }
  }

  async function handleDecline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !quote) return;

    if (!declineReason.trim()) {
      setError('A reason is required');
      return;
    }

    setIsDeclining(true);
    setError(null);
    setSuccess(null);
    try {
      await declinePortalQuote(accessToken, quote.id, {
        clientActionId: newPortalClientActionId('portal-quote-decline'),
        decision: declineDecision,
        reason: declineReason.trim(),
        message: declineMessage.trim() || null,
      });
      setSuccess(
        declineDecision === 'declined'
          ? 'Quote declined. The office has been notified.'
          : 'Change request sent. The office will follow up.',
      );
      await loadQuote();
    } catch (err) {
      setError(err instanceof PortalApiClientError ? err.message : 'Unable to submit response');
    } finally {
      setIsDeclining(false);
    }
  }

  async function requestClarification() {
    if (!accessToken || !quote) return;
    setIsRequestingClarification(true);
    setError(null);
    setSuccess(null);
    try {
      await createPortalRequest(accessToken, {
        requestType: 'quote_clarification',
        subject: `Clarification for quote ${quote.displayQuoteNumber}`,
        message: 'Please provide clarification on this quote.',
        entityType: 'quote',
        entityId: quote.id,
      });
      setSuccess(`Clarification request sent for ${quote.displayQuoteNumber}.`);
    } catch (err) {
      setError(err instanceof PortalApiClientError ? err.message : 'Unable to send request');
    } finally {
      setIsRequestingClarification(false);
    }
  }

  return (
    <div className="portal-page">
      <PageHeader
        title={quote ? `${quote.displayQuoteNumber} · ${quote.customerName}` : 'Quote'}
        description="Review quote details and respond."
        actions={
          <Link href={toPortalNestedHref('/my/quotes')} className="auth-text-link">
            Back to quotes
          </Link>
        }
      />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}
      {loading ? <LoadingState label="Loading Quote…" /> : null}
      {!loading && !quote ? (
        <EmptyState title="Quote Not Found" description="This quote is not available on your account." />
      ) : null}

      {quote ? (
        <>
          <Panel title="Summary">
            <ul className="portal-list">
              <li>
                <strong>Status</strong>
                <span>{formatStatus(quote.status)}</span>
              </li>
              <li>
                <strong>Version</strong>
                <span>v{quote.versionNumber}</span>
              </li>
              <li>
                <strong>Subtotal</strong>
                <span className="tabular-nums">{formatMoney(quote.subtotalCents, quote.currency)}</span>
              </li>
              <li>
                <strong>VAT</strong>
                <span className="tabular-nums">{formatMoney(quote.vatCents, quote.currency)}</span>
              </li>
              <li>
                <strong>Total</strong>
                <span className="tabular-nums">{formatMoney(quote.totalCents, quote.currency)}</span>
              </li>
              {quote.validUntil ? (
                <li>
                  <strong>Valid until</strong>
                  <span className="tabular-nums">{new Date(quote.validUntil).toLocaleString()}</span>
                </li>
              ) : null}
            </ul>
            {quote.canRequestClarification ? (
              <div className="portal-actions">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isRequestingClarification}
                  onClick={() => void requestClarification()}
                >
                  Request clarification
                </Button>
              </div>
            ) : null}
          </Panel>

          {quote.canAccept ? (
            <Panel
              title="Accept This Quote"
              description="Confirm you have reviewed the scope, exclusions, price, VAT, and payment terms."
            >
              <form className="finance-form" onSubmit={(event) => void handleAccept(event)}>
                <label className="titan-input-group">
                  <span className="titan-input-label">Your name</span>
                  <input
                    className="titan-input"
                    value={accepterName}
                    onChange={(e) => setAccepterName(e.target.value)}
                    required
                  />
                </label>
                <ul className="finance-checkbox-list">
                  <li>
                    <label>
                      <input
                        type="checkbox"
                        checked={ackScope}
                        onChange={(e) => setAckScope(e.target.checked)}
                      />
                      I have reviewed and agree to the scope of work.
                    </label>
                  </li>
                  <li>
                    <label>
                      <input
                        type="checkbox"
                        checked={ackExclusions}
                        onChange={(e) => setAckExclusions(e.target.checked)}
                      />
                      I understand what is excluded from this quote.
                    </label>
                  </li>
                  <li>
                    <label>
                      <input
                        type="checkbox"
                        checked={ackPrice}
                        onChange={(e) => setAckPrice(e.target.checked)}
                      />
                      I agree to the quoted price.
                    </label>
                  </li>
                  <li>
                    <label>
                      <input
                        type="checkbox"
                        checked={ackVat}
                        onChange={(e) => setAckVat(e.target.checked)}
                      />
                      I understand VAT is included as shown.
                    </label>
                  </li>
                  <li>
                    <label>
                      <input
                        type="checkbox"
                        checked={ackPaymentTerms}
                        onChange={(e) => setAckPaymentTerms(e.target.checked)}
                      />
                      I agree to the stated payment terms.
                    </label>
                  </li>
                  <li>
                    <label>
                      <input
                        type="checkbox"
                        checked={ackValidity}
                        onChange={(e) => setAckValidity(e.target.checked)}
                      />
                      I understand this quote's validity period.
                    </label>
                  </li>
                </ul>
                <label className="titan-input-group">
                  <span className="titan-input-label">Typed signature (optional)</span>
                  <input
                    className="titan-input"
                    value={typedSignature}
                    onChange={(e) => setTypedSignature(e.target.value)}
                  />
                </label>
                <Button type="submit" disabled={isAccepting}>
                  {isAccepting ? 'Accepting…' : 'Accept quote'}
                </Button>
              </form>
            </Panel>
          ) : null}

          {quote.canDecline ? (
            <Panel title="Decline Or Request A Change">
              <form className="finance-form" onSubmit={(event) => void handleDecline(event)}>
                <ul className="finance-radio-list">
                  <li>
                    <label>
                      <input
                        type="radio"
                        name="decline-decision"
                        checked={declineDecision === 'change_requested'}
                        onChange={() => setDeclineDecision('change_requested')}
                      />
                      Request a change
                    </label>
                  </li>
                  <li>
                    <label>
                      <input
                        type="radio"
                        name="decline-decision"
                        checked={declineDecision === 'declined'}
                        onChange={() => setDeclineDecision('declined')}
                      />
                      Decline this quote
                    </label>
                  </li>
                </ul>
                <label className="titan-input-group">
                  <span className="titan-input-label">Reason</span>
                  <textarea
                    className="titan-input finance-textarea"
                    rows={2}
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    required
                  />
                </label>
                <label className="titan-input-group">
                  <span className="titan-input-label">Message (optional)</span>
                  <textarea
                    className="titan-input finance-textarea"
                    rows={2}
                    value={declineMessage}
                    onChange={(e) => setDeclineMessage(e.target.value)}
                  />
                </label>
                <Button type="submit" variant="secondary" disabled={isDeclining}>
                  {isDeclining ? 'Submitting…' : 'Submit response'}
                </Button>
              </form>
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
