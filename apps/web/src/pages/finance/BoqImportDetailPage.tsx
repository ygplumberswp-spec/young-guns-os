import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRoute } from 'wouter';
import { PageHeader } from '../../components/ux';
import { Button, LoadingState, Panel } from '@titan/ui';
import { ApiClientError } from '../../lib/api-client';
import {
  confirmSupplierQuoteMatchProposal,
  fetchBoqWorkbookImport,
  fetchSupplierQuoteMatch,
  rejectSupplierQuoteMatchProposal,
  runSupplierQuoteBoqMatch,
  type BoqWorkbookImportDetail,
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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sheetFilter, setSheetFilter] = useState<string>('ALL');
  const [busy, setBusy] = useState(false);
  const [clientActionId] = useState(() => newFinanceClientActionId('sup-boq-match'));

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    try {
      const data = await fetchBoqWorkbookImport(accessToken, id);
      setDetail(data);
      setError(null);
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
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : `Proposal ${action} failed`);
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
          quote / Row 92 / Xero.
        </p>
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
