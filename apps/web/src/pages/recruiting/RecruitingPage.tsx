import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, Input, PageHeader, Panel } from '@titan/ui';
import type {
  RecruitingApplicationSummary,
  RecruitingCandidateSummary,
  RecruitingStatus,
} from '@titan/shared';
import { RECRUITING_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  createRecruitingApplication,
  createRecruitingCandidate,
  fetchRecruitingApplications,
  fetchRecruitingCandidates,
  fetchRecruitingStats,
  updateRecruitingApplication,
  updateRecruitingCandidate,
} from '../../lib/recruiting-api';
import { useAuth } from '../../lib/auth-context';

function formatStatus(status: RecruitingStatus): string {
  return RECRUITING_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function RecruitingPage() {
  const { accessToken, user } = useAuth();
  const [candidates, setCandidates] = useState<RecruitingCandidateSummary[]>([]);
  const [applications, setApplications] = useState<RecruitingApplicationSummary[]>([]);
  const [stats, setStats] = useState({
    candidateCount: 0,
    applicationCount: 0,
    newCount: 0,
    interviewCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [notes, setNotes] = useState('');

  const canWrite = useMemo(
    () =>
      user
        ? user.permissions.includes('recruiting:write') || user.permissions.includes('*')
        : false,
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    const [candidateRows, applicationRows, statRows] = await Promise.all([
      fetchRecruitingCandidates(accessToken),
      fetchRecruitingApplications(accessToken),
      fetchRecruitingStats(accessToken),
    ]);
    setCandidates(candidateRows);
    setApplications(applicationRows);
    setStats(statRows);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        await loadPage();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load recruiting data');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleCreateCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite) return;

    setError(null);
    setSuccess(null);

    try {
      await createRecruitingCandidate(accessToken, {
        name,
        email: email.trim() || null,
        phone: phone.trim() || null,
        roleTitle: roleTitle.trim() || null,
        notes: notes.trim() || null,
      });
      setName('');
      setEmail('');
      setPhone('');
      setRoleTitle('');
      setNotes('');
      setSuccess('Candidate created.');
      await loadPage();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create candidate');
    }
  }

  async function handleCandidateStatusChange(candidateId: string, status: RecruitingStatus) {
    if (!accessToken || !canWrite) return;

    try {
      await updateRecruitingCandidate(accessToken, candidateId, { status });
      await loadPage();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update candidate');
    }
  }

  async function handleApplicationStatusChange(applicationId: string, status: RecruitingStatus) {
    if (!accessToken || !canWrite) return;

    try {
      await updateRecruitingApplication(accessToken, applicationId, { status });
      await loadPage();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update application');
    }
  }

  async function handleCreateApplication(candidateId: string, candidateRole: string | null) {
    if (!accessToken || !canWrite) return;

    const role = candidateRole?.trim() || 'Open role';

    try {
      await createRecruitingApplication(accessToken, { candidateId, roleTitle: role });
      setSuccess('Application recorded.');
      await loadPage();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create application');
    }
  }

  if (isLoading) {
    return <p className="page-muted">Loading recruiting…</p>;
  }

  return (
    <div className="recruiting-page">
      <PageHeader
        title="Recruiting"
        description="Track candidates, applications, and hiring pipeline status."
        actions={
          <Link href="/aura">
            <Button variant="secondary">Ask AURA</Button>
          </Link>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel title="Pipeline">
        <dl className="integrations-detail-list">
          <div>
            <dt>Candidates</dt>
            <dd>{stats.candidateCount}</dd>
          </div>
          <div>
            <dt>Applications</dt>
            <dd>{stats.applicationCount}</dd>
          </div>
          <div>
            <dt>New</dt>
            <dd>{stats.newCount}</dd>
          </div>
          <div>
            <dt>In interview</dt>
            <dd>{stats.interviewCount}</dd>
          </div>
        </dl>
      </Panel>

      {canWrite ? (
        <Panel title="Add candidate">
          <form className="crm-form" onSubmit={(event) => void handleCreateCandidate(event)}>
            <Input
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input label="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
            <Input
              label="Role title"
              value={roleTitle}
              onChange={(event) => setRoleTitle(event.target.value)}
            />
            <label className="titan-input-group">
              <span className="titan-input-label">Notes</span>
              <textarea
                className="titan-input crm-textarea"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            <Button type="submit" disabled={!name.trim()}>
              Create candidate
            </Button>
          </form>
        </Panel>
      ) : null}

      <Panel title="Candidates">
        {candidates.length === 0 ? (
          <p className="page-muted">No candidates yet.</p>
        ) : (
          <ul className="recruiting-list">
            {candidates.map((candidate) => (
              <li key={candidate.id} className="recruiting-list__item">
                <div>
                  <strong>{candidate.name}</strong>
                  <p className="page-muted">
                    {candidate.roleTitle ?? 'No role'} · {formatStatus(candidate.status)}
                    {candidate.email ? ` · ${candidate.email}` : ''}
                  </p>
                  {candidate.notes ? <p>{candidate.notes}</p> : null}
                </div>
                {canWrite ? (
                  <div className="recruiting-list__actions">
                    <select
                      className="titan-input"
                      value={candidate.status}
                      onChange={(event) =>
                        void handleCandidateStatusChange(
                          candidate.id,
                          event.target.value as RecruitingStatus,
                        )
                      }
                    >
                      {RECRUITING_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        void handleCreateApplication(candidate.id, candidate.roleTitle)
                      }
                    >
                      Add application
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Applications">
        {applications.length === 0 ? (
          <p className="page-muted">No applications yet.</p>
        ) : (
          <ul className="recruiting-list">
            {applications.map((application) => (
              <li key={application.id} className="recruiting-list__item">
                <div>
                  <strong>{application.candidateName}</strong>
                  <p className="page-muted">
                    {application.roleTitle} · {formatStatus(application.status)}
                  </p>
                  {application.notes ? <p>{application.notes}</p> : null}
                </div>
                {canWrite ? (
                  <select
                    className="titan-input"
                    value={application.status}
                    onChange={(event) =>
                      void handleApplicationStatusChange(
                        application.id,
                        event.target.value as RecruitingStatus,
                      )
                    }
                  >
                    {RECRUITING_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
