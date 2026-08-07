import { useEffect, useState } from 'react';
import { request } from '../../lib/api-client';

export type CocEvidenceOption = {
  id: string;
  fileName: string;
  title: string;
  mimeType: string;
  uploadedAt: string;
};

type Props = {
  accessToken: string;
  jobId: string;
  value: string | null;
  onChange: (documentationId: string | null) => void;
  disabled?: boolean;
};

export function FinanceCocEvidenceSelector({ accessToken, jobId, value, onChange, disabled }: Props) {
  const [options, setOptions] = useState<CocEvidenceOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!jobId) {
      setOptions([]);
      onChange(null);
      return;
    }

    void (async () => {
      try {
        const data = await request<{ evidence: CocEvidenceOption[] }>(
          `/finance/jobs/${jobId}/coc-evidence`,
          { accessToken },
        );
        if (!cancelled) {
          setOptions(data.evidence);
          setError(null);
          if (value && !data.evidence.some((item) => item.id === value)) {
            onChange(null);
          }
        }
      } catch {
        if (!cancelled) {
          setOptions([]);
          setError('Unable to load COC evidence for this job');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, jobId, onChange, value]);

  if (!jobId) {
    return <p className="finance-editor-hint">Link a job to attach genuine COC evidence.</p>;
  }

  return (
    <label className="titan-input-group finance-editor-field-group">
      <span className="titan-input-label">Certificate of Compliance evidence</span>
      <select
        id="finance-coc-evidence"
        className="titan-input finance-editor-field"
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">No COC attached</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.title || option.fileName}
          </option>
        ))}
      </select>
      {error ? <p className="form-error">{error}</p> : null}
      {options.length === 0 && !error ? (
        <p className="finance-editor-hint">
          No typed COC evidence found for this job. Upload job evidence with compliance metadata first.
        </p>
      ) : null}
    </label>
  );
}
