import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'wouter';
import {
  computeDocumentTotals,
  moveSection,
  setSectionVisibility,
  updateSection,
  type DocumentLineItem,
  type DocumentSection,
} from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import {
  approveInvoicePaymentLink,
  fetchTitanDocument,
  issueTitanDocument,
  previewInvoicePaymentLink,
  saveTitanDocumentDraft,
  type PaymentLinkPreview,
  type TitanDocumentDetail,
} from '../../lib/document-engine-api-client';
import { TitanDocumentView } from '../../components/documents/TitanDocumentView';

/**
 * Editor plus live preview for every document the engine produces. The preview
 * is the same component that prints, so what the Owner approves is what the
 * customer receives.
 */
export function TitanDocumentPage() {
  const params = useParams<{ documentId: string }>();
  const documentId = params.documentId ?? '';
  const { accessToken } = useAuth();

  const [detail, setDetail] = useState<TitanDocumentDetail | null>(null);
  const [sections, setSections] = useState<DocumentSection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<PaymentLinkPreview | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !documentId) return;
    try {
      const next = await fetchTitanDocument(accessToken, documentId);
      setDetail(next);
      setSections(next.sections);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load this document');
    }
  }, [accessToken, documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lineItems = useMemo<DocumentLineItem[]>(() => {
    const section = sections.find((candidate) => candidate.kind === 'line_items');
    const items = (section?.payload as { items?: DocumentLineItem[] } | undefined)?.items;
    return Array.isArray(items) ? items : [];
  }, [sections]);

  const totals = useMemo(() => {
    if (!detail || detail.document.documentType === 'report' || lineItems.length === 0) return null;
    const content = (detail.document as unknown as { content?: Record<string, number> }).content ?? {};
    return computeDocumentTotals({
      lineItems,
      depositReceivedCents: content.depositReceivedCents ?? 0,
      amountPaidCents: content.amountPaidCents ?? 0,
    });
  }, [detail, lineItems]);

  const editable = Boolean(detail && !detail.editScope.lockedReason);

  const canEditKind = useCallback(
    (kind: DocumentSection['kind']) =>
      Boolean(detail?.editScope.editableSectionKinds.includes(kind)),
    [detail],
  );

  const saveDraft = useCallback(
    async (nextSections: DocumentSection[]) => {
      if (!accessToken || !detail) return;
      setBusy(true);
      try {
        await saveTitanDocumentDraft(accessToken, detail.document.id, { sections: nextSections });
        setNotice('Draft saved.');
        await load();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Could not save this draft');
      } finally {
        setBusy(false);
      }
    },
    [accessToken, detail, load],
  );

  const onIssue = useCallback(async () => {
    if (!accessToken || !detail) return;
    setBusy(true);
    try {
      await issueTitanDocument(accessToken, detail.document.id);
      setNotice('Issued. This version is now locked and recorded in version history.');
      await load();
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : 'Could not issue this document');
    } finally {
      setBusy(false);
    }
  }, [accessToken, detail, load]);

  // Draft step: ask the server what issuing would do. Nothing reaches Yoco yet.
  const onRequestPaymentLink = useCallback(async () => {
    if (!accessToken || !detail?.document.invoiceId) return;
    setBusy(true);
    try {
      setApproval(await previewInvoicePaymentLink(accessToken, detail.document.invoiceId));
      setError(null);
    } catch (previewError) {
      setError(
        previewError instanceof Error ? previewError.message : 'Could not prepare a payment link',
      );
    } finally {
      setBusy(false);
    }
  }, [accessToken, detail]);

  const onApprovePaymentLink = useCallback(async () => {
    if (!accessToken || !approval) return;
    setBusy(true);
    try {
      const result = await approveInvoicePaymentLink(accessToken, approval.invoiceId, {
        approvedOutstandingCents: approval.outstandingCents,
        documentId: detail?.document.id ?? null,
      });
      setNotice(
        result.reused
          ? 'The existing Yoco link still matches this balance, so it was reused.'
          : 'Yoco payment link created.',
      );
      setApproval(null);
      await load();
    } catch (approveError) {
      setError(
        approveError instanceof Error ? approveError.message : 'Yoco could not create the link',
      );
    } finally {
      setBusy(false);
    }
  }, [accessToken, approval, detail, load]);

  if (error && !detail) {
    return <p role="alert">{error}</p>;
  }
  if (!detail) {
    return <p>Loading document…</p>;
  }

  const { document: record } = detail;

  return (
    <div className="titan-doc-page">
      <header className="titan-doc__no-print">
        <h1>
          {record.documentNumber} — {record.title}
        </h1>
        <p>
          {record.documentType}
          {record.reportKind ? ` · ${record.reportKind}` : ''} · {record.status} · version{' '}
          {record.version}
        </p>
        {detail.editScope.lockedReason ? <p role="status">{detail.editScope.lockedReason}</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
      </header>

      {editable ? (
        <section className="titan-doc__no-print" aria-label="Section editor">
          <h2>Sections</h2>
          <ol>
            {sections.map((section, index) => {
              const allowed = canEditKind(section.kind);
              return (
                <li key={section.id}>
                  <span>{section.kind}</span>
                  <button
                    type="button"
                    disabled={!allowed || busy || index === 0}
                    onClick={() => setSections(moveSection(sections, section.id, index - 1))}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    disabled={!allowed || busy || index === sections.length - 1}
                    onClick={() => setSections(moveSection(sections, section.id, index + 1))}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    disabled={!allowed || busy}
                    onClick={() => {
                      try {
                        setSections(setSectionVisibility(sections, section.id, !section.visible));
                      } catch (toggleError) {
                        setError(
                          toggleError instanceof Error ? toggleError.message : 'Cannot hide this section',
                        );
                      }
                    }}
                  >
                    {section.visible ? 'Hide' : 'Show'}
                  </button>
                  <label>
                    <span>Heading</span>
                    <input
                      type="text"
                      value={section.title ?? ''}
                      disabled={!allowed || busy}
                      onChange={(event) =>
                        setSections(
                          updateSection(sections, section.id, {
                            title: event.target.value || null,
                          }),
                        )
                      }
                    />
                  </label>
                </li>
              );
            })}
          </ol>

          <button type="button" disabled={busy} onClick={() => void saveDraft(sections)}>
            Save draft
          </button>
          {detail.editScope.canIssue ? (
            <button type="button" disabled={busy} onClick={() => void onIssue()}>
              Approve &amp; issue
            </button>
          ) : null}
          {record.documentType === 'invoice' && detail.editScope.canManagePaymentLinks ? (
            <button type="button" disabled={busy} onClick={() => void onRequestPaymentLink()}>
              Prepare Yoco payment link
            </button>
          ) : null}
        </section>
      ) : null}

      {approval ? (
        <div className="titan-doc__no-print" role="dialog" aria-label="Approve and issue invoice">
          <h2>{approval.summary.headline}</h2>
          <ul>
            {approval.summary.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {approval.summary.blocked ? (
            // Honest blocked state: no link is invented when Yoco is unavailable.
            <p role="alert">{approval.summary.blockedReason}</p>
          ) : (
            <button type="button" disabled={busy} onClick={() => void onApprovePaymentLink()}>
              Approve &amp; create the Yoco link
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => setApproval(null)}>
            Cancel
          </button>
        </div>
      ) : null}

      <TitanDocumentView
        documentType={record.documentType}
        reportKind={record.reportKind}
        documentNumber={record.documentNumber}
        title={record.title}
        status={record.status}
        issuedAt={record.issuedAt}
        sections={sections}
        photos={detail.photos}
        lineItems={lineItems}
        totals={totals}
        coc={detail.coc}
        paymentLink={detail.paymentLink}
      />
    </div>
  );
}
