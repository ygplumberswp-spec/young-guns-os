import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRoute } from 'wouter';
import { PageHeader } from '../../components/ux';
import { LoadingState, Panel } from '@titan/ui';
import { ApiClientError } from '../../lib/api-client';
import { fetchBoqWorkbookImport, type BoqWorkbookImportDetail } from '../../lib/boq-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';

export function BoqImportDetailPage() {
  const [, params] = useRoute('/finance/boq-imports/:id');
  const id = params?.id ?? '';
  const { accessToken } = useAuth();
  const [detail, setDetail] = useState<BoqWorkbookImportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetFilter, setSheetFilter] = useState<string>('ALL');

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

      <Panel title="Source / revision">
        <p>Hash: {imp.fileHashSha256.slice(0, 16)}…</p>
        <p>Sheets (order): {(imp.sheetOrder ?? []).join(' → ') || '—'}</p>
        <p className="page-muted">
          No automatic pricing. No supplier matching. Formulas are text-only evidence.
        </p>
        {(imp.auraNarrativeFacts ?? []).slice(0, 4).map((fact) => (
          <p key={fact} className="page-muted">
            {fact}
          </p>
        ))}
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
              {row.displayValue && row.formulaText ? ` (cached ${row.displayValue})` : ''}
              {(row.warnings ?? []).length ? ` · ${(row.warnings ?? []).join(', ')}` : ''}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
