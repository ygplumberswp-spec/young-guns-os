import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRoute } from 'wouter';
import { PageHeader } from '../../components/ux';
import { Button, LoadingState, Panel } from '@titan/ui';
import { ApiClientError } from '../../lib/api-client';
import {
  confirmSupplierQuoteMatchProposal,
  createSplitPurchaseProposal,
  downloadBase64File,
  exportReviewedBoq,
  fetchBoqExportReadiness,
  fetchBoqSupplierComparison,
  fetchBoqWorkbookImport,
  fetchSupplierQuoteMatch,
  markBoqImportReviewed,
  rejectSupplierQuoteMatchProposal,
  runSupplierQuoteBoqMatch,
  updateSplitPurchaseProposal,
  type BoqExportReadinessDetail,
  type BoqSupplierComparisonDetail,
  type BoqWorkbookImportDetail,
  type SplitPurchaseProposalDetail,
  type SupplierQuoteMatchDetail,
} from '../../lib/boq-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canManageFinance, newFinanceClientActionId } from '../../features/finance/utils';

export function BoqImportDetailPage() {
  const [, params] = useRoute('/finance/boq-imports/:id');
  const id = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const canWrite = user ? canManageFinance(user.permissions) : false;
  const [detail, setDetail] = useState<BoqWorkbookImportDetail | null>(null);
  const [match, setMatch] = useState<SupplierQuoteMatchDetail | null>(null);
  const [comparison, setComparison] = useState<BoqSupplierComparisonDetail | null>(null);
  const [proposal, setProposal] = useState<SplitPurchaseProposalDetail | null>(null);
  const [exportReady, setExportReady] = useState<BoqExportReadinessDetail | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sheetFilter, setSheetFilter] = useState<string>('ALL');
  const [busy, setBusy] = useState(false);
  const [clientActionId] = useState(() => newFinanceClientActionId('sup-boq-match'));
  const [proposalActionId] = useState(() => newFinanceClientActionId('split-purchase'));
  const [exportActionId] = useState(() => newFinanceClientActionId('boq-export'));

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    try {
      const data = await fetchBoqWorkbookImport(accessToken, id);
      setDetail(data);
      setError(null);
      try {
        const cmp = await fetchBoqSupplierComparison(accessToken, id);
        setComparison(cmp);
        const next: Record<string, string> = {};
        for (const row of cmp.comparison.rows) {
          if (row.cheapestEligibleOfferKey) {
            next[row.boqImportRowId] = row.cheapestEligibleOfferKey;
          }
        }
        setSelections((prev) => (Object.keys(prev).length ? prev : next));
      } catch {
        setComparison(null);
      }
      try {
        const ready = await fetchBoqExportReadiness(accessToken, id, 'DRAFT_PREVIEW');
        setExportReady(ready);
      } catch {
        setExportReady(null);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load BOQ import');
    }
  }, [accessToken, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!detail) return [];
    if (sheetFilter === 'ALL') return detail.rows;
    return detail.rows.filter((r) => r.sheetName === sheetFilter);
  }, [detail, sheetFilter]);

  async function runFixtureMatch() {
    if (!accessToken || !detail) return;
    setBusy(true);
    setError(null);
    try {
      const itemRows = detail.rows.filter((r) => r.rowKind === 'ITEM' && r.itemCode);
      const supplierLines = itemRows.slice(0, 5).map((r, index) => ({
        clientKey: `fixture-${index}`,
        sourceLineOrder: index + 1,
        supplierSku: r.itemCode,
        description: r.description,
        unit: r.unit,
        quantity: r.quantity != null ? Number(r.quantity) : null,
        unitPriceCents: 1000 + index * 100,
        vatBasis: 'EXCLUSIVE' as const,
        currency: 'ZAR',
      }));
      if (!supplierLines.length) {
        setError('No ITEM rows with codes available for fixture supplier match');
        return;
      }
      const result = await runSupplierQuoteBoqMatch(accessToken, id, {
        originalFilename: 'fixture-supplier-quote.pdf',
        supplierName: 'Fixture Supplier',
        revisionLabel: 'Rev A',
        clientActionId,
        supplierLines,
      });
      setMatch(result);
      setSuccess(
        result.idempotentReplay
          ? 'Idempotent match replay'
          : `Match proposals: ${result.proposals.length}`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Supplier match failed');
    } finally {
      setBusy(false);
    }
  }

  async function proposalAct(proposalId: string, action: 'confirm' | 'reject') {
    if (!accessToken || !match) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'confirm') {
        await confirmSupplierQuoteMatchProposal(accessToken, match.import.id, proposalId);
      } else {
        await rejectSupplierQuoteMatchProposal(accessToken, match.import.id, proposalId);
      }
      const refreshed = await fetchSupplierQuoteMatch(accessToken, match.import.id);
      setMatch(refreshed);
      setSuccess(`Proposal ${action} ok (BOQ source unchanged)`);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : `Proposal ${action} failed`);
    } finally {
      setBusy(false);
    }
  }

  async function runExport(format: 'XLSX' | 'PDF', mode: 'DRAFT_PREVIEW' | 'REVIEWED_FINAL') {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const result = await exportReviewedBoq(accessToken, id, {
        format,
        mode,
        clientActionId: `${exportActionId}-${format}-${mode}`,
      });
      if (result.contentBase64) {
        const ext = format === 'XLSX' ? 'xlsx' : 'pdf';
        const label = mode === 'DRAFT_PREVIEW' ? 'draft-preview' : 'reviewed-final';
        downloadBase64File(
          result.contentBase64,
          `boq-export-${label}-v${result.export.importVersion}.${ext}`,
          result.export.mimeType,
        );
      }
      setSuccess(
        result.idempotentReplay
          ? `Idempotent ${format} export replay`
          : `${format} ${mode} export ready (${result.export.byteLength} bytes)`,
      );
      const ready = await fetchBoqExportReadiness(accessToken, id, mode);
      setExportReady(ready);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }

  async function markReviewed() {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await markBoqImportReviewed(accessToken, id);
      setSuccess('BOQ import marked REVIEWED (source rows unchanged)');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Mark reviewed failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraftProposal(markReviewed = false) {
    if (!accessToken || !comparison) return;
    setBusy(true);
    setError(null);
    try {
      const bodySelections = comparison.comparison.rows
        .filter((r) => selections[r.boqImportRowId])
        .map((r) => ({
          boqImportRowId: r.boqImportRowId,
          offerKey: selections[r.boqImportRowId]!,
          quantityProposed: r.quantity,
        }));
      if (!bodySelections.length) {
        setError('Select at least one supplier offer for the draft proposal');
        return;
      }
      let result: SplitPurchaseProposalDetail;
      if (proposal?.proposal.id) {
        result = await updateSplitPurchaseProposal(accessToken, proposal.proposal.id, {
          selections: bodySelections,
          status: markReviewed ? 'REVIEWED' : undefined,
        });
      } else {
        result = await createSplitPurchaseProposal(accessToken, id, {
          selections: bodySelections,
          clientActionId: proposalActionId,
          status: markReviewed ? 'REVIEWED' : undefined,
        });
      }
      setProposal(result);
      setSuccess(
        result.idempotentReplay
          ? 'Idempotent draft proposal replay (no PO created)'
          : `Draft split-purchase proposal saved · ${result.proposal.status}`,
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Draft proposal failed');
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return error ? <p className="form-error">{error}</p> : <LoadingState label="Loading…" />;
  }

  const imp = detail.import;

  return (
    <div className="finance-page">
      <PageHeader
        title={`BOQ import v${imp.importVersion}`}
        description={`${imp.originalFilename} · ${imp.status} · ${imp.revisionLabel ?? '—'}`}
      />
      <FinanceNav />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel title="Source / revision">
        <p>Hash: {imp.fileHashSha256.slice(0, 16)}…</p>
        <p>Sheets (order): {(imp.sheetOrder ?? []).join(' → ') || '—'}</p>
        <p className="page-muted">
          Row 99 BOQ source is immutable here. Supplier prices are evidence only — not catalogue /
          quote / Row 92 / Xero. Row 101 comparison does not create POs or bills.
        </p>
      </Panel>

      <Panel title="Reviewed BOQ export (Row 102)">
        <p className="page-muted">
          Reconstructs the client commercial sequence from Row 99. Formulas export as provenance
          text only (not recalculated). Supplier costs, margins, and split-purchase internals are
          excluded from customer-safe export.
        </p>
        {exportReady ? (
          <>
            <p>
              Source v{exportReady.provenance.importVersion}
              {exportReady.provenance.revisionLabel
                ? ` · ${exportReady.provenance.revisionLabel}`
                : ''}{' '}
              · {exportReady.provenance.status}
              {exportReady.provenance.hasNewerRevision ? ' · NEWER REVISION EXISTS' : ''}
            </p>
            <p className="page-muted">
              Draft preview allowed: {String(exportReady.readiness.allowed)} · Blockers:{' '}
              {exportReady.readiness.blockers.join(', ') || 'none'}
            </p>
            {(exportReady.readiness.auraNarrativeFacts ?? []).slice(0, 2).map((fact) => (
              <p key={fact} className="page-muted">
                {fact}
              </p>
            ))}
          </>
        ) : (
          <p className="page-muted">Export readiness unavailable.</p>
        )}
        {canWrite ? (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="button" disabled={busy} onClick={() => void markReviewed()}>
              Mark import reviewed
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void runExport('XLSX', 'DRAFT_PREVIEW')}
            >
              Draft XLSX preview
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void runExport('PDF', 'DRAFT_PREVIEW')}
            >
              Draft PDF preview
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void runExport('XLSX', 'REVIEWED_FINAL')}
            >
              Final XLSX export
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void runExport('PDF', 'REVIEWED_FINAL')}
            >
              Final PDF export
            </Button>
          </div>
        ) : null}
      </Panel>

      <Panel title="Supplier quote → BOQ matching (Row 100)">
        <p className="page-muted">
          Multi-signal matching only (SKU/code, description, unit, qty, pack). Sequence alone is
          rejected. Ambiguous/conflicting cases require human review.
        </p>
        {canWrite ? (
          <Button type="button" disabled={busy} onClick={() => void runFixtureMatch()}>
            Run structured supplier-line match (fixture)
          </Button>
        ) : null}
        {match ? (
          <div style={{ marginTop: 12 }}>
            <p>
              {match.import.originalFilename} · {match.import.supplierName ?? '—'} ·{' '}
              {match.import.status}
            </p>
            {(match.import.auraNarrativeFacts ?? []).slice(0, 3).map((fact) => (
              <p key={fact} className="page-muted">
                {fact}
              </p>
            ))}
            <ul>
              {match.proposals.map((p) => (
                <li key={p.id} style={{ marginBottom: 8 }}>
                  {p.matchState}
                  {p.supplierSku ? ` · SKU ${p.supplierSku}` : ''}
                  {p.description ? ` — ${p.description}` : ''}
                  {p.unitPriceCents != null ? ` · evidence price ${p.unitPriceCents}c` : ''}
                  {p.vatBasis ? ` · VAT ${p.vatBasis}` : ''}
                  {(p.signalsUsed ?? []).length ? ` · [${(p.signalsUsed ?? []).join(', ')}]` : ''}
                  {(p.warnings ?? []).length ? ` · warn: ${(p.warnings ?? []).join(', ')}` : ''}
                  {canWrite &&
                  !p.humanConfirmed &&
                  p.matchState !== 'REJECTED' &&
                  p.matchState !== 'UNMATCHED' &&
                  p.matchState !== 'CONFIRMED' ? (
                    <span>
                      {' '}
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => void proposalAct(p.id, 'confirm')}
                      >
                        Confirm
                      </Button>{' '}
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => void proposalAct(p.id, 'reject')}
                      >
                        Reject
                      </Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="page-muted">No supplier match run yet for this BOQ import.</p>
        )}
      </Panel>

      <Panel title="Supplier comparison + split purchasing (Row 101)">
        <p className="page-muted">
          Review-first comparison. Cheapest ranking is informational and never silently prefers
          substitutes, expired quotes, or unit/pack conflicts. Draft proposals only — no PO /
          bill / payment.
        </p>
        {comparison ? (
          <>
            {(comparison.comparison.auraNarrativeFacts ?? []).slice(0, 3).map((fact) => (
              <p key={fact} className="page-muted">
                {fact}
              </p>
            ))}
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table className="titan-table" style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>BOQ row</th>
                    <th>Supplier offer</th>
                    <th>Flags</th>
                    <th>Price / VAT</th>
                    <th>Confidence</th>
                    <th>Propose</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.comparison.rows.map((row) =>
                    row.offers.length === 0 ? (
                      <tr key={row.boqImportRowId}>
                        <td>
                          [{row.sheetName} r{row.originalRowNumber}] {row.itemCode ?? '—'}
                          {row.description ? ` — ${row.description}` : ''}
                        </td>
                        <td colSpan={4} className="page-muted">
                          MISSING supplier offer
                        </td>
                        <td>—</td>
                      </tr>
                    ) : (
                      row.offers.map((offer, idx) => (
                        <tr key={`${row.boqImportRowId}:${offer.offerKey}`}>
                          {idx === 0 ? (
                            <td rowSpan={row.offers.length}>
                              [{row.sheetName} r{row.originalRowNumber}] {row.itemCode ?? '—'}
                              {row.humanReviewRequired ? ' · review' : ''}
                              {row.cheapestEligibleOfferKey
                                ? ` · eligible cheapest=${row.cheapestEligibleOfferKey.slice(0, 8)}…`
                                : ''}
                            </td>
                          ) : null}
                          <td>
                            {offer.supplierName}
                            {offer.supplierDocumentRef ? ` · ${offer.supplierDocumentRef}` : ''}
                            {offer.supplierSku ? ` · SKU ${offer.supplierSku}` : ''}
                            {offer.isSubstitute ? ' · SUBSTITUTE' : ''}
                            {offer.validTo ? ` · valid ${offer.validTo}` : ''}
                            {offer.exclusions ? ` · excl: ${offer.exclusions}` : ''}
                          </td>
                          <td>{offer.mismatchFlags.join(', ') || '—'}</td>
                          <td>
                            {offer.unitPriceCents != null ? `${offer.unitPriceCents}c` : '—'}
                            {` · ${offer.vatBasis}`}
                            {offer.deliveryKnown
                              ? ` · del ${offer.deliveryCents ?? 0}c`
                              : ' · del unknown'}
                          </td>
                          <td>
                            {offer.matchState} · {offer.matchConfidenceScore}
                            {!offer.eligibleForAutoRank ? ' · not auto-rank' : ''}
                          </td>
                          <td>
                            <input
                              type="radio"
                              name={`sel-${row.boqImportRowId}`}
                              checked={selections[row.boqImportRowId] === offer.offerKey}
                              disabled={!canWrite}
                              onChange={() =>
                                setSelections((prev) => ({
                                  ...prev,
                                  [row.boqImportRowId]: offer.offerKey,
                                }))
                              }
                            />
                          </td>
                        </tr>
                      ))
                    ),
                  )}
                </tbody>
              </table>
            </div>
            {canWrite ? (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button type="button" disabled={busy} onClick={() => void saveDraftProposal(false)}>
                  Save draft split-purchase proposal
                </Button>
                <Button type="button" disabled={busy} onClick={() => void saveDraftProposal(true)}>
                  Mark proposal reviewed
                </Button>
              </div>
            ) : null}
            {proposal ? (
              <div style={{ marginTop: 12 }}>
                <p>
                  Proposal {proposal.proposal.status}
                  {proposal.proposal.totalsIncomplete
                    ? ' · totals incomplete (missing VAT/delivery stay unknown)'
                    : ''}
                </p>
                <p className="page-muted">
                  Subtotal{' '}
                  {proposal.proposal.supplierSubtotalCents != null
                    ? `${proposal.proposal.supplierSubtotalCents}c`
                    : 'unknown'}{' '}
                  · VAT{' '}
                  {proposal.proposal.vatCents != null
                    ? `${proposal.proposal.vatCents}c`
                    : 'unknown'}{' '}
                  · Delivery{' '}
                  {proposal.proposal.deliveryCents != null
                    ? `${proposal.proposal.deliveryCents}c`
                    : 'unknown'}{' '}
                  · Total{' '}
                  {proposal.proposal.totalProposedPurchasingCostCents != null
                    ? `${proposal.proposal.totalProposedPurchasingCostCents}c`
                    : 'unknown'}
                </p>
                <p className="page-muted">
                  PO created: {String(proposal.createsPurchaseOrder)} · Xero bill:{' '}
                  {String(proposal.createsXeroBill)} · BOQ mutated:{' '}
                  {String(proposal.mutatesBoqSource)}
                </p>
                <ul>
                  {proposal.lines.map((line) => (
                    <li key={line.id}>
                      {line.supplierName} · {line.offerKey.slice(0, 12)}…
                      {line.unitPriceCents != null ? ` · ${line.unitPriceCents}c` : ''}
                      {line.isSubstitute ? ' · SUBSTITUTE' : ''}
                      {(line.mismatchFlags ?? []).length
                        ? ` · [${(line.mismatchFlags as string[]).join(', ')}]`
                        : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="page-muted">
            Comparison unavailable (need finance access + Row 100 match evidence).
          </p>
        )}
      </Panel>

      <Panel title="Review warnings">
        {(imp.warnings ?? []).length ? (
          <ul>
            {(imp.warnings ?? []).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : (
          <p className="page-muted">No workbook-level warnings.</p>
        )}
      </Panel>

      <Panel title="Workbook rows (original order)">
        <label className="titan-input-group">
          <span className="titan-input-label">Sheet</span>
          <select
            className="titan-input"
            value={sheetFilter}
            onChange={(e) => setSheetFilter(e.target.value)}
          >
            <option value="ALL">All sheets</option>
            {(imp.sheetOrder ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <ul>
          {rows.map((row) => (
            <li key={row.id} style={{ marginBottom: 6 }}>
              [{row.sheetName} r{row.originalRowNumber}] {row.rowKind}
              {row.sectionLabel ? ` · § ${row.sectionLabel}` : ''}
              {row.itemCode ? ` · ${row.itemCode}` : ''}
              {row.description ? ` — ${row.description}` : ''}
              {row.unit ? ` · ${row.unit}` : ' · UNIT MISSING'}
              {row.quantity != null ? ` × ${row.quantity}` : ' · QTY MISSING'}
              {row.formulaText ? ` · formula=${row.formulaText}` : ''}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
