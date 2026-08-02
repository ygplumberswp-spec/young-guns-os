import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';
import type { JobDetail, JobExecutionSummary } from '@titan/shared';
import {
  COC_FORM_FIELD_SECTIONS,
  DEFAULT_YG_COC_SETTINGS,
  resolveCocApplicabilityForJobType,
} from '@titan/shared';

type JobCompliancePanelProps = {
  job: JobDetail;
  execution: JobExecutionSummary | null;
};

function formatCocApplicability(value: ReturnType<typeof resolveCocApplicabilityForJobType>): string {
  switch (value) {
    case 'required_for_gas_work':
      return 'Required for gas / geyser work';
    case 'required_for_electrical_work':
      return 'Required for electrical work';
    case 'may_apply':
      return 'May apply — classify before completion';
    case 'pending_classification':
      return 'Pending classification';
    default:
      return value;
  }
}

function readSnapshotField(
  execution: JobExecutionSummary | null,
  field: string,
): string | null {
  const snapshot = execution?.completionSnapshot?.snapshot;
  if (!snapshot || typeof snapshot !== 'object') return null;
  const value = (snapshot as Record<string, unknown>)[field];
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}

export function JobCompliancePanel({ job, execution }: JobCompliancePanelProps) {
  const suggested = resolveCocApplicabilityForJobType(job.jobType, DEFAULT_YG_COC_SETTINGS);
  const cocGatePending = execution?.completionGate.missing.includes('coc_classification') ?? false;
  const isComplete = job.status === 'completed';
  const cocClassification = readSnapshotField(execution, 'cocRequired');
  const outstandingDefects = readSnapshotField(execution, 'outstandingDefects');
  const workPerformed = readSnapshotField(execution, 'workPerformedSummary');
  const cocDocuments = job.documents.filter((doc) =>
    /coc|certificate|compliance/i.test(`${doc.title} ${doc.fileName}`),
  );

  return (
    <Panel
      title="COC / compliance"
      description="Classification guidance from company defaults — TITAN does not auto-issue a Certificate of Compliance."
    >
      <p className="page-muted documents-compliance-disclaimer">
        TITAN supports authorised plumbers and document tracking. It does not issue Certificates of
        Compliance or replace legal/professional responsibility.
      </p>

      <dl className="jobs-detail-list">
        <div>
          <dt>Job type</dt>
          <dd>{job.jobType || '—'}</dd>
        </div>
        <div>
          <dt>Company default</dt>
          <dd>{formatCocApplicability(suggested)}</dd>
        </div>
        <div>
          <dt>Field classification</dt>
          <dd>
            {cocClassification
              ? cocClassification.replace(/_/g, ' ')
              : isComplete
                ? cocGatePending
                  ? 'Pending classification at completion'
                  : 'Recorded at completion'
                : cocGatePending
                  ? 'Awaiting technician classification'
                  : execution
                    ? 'Ready — no COC gate blocking completion'
                    : 'Not started'}
          </dd>
        </div>
        {workPerformed ? (
          <div>
            <dt>Work performed (snapshot)</dt>
            <dd>{workPerformed}</dd>
          </div>
        ) : null}
        {outstandingDefects ? (
          <div>
            <dt>Correction / follow-up</dt>
            <dd>{outstandingDefects}</dd>
          </div>
        ) : null}
        <div>
          <dt>Reference</dt>
          <dd className="page-muted">{DEFAULT_YG_COC_SETTINGS.sansReferenceNote}</dd>
        </div>
      </dl>

      <Panel title="COC field checklist (authorised plumber)" description="Guidance only — capture on the issued certificate and upload the final PDF.">
        <ul className="documents-coc-field-list">
          {COC_FORM_FIELD_SECTIONS.map((section) => (
            <li key={section.key}>
              <strong>{section.label}</strong>
              <span className="page-muted"> — {section.description}</span>
            </li>
          ))}
        </ul>
      </Panel>

      {cocDocuments.length === 0 ? (
        <p className="page-muted">
          Link COC or compliance documents to this job when received from the qualified installer.
        </p>
      ) : (
        <ul className="jobs-doc-list">
          {cocDocuments.map((doc) => (
            <li key={doc.id}>
              <Link href={`/documents/${doc.id}`} className="jobs-link">
                {doc.title}
              </Link>{' '}
              <span className="page-muted">({doc.fileName})</span>
            </li>
          ))}
        </ul>
      )}
      <div className="jobs-form__actions">
        <Link href={`/documents/new?jobId=${job.id}`}>
          <Button variant="secondary">Upload compliance document</Button>
        </Link>
      </div>
    </Panel>
  );
}
