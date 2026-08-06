import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';
import type { JobDetail, JobExecutionSummary } from '@titan/shared';
import {
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

export function JobCompliancePanel({ job, execution }: JobCompliancePanelProps) {
  const suggested = resolveCocApplicabilityForJobType(job.jobType, DEFAULT_YG_COC_SETTINGS);
  const cocGatePending = execution?.completionGate.missing.includes('coc_classification') ?? false;
  const isComplete = job.status === 'completed';

  return (
    <Panel
      title="COC / Compliance"
      description="Classification guidance from company defaults — TITAN does not auto-issue a Certificate of Compliance."
    >
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
            {isComplete
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
        <div>
          <dt>Reference</dt>
          <dd className="page-muted">{DEFAULT_YG_COC_SETTINGS.sansReferenceNote}</dd>
        </div>
      </dl>
      {job.documents.length === 0 ? (
        <p className="page-muted">
          Link COC or compliance documents to this job when received from the qualified installer.
        </p>
      ) : (
        <ul className="jobs-doc-list">
          {job.documents
            .filter((doc) => /coc|certificate|compliance/i.test(`${doc.title} ${doc.fileName}`))
            .map((doc) => (
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
          <Button variant="secondary">Upload Compliance Document</Button>
        </Link>
      </div>
    </Panel>
  );
}
