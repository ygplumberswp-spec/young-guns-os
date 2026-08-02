import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { OwnerWorkforceMember, OwnerWorkforceMemberStatus } from '@titan/shared';
import { YOUNG_GUNS_PAYROLL_RULES } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchOwnerWorkforceView } from '../../lib/owner-workforce-api';
import { useAuth } from '../../lib/auth-context';
import { canAccessOwnerWorkforce } from '../../features/workforce-intelligence/utils';
import { StatusBadge } from '../../components/ux';

const STATUS_LABELS: Record<OwnerWorkforceMemberStatus, string> = {
  working: 'Working',
  available: 'Available',
  travelling: 'Travelling',
  on_site: 'On site',
  off_duty: 'Off duty',
  leave: 'On leave',
};

function statusTone(status: OwnerWorkforceMemberStatus): 'info' | 'success' | 'warning' | 'neutral' {
  if (status === 'on_site' || status === 'working') return 'info';
  if (status === 'available') return 'success';
  if (status === 'travelling' || status === 'leave') return 'warning';
  return 'neutral';
}

function formatTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OwnerWorkforcePage() {
  const { accessToken, user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(formatTodayIso);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<Awaited<ReturnType<typeof fetchOwnerWorkforceView>> | null>(
    null,
  );

  const canView = useMemo(
    () => (user ? canAccessOwnerWorkforce(user.permissions) : false),
    [user],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchOwnerWorkforceView(accessToken, selectedDate);
        if (!cancelled) setView(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load owner workforce view',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, selectedDate]);

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader
          title="Owner workforce"
          description="You do not have permission to view the owner workforce dashboard."
        />
      </div>
    );
  }

  return (
    <div className="automation-page owner-workforce-page">
      <PageHeader
        title="Owner workforce"
        description="Attendance, jobs, vehicles, hours, overtime, leave, and certifications — real operational data only."
        actions={
          <div className="page-header-actions">
            <Link href="/workforce-intelligence">
              <Button variant="secondary">Workforce Intelligence</Button>
            </Link>
            <Link href="/workforce/day-timeline">
              <Button variant="secondary">Day timeline</Button>
            </Link>
            <Link href="/workforce/manager">
              <Button variant="secondary">Manager workspace</Button>
            </Link>
          </div>
        }
      />

      <label className="titan-input-group">
        <span className="titan-input-label">Date</span>
        <input
          type="date"
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.target.value)}
        />
      </label>

      {isLoading ? <p>Loading workforce view...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {view ? (
        <>
          <Panel
            title="Young Guns payroll rules"
            description="Applied to hour calculations where clock data exists"
          >
            <ul className="simple-list owner-workforce-rules">
              <li>
                Normal hours: {YOUNG_GUNS_PAYROLL_RULES.shiftStart}–
                {YOUNG_GUNS_PAYROLL_RULES.shiftEnd}
              </li>
              <li>Lunch deduction: {YOUNG_GUNS_PAYROLL_RULES.lunchDeductionMinutes} minutes</li>
              <li>Overtime after: {YOUNG_GUNS_PAYROLL_RULES.overtimeAfter}</li>
              <li>Saturday: all hours count as overtime</li>
              <li>Payroll changes require approval; corrections audited</li>
            </ul>
          </Panel>

          <div className="stat-grid">
            <StatCard label="Team today" value={String(view.summary.teamCount)} />
            <StatCard label="Checked in" value={String(view.summary.checkedInCount)} />
            <StatCard label="Missing check-in" value={String(view.summary.missingCheckInCount)} />
            <StatCard
              label="Overtime hours"
              value={view.summary.overtimeHoursTotal.toFixed(1)}
            />
            <StatCard
              label="Missing timesheets"
              value={String(view.summary.missingTimesheetsCount)}
            />
            <StatCard label="On leave" value={String(view.summary.onLeaveCount)} />
            <StatCard label="Delayed" value={String(view.summary.delayedCount)} />
            <StatCard
              label="Jobs completed"
              value={String(view.summary.jobsCompletedToday)}
            />
          </div>

          <p className="owner-workforce-disclaimer">{view.disclaimer}</p>

          <Panel title="Team roster" description={`${view.members.length} member(s) on ${view.date}`}>
            {view.members.length === 0 ? (
              <EmptyState
                title="No workforce members on the roster"
                description="Active team members appear here when registered. No demo payroll or timesheet data is shown."
              />
            ) : (
              <ul className="owner-workforce-roster">
                {view.members.map((member) => (
                  <OwnerWorkforceMemberRow key={member.userId} member={member} />
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}

function OwnerWorkforceMemberRow({ member }: { member: OwnerWorkforceMember }) {
  return (
    <li className="owner-workforce-roster__row">
      <div className="owner-workforce-roster__primary">
        <strong>{member.name}</strong>
        {member.roleName ? <span className="page-muted"> · {member.roleName}</span> : null}
        <p className="owner-workforce-roster__jobs">
          {member.currentJob
            ? `Now: ${member.currentJob.title}${member.currentJob.jobNumber ? ` (${member.currentJob.jobNumber})` : ''}`
            : 'No active job'}
          {member.nextJob ? ` · Next: ${member.nextJob.title}` : ''}
        </p>
        <p className="owner-workforce-roster__meta">
          {member.vehicle
            ? `Vehicle: ${member.vehicle.name} (${member.vehicle.licensePlate})`
            : 'No vehicle assigned'}
          {' · '}
          Hours: {member.hoursToday.standardHours.toFixed(1)} std /{' '}
          {member.hoursToday.overtimeHours.toFixed(1)} OT
          {member.hoursToday.saturdayOvertime ? ' (Saturday OT)' : ''}
          {' · '}
          Completed today: {member.jobsCompletedToday}
        </p>
        {member.certifications.length > 0 ? (
          <p className="owner-workforce-roster__certs">
            Certifications:{' '}
            {member.certifications
              .map((cert) =>
                cert.isExpiringSoon ? `${cert.name} (expiring soon)` : cert.name,
              )
              .join(', ')}
          </p>
        ) : (
          <p className="page-muted">No certifications on file</p>
        )}
      </div>
      <div className="owner-workforce-roster__badges">
        <StatusBadge tone={statusTone(member.status)} label={STATUS_LABELS[member.status]} />
        {member.attendance.missingCheckIn ? (
          <StatusBadge tone="warning" label="Missing check-in" />
        ) : null}
        {member.attendance.checkedIn ? (
          <StatusBadge tone="success" label="Checked in" />
        ) : null}
        {member.isDelayed ? <StatusBadge tone="warning" label="Delayed" /> : null}
        {member.missingTimesheet ? (
          <StatusBadge tone="warning" label="Missing timesheet" />
        ) : null}
      </div>
    </li>
  );
}
