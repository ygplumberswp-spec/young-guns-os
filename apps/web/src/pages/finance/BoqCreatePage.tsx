import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, Input, PageHeader } from '@titan/ui';
import type { BoqLineInput, CustomerSummary, JobSummary } from '@titan/shared';
import { parseBoqImportText } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { createBoqDocument } from '../../lib/boq-api';
import { fetchCustomers } from '../../lib/crm-api';
import { fetchJobs } from '../../lib/jobs-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canManageFinance, newFinanceClientActionId } from '../../features/finance/utils';

type DraftLine = BoqLineInput & { key: string };

function newLine(): DraftLine {
  return {
    key: `line-${Date.now()}`,
    description: '',
    quantity: 1,
    section: null,
    itemNumber: null,
    unit: null,
    unitCostCents: null,
  };
}

export function BoqCreatePage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [jobId, setJobId] = useState('');
  const [title, setTitle] = useState('');
  const [sourceFilename, setSourceFilename] = useState('');
  const [importText, setImportText] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [clientActionId] = useState(() => newFinanceClientActionId('boq'));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageFinance(user.permissions) : false;

  useEffect(() => {
    if (user && !canWrite) navigate('/finance/boq');
  }, [canWrite, navigate, user]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }
      try {
        const [customerData, jobData] = await Promise.all([
          fetchCustomers(accessToken),
          fetchJobs(accessToken),
        ]);
        if (!cancelled) {
          setCustomers(customerData);
          setJobs(jobData);
          setCustomerId(customerData[0]?.id ?? '');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load form data');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const customerJobs = jobs.filter((job) => job.customerId === customerId);

  function applyImport() {
    const parsed = parseBoqImportText(importText);
    if (!parsed.length) {
      setError('No BOQ lines found in import text');
      return;
    }
    setLines(
      parsed.map((line, index) => ({
        key: `import-${index}`,
        ...line,
      })),
    );
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canWrite) return;

    const validLines = lines.filter((line) => line.description.trim());
    if (!validLines.length) {
      setError('Add at least one BOQ line');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const document = await createBoqDocument(accessToken, {
        title: title.trim(),
        customerId: customerId || null,
        jobId: jobId || null,
        sourceFilename: sourceFilename.trim() || null,
        lineItems: validLines.map(({ key: _key, ...line }) => ({
          ...line,
          description: line.description.trim(),
        })),
        clientActionId,
      });
      navigate(`/finance/boq/${document.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create BOQ');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading form…</p>;

  return (
    <div className="finance-page">
      <PageHeader
        title="New BOQ"
        description="Capture tender or take-off line items. Import CSV/TSV or enter manually."
        actions={
          <Link href="/finance/boq">
            <Button variant="secondary">Back to BOQs</Button>
          </Link>
        }
      />
      <FinanceNav />
      {error ? <p className="form-error">{error}</p> : null}

      <form className="finance-form" onSubmit={(event) => void handleSubmit(event)}>
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <label className="titan-input-group">
          <span className="titan-input-label">Customer (optional)</span>
          <select className="titan-input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">No customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="titan-input-group">
          <span className="titan-input-label">Job (optional)</span>
          <select className="titan-input" value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">No linked job</option>
            {customerJobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Source filename (optional)"
          value={sourceFilename}
          onChange={(e) => setSourceFilename(e.target.value)}
          placeholder="client-boq.xlsx"
        />

        <label className="titan-input-group">
          <span className="titan-input-label">Import CSV / TSV</span>
          <textarea
            className="titan-input finance-textarea"
            rows={4}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="section,item_number,description,unit,quantity,unit_cost"
          />
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={applyImport}>
          Apply import to lines
        </Button>

        <div className="finance-line-items">
          {lines.map((line) => (
            <div className="finance-line-item-row" key={line.key}>
              <input
                className="titan-input"
                placeholder="Section"
                value={line.section ?? ''}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((row) =>
                      row.key === line.key ? { ...row, section: e.target.value || null } : row,
                    ),
                  )
                }
              />
              <input
                className="titan-input"
                placeholder="Item #"
                value={line.itemNumber ?? ''}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((row) =>
                      row.key === line.key ? { ...row, itemNumber: e.target.value || null } : row,
                    ),
                  )
                }
              />
              <input
                className="titan-input"
                placeholder="Description"
                value={line.description}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((row) =>
                      row.key === line.key ? { ...row, description: e.target.value } : row,
                    ),
                  )
                }
              />
              <input
                className="titan-input"
                placeholder="Unit"
                value={line.unit ?? ''}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((row) =>
                      row.key === line.key ? { ...row, unit: e.target.value || null } : row,
                    ),
                  )
                }
              />
              <input
                className="titan-input"
                placeholder="Qty"
                value={String(line.quantity)}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((row) =>
                      row.key === line.key
                        ? { ...row, quantity: Number.parseFloat(e.target.value) || 1 }
                        : row,
                    ),
                  )
                }
              />
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={() => setLines((prev) => [...prev, newLine()])}>
            Add line
          </Button>
        </div>

        <Button type="submit" disabled={isSaving || !title.trim()}>
          {isSaving ? 'Creating…' : 'Create BOQ'}
        </Button>
      </form>
    </div>
  );
}
