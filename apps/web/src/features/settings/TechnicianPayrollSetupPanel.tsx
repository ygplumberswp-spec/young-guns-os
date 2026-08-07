import { FormEvent, useEffect, useState } from 'react';
import { Button, Input } from '@titan/ui';
import type { TechnicianPayrollProfileSummary, TechnicianPeriodWageBreakdown } from '@titan/shared';
import {
  DEFAULT_OVERTIME_DAILY_THRESHOLD_HOURS,
  DEFAULT_WORKING_DAYS_PER_WEEK,
  DEFAULT_WORKING_HOURS_PER_DAY,
  PAYROLL_SETUP_INCOMPLETE,
  deriveInternalHourlyCostCents,
  formatMoney,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  createTechnicianPayrollTerm,
  fetchTechnicianPayrollProfile,
  fetchTechnicianPeriodWages,
} from '../../lib/team-api';

export type TechnicianPayrollSetupPanelProps = {
  accessToken: string;
  memberId: string;
  memberName: string;
  onUpdated?: () => void;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function monthBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

export function TechnicianPayrollSetupPanel(props: TechnicianPayrollSetupPanelProps) {
  const { accessToken, memberId, memberName, onUpdated } = props;
  const [profile, setProfile] = useState<TechnicianPayrollProfileSummary | null>(null);
  const [wages, setWages] = useState<TechnicianPeriodWageBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [monthlySalaryRands, setMonthlySalaryRands] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(todayIsoDate());
  const [workingDaysPerWeek, setWorkingDaysPerWeek] = useState(String(DEFAULT_WORKING_DAYS_PER_WEEK));
  const [workingHoursPerDay, setWorkingHoursPerDay] = useState(String(DEFAULT_WORKING_HOURS_PER_DAY));
  const [otThreshold, setOtThreshold] = useState(String(DEFAULT_OVERTIME_DAILY_THRESHOLD_HOURS));
  const [otMultiplier, setOtMultiplier] = useState('1.5');
  const [payrollReference, setPayrollReference] = useState('');

  async function reload() {
    const next = await fetchTechnicianPayrollProfile(accessToken, memberId);
    setProfile(next);
    const bounds = monthBounds();
    setWages(await fetchTechnicianPeriodWages(accessToken, memberId, bounds.periodStart, bounds.periodEnd));
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchTechnicianPayrollProfile(accessToken, memberId);
        if (cancelled) return;
        setProfile(next);
        const bounds = monthBounds();
        setWages(
          await fetchTechnicianPeriodWages(accessToken, memberId, bounds.periodStart, bounds.periodEnd),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load payroll');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, memberId]);

  const previewHourly = (() => {
    const salaryCents = Math.round(Number(monthlySalaryRands) * 100);
    if (!Number.isFinite(salaryCents) || salaryCents <= 0) return null;
    return deriveInternalHourlyCostCents(salaryCents, {
      workingDaysPerWeek: Number(workingDaysPerWeek) || DEFAULT_WORKING_DAYS_PER_WEEK,
      workingHoursPerDay: Number(workingHoursPerDay) || DEFAULT_WORKING_HOURS_PER_DAY,
    });
  })();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const monthlySalaryCents = Math.round(Number(monthlySalaryRands) * 100);
      const multiplier = Number(otMultiplier);
      await createTechnicianPayrollTerm(accessToken, memberId, {
        monthlySalaryCents,
        effectiveFrom,
        workingDaysPerWeek: Number(workingDaysPerWeek),
        workingHoursPerDay: Number(workingHoursPerDay),
        overtimeDailyThresholdHours: Number(otThreshold),
        overtimeMultiplierBps: Math.round((Number.isFinite(multiplier) ? multiplier : 1.5) * 10_000),
        payrollReference: payrollReference.trim() || null,
      });
      setMonthlySalaryRands('');
      await reload();
      onUpdated?.();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save payroll term');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="technician-payroll-panel">
      <h3 className="settings-section__title">Payroll — {memberName}</h3>
      <p className="page-muted">
        Monthly salary is private payroll expense. Job labour cost is an allocation for profitability —
        never counted twice as a company expense.
      </p>

      {profile?.setupStatus === 'incomplete' ? (
        <p className="settings-alert settings-alert--error" role="status">
          {profile.setupLabel ?? PAYROLL_SETUP_INCOMPLETE}
        </p>
      ) : null}

      {profile?.currentTerm ? (
        <dl className="technician-payroll-panel__summary">
          <div>
            <dt>Current monthly salary</dt>
            <dd>{formatMoney(profile.currentTerm.monthlySalaryCents)}</dd>
          </div>
          <div>
            <dt>Effective from</dt>
            <dd>{profile.currentTerm.effectiveFrom}</dd>
          </div>
          <div>
            <dt>Derived hourly labour cost</dt>
            <dd>{formatMoney(profile.currentTerm.derivedHourlyCostCents)} / hour</dd>
          </div>
          <div>
            <dt>Working calendar</dt>
            <dd>
              {profile.currentTerm.workingDaysPerWeek} days × {profile.currentTerm.workingHoursPerDay}{' '}
              h
            </dd>
          </div>
        </dl>
      ) : null}

      {wages ? (
        <div className="technician-payroll-panel__wages">
          <h4>This month (timer-based)</h4>
          {wages.setupStatus === 'incomplete' ? (
            <p className="settings-alert settings-alert--error">{wages.setupLabel}</p>
          ) : (
            <ul className="portal-list">
              <li>
                <strong>Normal hours</strong>
                <span>{wages.normalHours.toFixed(2)} h</span>
              </li>
              <li>
                <strong>Overtime hours</strong>
                <span>{wages.overtimeHours.toFixed(2)} h</span>
              </li>
              <li>
                <strong>Overtime amount</strong>
                <span>{formatMoney(wages.overtimeAmountCents ?? 0)}</span>
              </li>
              <li>
                <strong>Total wages (payroll)</strong>
                <span>{formatMoney(wages.totalWagesCents ?? 0)}</span>
              </li>
              <li>
                <strong>Job labour allocation (JPE)</strong>
                <span>{formatMoney(wages.jobLabourAllocationCents ?? 0)}</span>
              </li>
            </ul>
          )}
        </div>
      ) : null}

      <form className="settings-form" onSubmit={(e) => void handleSubmit(e)}>
        <h4>{profile?.currentTerm ? 'Effective-dated pay change' : 'Set monthly salary'}</h4>
        <div className="settings-grid">
          <Input
            label="Monthly salary (R)"
            type="number"
            min="1"
            step="0.01"
            value={monthlySalaryRands}
            onChange={(e) => setMonthlySalaryRands(e.target.value)}
            required
          />
          <Input
            label="Effective from"
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            required
          />
          <Input
            label="Working days / week"
            type="number"
            min="1"
            max="7"
            step="0.5"
            value={workingDaysPerWeek}
            onChange={(e) => setWorkingDaysPerWeek(e.target.value)}
            required
          />
          <Input
            label="Working hours / day"
            type="number"
            min="1"
            max="24"
            step="0.25"
            value={workingHoursPerDay}
            onChange={(e) => setWorkingHoursPerDay(e.target.value)}
            required
          />
          <Input
            label="OT daily threshold (hours)"
            type="number"
            min="1"
            max="24"
            step="0.25"
            value={otThreshold}
            onChange={(e) => setOtThreshold(e.target.value)}
            required
          />
          <Input
            label="OT multiplier"
            type="number"
            min="1"
            max="5"
            step="0.1"
            value={otMultiplier}
            onChange={(e) => setOtMultiplier(e.target.value)}
            required
          />
          <Input
            label="Payroll reference (optional)"
            value={payrollReference}
            onChange={(e) => setPayrollReference(e.target.value)}
          />
        </div>
        {previewHourly != null ? (
          <p className="page-muted">
            Derived internal hourly labour cost: {formatMoney(previewHourly)} / hour (allocation only)
          </p>
        ) : null}
        {error ? <p className="settings-alert settings-alert--error">{error}</p> : null}
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : profile?.currentTerm ? 'Save pay change' : 'Save payroll setup'}
        </Button>
      </form>

      {profile && profile.terms.length > 1 ? (
        <div className="technician-payroll-panel__history">
          <h4>Salary history</h4>
          <ul className="portal-list">
            {profile.terms.map((term) => (
              <li key={term.id}>
                <strong>{formatMoney(term.monthlySalaryCents)}</strong>
                <span>
                  {term.effectiveFrom}
                  {term.effectiveTo ? ` → ${term.effectiveTo}` : ' → current'} ·{' '}
                  {formatMoney(term.derivedHourlyCostCents)}/h
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
