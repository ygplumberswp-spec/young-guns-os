import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, EmptyState, Input, LoadingState, Panel } from '@titan/ui';
import {
  SAAS_ONBOARDING_STEPS,
  SAAS_TRADE_TYPES,
  type SaasOnboardingState,
  type SaasOnboardingStepId,
  type SaasTradeType,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { ApiClientError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import {
  activateOnboarding,
  advanceOnboardingStep,
  completeOnboardingIntegrations,
  fetchOnboardingState,
  inviteOnboardingTeamMember,
  markOnboardingImport,
  saveOnboardingCompany,
  saveOnboardingOperations,
  selectOnboardingPlan,
  skipOnboardingIntegration,
} from '../../lib/saas-onboarding-api-client';
import { fetchTeamRoles } from '../../lib/team-api';

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'ZAR',
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(0)}`;
  }
}

function stepLabel(id: SaasOnboardingStepId) {
  return SAAS_ONBOARDING_STEPS.find((step) => step.id === id)?.label ?? id;
}

function checklistMark(state: string) {
  if (state === 'complete') return '✓';
  if (state === 'skipped') return '○';
  if (state === 'attention' || state === 'in_progress') return '⚠';
  return '○';
}

export function SaasOnboardingWizardPage() {
  const { accessToken } = useAuth();
  const [, setLocation] = useLocation();
  const [state, setState] = useState<SaasOnboardingState | null>(null);
  const [activeStep, setActiveStep] = useState<SaasOnboardingStepId>('company');
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);

  const [companyName, setCompanyName] = useState('');
  const [tradingName, setTradingName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [mainPhone, setMainPhone] = useState('');
  const [mainEmail, setMainEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [country, setCountry] = useState('South Africa');
  const [timezone, setTimezone] = useState('Africa/Johannesburg');
  const [currency, setCurrency] = useState('ZAR');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [tradeType, setTradeType] = useState<SaasTradeType | ''>('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviteMobile, setInviteMobile] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [showPayroll, setShowPayroll] = useState(false);
  const [monthlySalary, setMonthlySalary] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');

  const [opsTimezone, setOpsTimezone] = useState('Africa/Johannesburg');
  const [opsCurrency, setOpsCurrency] = useState('ZAR');
  const [hoursStart, setHoursStart] = useState('08:00');
  const [hoursEnd, setHoursEnd] = useState('17:00');
  const [techStart, setTechStart] = useState('08:00');
  const [vatEnabled, setVatEnabled] = useState(true);

  async function load() {
    if (!accessToken) return;
    const next = await fetchOnboardingState(accessToken);
    setState(next);
    setActiveStep(next.currentStep);
    setCompanyName(next.companyName);
    if (next.tradeType) setTradeType(next.tradeType);
    setOpsTimezone(timezone);
    setOpsCurrency(currency);
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }
      try {
        await load();
        const roleData = await fetchTeamRoles(accessToken);
        if (!cancelled) {
          setRoles(roleData.assignableRoles.map((role) => ({ id: role.id, name: role.name })));
          setInviteRoleId(roleData.assignableRoles[0]?.id ?? '');
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load company setup. Existing companies are not forced through this wizard.',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const selectedRoleName = useMemo(
    () => roles.find((role) => role.id === inviteRoleId)?.name ?? '',
    [roles, inviteRoleId],
  );

  async function run(action: () => Promise<SaasOnboardingState>) {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    try {
      const next = await action();
      setState(next);
      setActiveStep(next.currentStep);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleCompanySubmit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !companyName.trim()) return;
    await run(() =>
      saveOnboardingCompany(accessToken, {
        companyName: companyName.trim(),
        tradingName: tradingName || null,
        registrationNumber: registrationNumber || null,
        vatNumber: vatNumber || null,
        mainPhone: mainPhone || null,
        mainEmail: mainEmail || null,
        website: website || null,
        country: country || null,
        timezone: timezone || null,
        currency: currency || null,
        addressLine1: addressLine1 || null,
        city: city || null,
        region: region || null,
        postalCode: postalCode || null,
        tradeType: tradeType || null,
      }),
    );
  }

  async function handleInviteSubmit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !inviteEmail || !inviteRoleId) return;
    const isTechnician = selectedRoleName === 'Technician';
    await run(() =>
      inviteOnboardingTeamMember(accessToken, {
        email: inviteEmail.trim(),
        roleId: inviteRoleId,
        firstName: inviteFirstName || undefined,
        lastName: inviteLastName || undefined,
        mobile: inviteMobile || null,
        payrollSetup:
          isTechnician && showPayroll && monthlySalary && effectiveFrom
            ? {
                monthlySalaryCents: Math.round(Number(monthlySalary) * 100),
                effectiveFrom,
              }
            : null,
      }),
    );
    setInviteEmail('');
    setInviteFirstName('');
    setInviteLastName('');
    setInviteMobile('');
    setMonthlySalary('');
    setEffectiveFrom('');
    setShowPayroll(false);
  }

  if (isLoading) {
    return (
      <div className="onboarding-wizard">
        <LoadingState label="Loading company setup…" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="onboarding-wizard">
        <PageHeader
          title="Company setup"
          description="This wizard is for new SaaS customer companies. Existing Young Guns and platform-owner tenants stay untouched."
        />
        {error ? <p className="form-error">{error}</p> : null}
        <EmptyState
          title="Setup not available"
          description="Your company is not enrolled in plug-and-play onboarding."
        />
        <Link href="/">
          <Button variant="secondary">Go to TITAN</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="onboarding-wizard">
      <PageHeader
        title="Plug your business into TITAN"
        description="Create your company, choose a plan, invite your team, import data, and connect the apps you already use — no APIs or tenant IDs required."
      />

      <div className="onboarding-progress" aria-label="Setup progress">
        {SAAS_ONBOARDING_STEPS.map((step) => {
          const mark = checklistMark(state.checklist[step.id]);
          const isCurrent = activeStep === step.id;
          return (
            <button
              key={step.id}
              type="button"
              className={`onboarding-progress__step${isCurrent ? ' is-current' : ''}${
                mark === '✓' ? ' is-done' : ''
              }`}
              onClick={() => setActiveStep(step.id)}
            >
              <span className="onboarding-progress__index">{step.order}</span>
              <span className="onboarding-progress__label">{step.label}</span>
            </button>
          );
        })}
      </div>

      <p className="muted-text">
        {state.completionPercent}% complete · Saved automatically as you continue · Resume anytime
      </p>

      {error ? <p className="form-error">{error}</p> : null}

      {state.auraTips.length > 0 ? (
        <Panel title="AURA">
          <ul className="onboarding-aura-list">
            {state.auraTips.map((tip) => (
              <li key={tip.id} className={tip.severity === 'warning' ? 'is-warning' : ''}>
                {tip.message}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {activeStep === 'company' ? (
        <Panel title="1 · Company details">
          <form className="onboarding-form" onSubmit={handleCompanySubmit}>
            <div className="onboarding-form__grid">
              <Input
                label="Company name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
              <Input
                label="Trading name (if different)"
                value={tradingName}
                onChange={(e) => setTradingName(e.target.value)}
              />
              <Input
                label="Registration number"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
              />
              <Input
                label="VAT number"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
              />
              <Input
                label="Main phone"
                value={mainPhone}
                onChange={(e) => setMainPhone(e.target.value)}
              />
              <Input
                label="Main email"
                type="email"
                value={mainEmail}
                onChange={(e) => setMainEmail(e.target.value)}
              />
              <Input label="Website" value={website} onChange={(e) => setWebsite(e.target.value)} />
              <label className="field">
                <span className="field__label">Trade / business type</span>
                <select
                  value={tradeType}
                  onChange={(e) => setTradeType(e.target.value as SaasTradeType | '')}
                >
                  <option value="">Select trade type</option>
                  {SAAS_TRADE_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <Input label="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
              <Input
                label="Timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
              <Input
                label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              />
              <Input
                label="Street address"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
              />
              <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
              <Input label="Region" value={region} onChange={(e) => setRegion(e.target.value)} />
              <Input
                label="Postal code"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
              />
            </div>
            <p className="muted-text">
              Logo and document branding can be refined later in Company Settings — no separate PDF
              system.
            </p>
            <div className="page-header-actions">
              <Button type="submit" disabled={isWorking}>
                {isWorking ? 'Saving…' : 'SAVE & CONTINUE'}
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {activeStep === 'plan' ? (
        <Panel title="2 · Choose your TITAN plan">
          <p className="muted-text">
            Plans use the canonical TITAN package catalog. Flow:{' '}
            <strong>PLAN SELECTED → COMPLETE BILLING → VERIFYING PAYMENT → SUBSCRIPTION ACTIVE</strong>.
            Browser redirects never mark you paid.
          </p>
          {state.availablePlans.length === 0 ? (
            <EmptyState
              title="Plans not published yet"
              description="Ask your Platform Owner to seed canonical TITAN plans, then return here."
            />
          ) : (
            <div className="onboarding-plan-grid">
              {state.availablePlans.map((plan) => {
                const seats = plan.limits?.seats;
                const selected = state.plan?.id === plan.id;
                return (
                  <div
                    key={plan.id}
                    className={`onboarding-plan-card${selected ? ' is-selected' : ''}`}
                  >
                    <h3>{plan.name}</h3>
                    <p className="muted-text">{plan.description}</p>
                    <p className="onboarding-plan-card__price">
                      {formatMoney(plan.priceCents, plan.currency ?? 'ZAR')} /{' '}
                      {plan.billingInterval}
                    </p>
                    <ul>
                      <li>
                        Admin/office seats:{' '}
                        {seats?.adminOffice == null ? 'Custom' : seats.adminOffice}
                      </li>
                      <li>
                        Technician seats: {seats?.technician == null ? 'Custom' : seats.technician}
                      </li>
                      {(plan.features ?? []).slice(0, 4).map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                    <Button
                      disabled={isWorking || selected}
                      onClick={() =>
                        void run(() => selectOnboardingPlan(accessToken!, { planId: plan.id }))
                      }
                    >
                      {selected ? 'SELECTED' : 'CONTINUE'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          {state.planBillingState === 'plan_selected_billing_setup_required' ? (
            <p className="form-success">PLAN SELECTED — COMPLETE BILLING NEXT</p>
          ) : null}
          {state.planBillingState === 'verifying_payment' ? (
            <p className="form-success">PAYMENT VERIFICATION IN PROGRESS</p>
          ) : null}
          {state.planBillingState === 'payment_requires_attention' ? (
            <p className="form-error">PAYMENT REQUIRES ATTENTION</p>
          ) : null}
          {state.planBillingState === 'entitled' ? (
            <p className="form-success">SUBSCRIPTION ACTIVE</p>
          ) : null}
          <div className="page-header-actions">
            {state.plan ? (
              <Button
                disabled={isWorking}
                onClick={() => setLocation('/settings/billing?checkout=start')}
              >
                COMPLETE BILLING
              </Button>
            ) : null}
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() =>
                void run(() =>
                  advanceOnboardingStep(accessToken!, { step: 'plan', markSkipped: true }),
                )
              }
            >
              SKIP FOR NOW
            </Button>
          </div>
        </Panel>
      ) : null}

      {activeStep === 'team' ? (
        <Panel title="3 · Add your team">
          <div className="onboarding-seat-strip">
            <span>
              Owner {state.team.ownerCount} · Admin/Office {state.team.adminOfficeCount} ·
              Technicians {state.team.technicianCount}
            </span>
            <span>
              Seats used {state.team.seats.totalUsed}
              {state.team.seats.adminOfficeIncluded != null
                ? ` · Admin included ${state.team.seats.adminOfficeIncluded}`
                : ''}
              {state.team.seats.technicianIncluded != null
                ? ` · Tech included ${state.team.seats.technicianIncluded}`
                : ''}
            </span>
          </div>
          <p className="muted-text">
            Seat limits come from your plan. Exceeding them returns SEAT LIMIT REACHED — no silent
            bypass. Technician salary stays private.
          </p>
          <form className="onboarding-form" onSubmit={handleInviteSubmit}>
            <div className="onboarding-form__grid">
              <Input
                label="First name"
                value={inviteFirstName}
                onChange={(e) => setInviteFirstName(e.target.value)}
              />
              <Input
                label="Last name"
                value={inviteLastName}
                onChange={(e) => setInviteLastName(e.target.value)}
              />
              <Input
                label="Email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
              <Input
                label="Mobile"
                value={inviteMobile}
                onChange={(e) => setInviteMobile(e.target.value)}
              />
              <label className="field">
                <span className="field__label">Role</span>
                <select
                  value={inviteRoleId}
                  onChange={(e) => {
                    setInviteRoleId(e.target.value);
                    const name = roles.find((role) => role.id === e.target.value)?.name;
                    setShowPayroll(name === 'Technician');
                  }}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {selectedRoleName === 'Technician' ? (
              <div className="onboarding-payroll">
                <label className="field field--checkbox">
                  <input
                    type="checkbox"
                    checked={showPayroll}
                    onChange={(e) => setShowPayroll(e.target.checked)}
                  />
                  <span>Set monthly salary now (private — not shown to other technicians)</span>
                </label>
                {showPayroll ? (
                  <div className="onboarding-form__grid">
                    <Input
                      label="Monthly salary"
                      type="number"
                      min="0"
                      step="0.01"
                      value={monthlySalary}
                      onChange={(e) => setMonthlySalary(e.target.value)}
                    />
                    <Input
                      label="Effective date"
                      type="date"
                      value={effectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="page-header-actions">
              <Button type="submit" disabled={isWorking}>
                Invite team member
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void run(() =>
                    advanceOnboardingStep(accessToken!, { step: 'team', markComplete: true }),
                  )
                }
              >
                SAVE & CONTINUE
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {activeStep === 'import' ? (
        <Panel title="4 · Import business data">
          <p className="muted-text">
            Start clean or import via the TITAN Data Migration wizard (upload → map → validate →
            preview → confirm). Nothing imports on upload alone. No demo customers, jobs, or stock.
          </p>
          <div className="onboarding-import-list">
            {state.imports.map((entity) => (
              <div key={entity.entityType} className="onboarding-import-item">
                <strong>{entity.label}</strong>
                <span className="status-pill">
                  {entity.supported ? entity.latestStatus ?? 'ready' : 'later'}
                </span>
                {entity.note ? <p className="muted-text">{entity.note}</p> : null}
                {entity.attentionCount ? (
                  <p className="form-error">{entity.attentionCount} need review</p>
                ) : null}
              </div>
            ))}
          </div>
          <div className="page-header-actions">
            <Button
              disabled={isWorking}
              onClick={() => {
                void (async () => {
                  setIsWorking(true);
                  setError(null);
                  try {
                    const next = await markOnboardingImport(accessToken!, 'importing');
                    setState(next);
                    setLocation('/data-migration');
                  } catch (err) {
                    setError(err instanceof ApiClientError ? err.message : 'Action failed');
                  } finally {
                    setIsWorking(false);
                  }
                })();
              }}
            >
              REVIEW IMPORT
            </Button>
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() => void run(() => markOnboardingImport(accessToken!, 'start_clean'))}
            >
              Start clean
            </Button>
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() => void run(() => markOnboardingImport(accessToken!, 'complete'))}
            >
              CONTINUE
            </Button>
          </div>
        </Panel>
      ) : null}

      {activeStep === 'integrations' ? (
        <Panel title="5 · Connect apps">
          <p className="muted-text">
            Optional. Skip anything you do not use — TITAN stays usable. Status is truthful (never
            Connected just because fields exist).
          </p>
          <div className="onboarding-integration-list">
            {state.integrations.map((item) => (
              <div key={item.providerKey} className="onboarding-integration-item">
                <div>
                  <strong>
                    {item.label}{' '}
                    <span className="muted-text">· {item.category}</span>
                  </strong>
                  <p className="status-pill">{item.status.replace(/_/g, ' ')}</p>
                  {item.unavailableReason ? (
                    <p className="muted-text">{item.unavailableReason}</p>
                  ) : null}
                </div>
                <div className="page-header-actions">
                  {item.status !== 'connected' && item.status !== 'skipped' ? (
                    <>
                      <Link href={item.href}>
                        <Button variant="secondary">CONNECT</Button>
                      </Link>
                      <Button
                        variant="secondary"
                        disabled={isWorking}
                        onClick={() =>
                          void run(() =>
                            skipOnboardingIntegration(accessToken!, {
                              providerKey: item.providerKey,
                            }),
                          )
                        }
                      >
                        SKIP FOR NOW
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="page-header-actions">
            <Button
              disabled={isWorking}
              onClick={() => void run(() => completeOnboardingIntegrations(accessToken!))}
            >
              SAVE & CONTINUE
            </Button>
          </div>
        </Panel>
      ) : null}

      {activeStep === 'operations' ? (
        <Panel title="6 · Company operations">
          <form
            className="onboarding-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() =>
                saveOnboardingOperations(accessToken!, {
                  timezone: opsTimezone,
                  currency: opsCurrency,
                  operatingHoursStart: hoursStart,
                  operatingHoursEnd: hoursEnd,
                  technicianStandardStartTime: techStart,
                  defaultVatEnabled: vatEnabled,
                  workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                }),
              );
            }}
          >
            <div className="onboarding-form__grid">
              <Input
                label="Timezone"
                value={opsTimezone}
                onChange={(e) => setOpsTimezone(e.target.value)}
              />
              <Input
                label="Currency"
                value={opsCurrency}
                onChange={(e) => setOpsCurrency(e.target.value)}
              />
              <Input
                label="Operating hours start"
                value={hoursStart}
                onChange={(e) => setHoursStart(e.target.value)}
              />
              <Input
                label="Operating hours end"
                value={hoursEnd}
                onChange={(e) => setHoursEnd(e.target.value)}
              />
              <Input
                label="Technician standard start"
                value={techStart}
                onChange={(e) => setTechStart(e.target.value)}
              />
              <label className="field field--checkbox">
                <input
                  type="checkbox"
                  checked={vatEnabled}
                  onChange={(e) => setVatEnabled(e.target.checked)}
                />
                <span>Default VAT enabled on quotes / invoices</span>
              </label>
            </div>
            <p className="muted-text">
              Document branding, numbering, and notifications reuse Company Settings — no duplicate
              stores.
            </p>
            <div className="page-header-actions">
              <Button type="submit" disabled={isWorking}>
                SAVE & CONTINUE
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void run(() =>
                    advanceOnboardingStep(accessToken!, {
                      step: 'operations',
                      markSkipped: true,
                    }),
                  )
                }
              >
                SKIP FOR NOW
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {activeStep === 'review' ? (
        <Panel title="7 · Review & start">
          <div className="onboarding-review">
            <section>
              <h3>COMPANY</h3>
              <p>
                {checklistMark(state.checklist.company)} {state.companyName}
                {state.tradeType ? ` · ${state.tradeType}` : ''}
              </p>
            </section>
            <section>
              <h3>TEAM</h3>
              <p>
                {checklistMark(state.checklist.team)} Owner {state.team.ownerCount} · Admin{' '}
                {state.team.adminOfficeCount} · Technicians {state.team.technicianCount}
              </p>
            </section>
            <section>
              <h3>DATA</h3>
              <p>
                {checklistMark(state.checklist.import)}{' '}
                {state.imports
                  .filter((item) => (item.importedCount ?? 0) > 0)
                  .map((item) => `${item.importedCount} ${item.label.toLowerCase()}`)
                  .join(' · ') || 'Start clean / import later'}
              </p>
            </section>
            <section>
              <h3>INTEGRATIONS</h3>
              <ul>
                {state.integrations.map((item) => (
                  <li key={item.providerKey}>
                    {item.status === 'connected' ? '✓' : item.status === 'skipped' ? '○' : '○'}{' '}
                    {item.label}
                    {item.status === 'skipped' ? ' — skipped' : ` — ${item.status.replace(/_/g, ' ')}`}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3>OPERATIONS</h3>
              <p>
                {checklistMark(state.checklist.operations)}{' '}
                {state.operationsConfigured ? 'Hours / VAT configured' : 'Configure later in settings'}
              </p>
            </section>
            <section>
              <h3>PLAN</h3>
              <p>
                {state.plan?.name ?? 'Not selected'}
                {state.planBillingState === 'plan_selected_billing_setup_required'
                  ? ' — BILLING SETUP REQUIRED'
                  : ''}
              </p>
            </section>
          </div>
          {state.attentionRequired.length > 0 ? (
            <Panel title="Needs attention">
              <ul>
                {state.attentionRequired.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Panel>
          ) : null}
          <div className="page-header-actions">
            <Button
              disabled={isWorking || !state.reviewReady}
              onClick={() =>
                void run(async () => {
                  const next = await activateOnboarding(accessToken!);
                  setLocation('/');
                  return next;
                })
              }
            >
              START USING TITAN
            </Button>
            {!state.reviewReady ? (
              <p className="muted-text">Complete company, plan, and team first.</p>
            ) : null}
          </div>
        </Panel>
      ) : null}

      <p className="muted-text">
        Step: {stepLabel(activeStep)} · Status: {state.status.replace(/_/g, ' ')}
      </p>
    </div>
  );
}
