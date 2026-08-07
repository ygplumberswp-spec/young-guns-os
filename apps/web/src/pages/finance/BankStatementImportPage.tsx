import { useMemo, useState } from 'react';
import { PageLoadState, Panel } from '@titan/ui';
import {
  BANK_STATEMENT_MAX_FILE_BYTES,
  BANK_STATEMENT_ROW_CLASSIFICATION_LABELS,
  BANK_STATEMENT_SUPPORTED_FORMATS,
  canManageBankStatementImport,
  canViewBankStatementImport,
  formatMoney,
  type BankStatementColumnMapping,
  type BankStatementImportPreview,
} from '@titan/shared';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { FinancePageHeader } from '../../features/finance/FinancePageHeader';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  approveBankStatementBatch,
  createBankStatementPreview,
  detectBankStatementHeaders,
  fetchBankStatementAccounts,
  fileToBase64,
  revertBankStatementBatch,
} from '../../lib/bank-statement-import-api';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';

type Step = 'select' | 'map' | 'preview' | 'done';

export function BankStatementImportPage() {
  const { accessToken, user } = useAuth();
  const [step, setStep] = useState<Step>('select');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<BankStatementColumnMapping | null>(null);
  const [preview, setPreview] = useState<BankStatementImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const identity = useMemo(
    () =>
      user
        ? { roleName: user.roleName, permissions: user.permissions }
        : { roleName: '', permissions: [] as string[] },
    [user],
  );
  const canView = canViewBankStatementImport(identity);
  const canManage = canManageBankStatementImport(identity);

  const { data: accounts, isLoading: accountsLoading } = useStaffCachedQuery({
    queryKey: 'finance/bank-statements/accounts',
    enabled: canView && Boolean(accessToken),
    fetcher: async () => fetchBankStatementAccounts(accessToken!),
  });

  async function handleFileChosen(file: File | null) {
    setError(null);
    setPreview(null);
    if (!file) {
      setSelectedFile(null);
      setStep('select');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only CSV bank statements are supported.');
      return;
    }
    if (file.size > BANK_STATEMENT_MAX_FILE_BYTES) {
      setError('File exceeds the maximum allowed size.');
      return;
    }

    setSelectedFile(file);
    setStep('select');

    if (!accessToken) return;
    try {
      setBusy(true);
      const base64 = await fileToBase64(file);
      const detected = await detectBankStatementHeaders(accessToken, base64);
      setHeaders(detected.headers);
      setColumnMapping(detected.suggestedMapping);
      setStep(detected.suggestedMapping ? 'select' : 'map');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read statement headers.');
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    if (!accessToken || !selectedFile || !selectedAccount || !columnMapping) return;
    setBusy(true);
    setError(null);
    try {
      const base64 = await fileToBase64(selectedFile);
      const result = await createBankStatementPreview(accessToken, {
        bankAccountCode: selectedAccount,
        filename: selectedFile.name,
        mimeType: selectedFile.type || 'text/csv',
        contentBase64: base64,
        columnMapping,
      });
      setPreview(result);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (!accessToken || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const result = await approveBankStatementBatch(accessToken, preview.batchId);
      setPreview(result);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevert() {
    if (!accessToken || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const result = await revertBankStatementBatch(accessToken, preview.batchId);
      setPreview(result);
      setStep('select');
      setSelectedFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revert failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return (
      <div className="finance-page">
        <PageHeader
          title="Import bank statement"
          description="You do not have permission to import bank statements."
        />
      </div>
    );
  }

  return (
    <div className="finance-page">
      <FinancePageHeader canWrite={canManage} />
      <FinanceNav />

      <Panel title="Import bank statement">
        <p className="finance-help-text">
          Upload a CSV bank statement for preview and Owner approval. Rows enter the review queue as{' '}
          <strong>Imported — awaiting review</strong>. They are never automatically marked paid,
          reconciled, or posted to Xero.
        </p>

        <p className="finance-help-text">
          Supported formats:{' '}
          {BANK_STATEMENT_SUPPORTED_FORMATS.map((format) => format.label).join(', ')}
        </p>

        {error ? <p className="finance-error">{error}</p> : null}

        <div className="finance-toolbar">
          <label className="finance-field">
            <span>Bank account</span>
            <select
              className="titan-input"
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              disabled={!canManage || accountsLoading}
            >
              <option value="">Select account…</option>
              {(accounts ?? []).map((account) => (
                <option key={account.code} value={account.code}>
                  {account.name} ({account.code})
                </option>
              ))}
            </select>
          </label>

          <label className="finance-field">
            <span>Statement file (CSV)</span>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={!canManage || !selectedAccount}
              onChange={(e) => void handleFileChosen(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {step === 'map' && headers.length > 0 ? (
          <div className="finance-toolbar">
            <h3>Map columns</h3>
            {(['date', 'amount', 'description', 'reference'] as const).map((field) => (
              <label key={field} className="finance-field">
                <span>{field}</span>
                <select
                  className="titan-input"
                  value={columnMapping?.[field] ?? ''}
                  onChange={(e) =>
                    setColumnMapping((current) => ({
                      date: current?.date ?? '',
                      amount: current?.amount ?? '',
                      description: current?.description,
                      reference: current?.reference,
                      [field]: e.target.value,
                    }))
                  }
                >
                  <option value="">Select column…</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button
              type="button"
              className="titan-button titan-button--primary"
              disabled={!columnMapping?.date || !columnMapping?.amount || busy}
              onClick={() => void runPreview()}
            >
              Run dry-run preview
            </button>
          </div>
        ) : null}

        {step === 'select' && selectedFile && columnMapping && !preview ? (
          <button
            type="button"
            className="titan-button titan-button--primary"
            disabled={busy}
            onClick={() => void runPreview()}
          >
            Run dry-run preview
          </button>
        ) : null}

        <PageLoadState isLoading={busy} error={null} isEmpty={false}>
          {preview ? (
            <div className="bank-statement-preview">
              <h3>Dry-run preview — batch {preview.batchId.slice(0, 8)}</h3>
              <p>
                Checksum: <code>{preview.fileChecksumSha256.slice(0, 12)}…</code> ·{' '}
                {preview.rowCount} rows · Status: {preview.status}
              </p>

              <ul className="bank-statement-summary">
                {Object.entries(preview.summary).map(([key, count]) =>
                  count > 0 ? (
                    <li key={key}>
                      {BANK_STATEMENT_ROW_CLASSIFICATION_LABELS[key as keyof typeof preview.summary]}:{' '}
                      {count}
                    </li>
                  ) : null,
                )}
              </ul>

              <div className="finance-table-wrap">
                <table className="finance-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Reference</th>
                      <th>Description</th>
                      <th>Classification</th>
                      <th>Suggested match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.rowIndex}>
                        <td>{row.rowIndex + 1}</td>
                        <td>{row.transactionDate ?? '—'}</td>
                        <td>
                          {row.amountCents !== null
                            ? formatMoney(row.amountCents, row.currency)
                            : '—'}
                        </td>
                        <td>{row.reference ?? '—'}</td>
                        <td>{row.description ?? '—'}</td>
                        <td>{row.classificationLabel}</td>
                        <td>{row.suggestedMatchLabel ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {canManage && preview.status === 'preview_ready' ? (
                <div className="finance-toolbar">
                  <button
                    type="button"
                    className="titan-button titan-button--primary"
                    disabled={busy}
                    onClick={() => void handleApprove()}
                  >
                    Owner approve import
                  </button>
                  <button
                    type="button"
                    className="titan-button"
                    disabled={busy}
                    onClick={() => void handleRevert()}
                  >
                    Revert unconfirmed batch
                  </button>
                </div>
              ) : null}

              {step === 'done' ? (
                <p className="finance-help-text">
                  Import batch approved. Rows remain{' '}
                  <strong>Imported — awaiting review</strong> until formal Xero reconciliation.
                </p>
              ) : null}
            </div>
          ) : null}
        </PageLoadState>
      </Panel>
    </div>
  );
}
