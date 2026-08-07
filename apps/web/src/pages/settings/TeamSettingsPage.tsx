import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Input } from '@titan/ui';
import { hasAnyPermission, isCompanyOwnerRole, isPlatformOwnerRole } from '@titan/auth/browser';
import type { TeamMember } from '@titan/shared';
import {
  DEFAULT_OVERTIME_DAILY_THRESHOLD_HOURS,
  DEFAULT_OVERTIME_MULTIPLIER_BPS,
  DEFAULT_WORKING_DAYS_PER_WEEK,
  DEFAULT_WORKING_HOURS_PER_DAY,
  PAYROLL_SETUP_INCOMPLETE,
  TECHNICIAN_ONBOARDING_STEP_LABELS,
  TECHNICIAN_ONBOARDING_STEPS,
  USER_HARD_DELETE_REFUSED_MESSAGE,
  canViewTechnicianPayroll,
  deriveInternalHourlyCostCents,
  formatMoney,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  createTeamInvite,
  fetchTeamInvites,
  fetchTeamMemberDeleteEligibility,
  fetchTeamMembers,
  fetchTeamRoles,
  hardDeleteTeamMember,
  removeTeamMemberAccess,
  revokeTeamInvite,
  updateTeamMemberRole,
  updateTeamMemberStatus,
} from '../../lib/team-api';
import { NAV_LABELS } from '@titan/shared';
import { SettingsNav } from '../../features/settings/SettingsNav';
import { TechnicianPayrollSetupPanel } from '../../features/settings/TechnicianPayrollSetupPanel';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';
import { toStaffIdentity } from '../../lib/role-experience';

type DeleteDialogState = {
  member: TeamMember;
  confirmation: string;
  error: string | null;
};

export function TeamSettingsPage() {
  const { accessToken, user } = useAuth();
  const { invalidateTeam } = useStaffMutationInvalidation();
  const [isInviting, setIsInviting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const [hardDeleteFlags, setHardDeleteFlags] = useState<
    Record<string, { canHardDelete: boolean; refusalMessage: string | null; loading: boolean }>
  >({});
  const [payrollMemberId, setPayrollMemberId] = useState<string | null>(null);
  const [inviteSalaryRands, setInviteSalaryRands] = useState('');
  const [inviteEffectiveFrom, setInviteEffectiveFrom] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [inviteDaysPerWeek, setInviteDaysPerWeek] = useState(String(DEFAULT_WORKING_DAYS_PER_WEEK));
  const [inviteHoursPerDay, setInviteHoursPerDay] = useState(String(DEFAULT_WORKING_HOURS_PER_DAY));
  const [inviteOtThreshold, setInviteOtThreshold] = useState(
    String(DEFAULT_OVERTIME_DAILY_THRESHOLD_HOURS),
  );
  const [inviteOtMultiplier, setInviteOtMultiplier] = useState('1.5');
  const [invitePayrollRef, setInvitePayrollRef] = useState('');
  const [invitePayrollIncomplete, setInvitePayrollIncomplete] = useState(false);

  const canManage = useMemo(
    () => (user ? hasAnyPermission(user.permissions, ['users:manage']) : false),
    [user],
  );

  const canViewPayroll = useMemo(
    () => (user ? canViewTechnicianPayroll(user.permissions, user.roleName) : false),
    [user],
  );

  const canView = useMemo(
    () => (user ? hasAnyPermission(user.permissions, ['users:read', 'users:manage']) : false),
    [user],
  );

  const canAssignRoles = useMemo(() => {
    if (!user) return false;
    const identity = toStaffIdentity(user);
    return isPlatformOwnerRole(identity) || isCompanyOwnerRole(identity);
  }, [user]);

  const membersQuery = useStaffCachedQuery({
    queryKey: 'team/members',
    enabled: canView,
    fetcher: (signal) => fetchTeamMembers(accessToken!, { signal }),
  });

  const rolesQuery = useStaffCachedQuery({
    queryKey: 'team/roles',
    enabled: canView,
    fetcher: (signal) => fetchTeamRoles(accessToken!, { signal }),
  });

  const invitesQuery = useStaffCachedQuery({
    queryKey: 'team/invites',
    enabled: canView && canManage,
    fetcher: (signal) => fetchTeamInvites(accessToken!, { signal }),
  });

  const members = membersQuery.data ?? [];
  const assignableRoles = rolesQuery.data?.assignableRoles ?? [];
  const manuallyAssignableRoles = rolesQuery.data?.manuallyAssignableRoles ?? [];
  const invites = invitesQuery.data ?? [];

  useEffect(() => {
    if (!roleId && assignableRoles[0]?.id) {
      setRoleId(assignableRoles[0].id);
    }
  }, [assignableRoles, roleId]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const member of members) {
      next[member.id] = member.roleId;
    }
    setRoleDrafts(next);
  }, [members]);

  useEffect(() => {
    if (!openMenuId) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.(`[data-team-actions="${openMenuId}"]`)) return;
      setOpenMenuId(null);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [openMenuId]);

  async function reloadTeam() {
    await Promise.all([
      membersQuery.refetch(),
      rolesQuery.refetch(),
      canManage ? invitesQuery.refetch() : Promise.resolve(),
    ]);
  }

  const selectedInviteRole = assignableRoles.find((role) => role.id === roleId) ?? null;
  const invitingTechnician = selectedInviteRole?.name === 'Technician';

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !canManage || !roleId) {
      return;
    }

    setIsInviting(true);
    setActionError(null);
    setInviteUrl(null);

    try {
      let payrollSetup: Parameters<typeof createTeamInvite>[1]['payrollSetup'] = undefined;
      if (invitingTechnician) {
        if (invitePayrollIncomplete) {
          payrollSetup = null;
        } else {
          const monthlySalaryCents = Math.round(Number(inviteSalaryRands) * 100);
          if (!Number.isFinite(monthlySalaryCents) || monthlySalaryCents <= 0) {
            setActionError('Enter a monthly salary, or mark payroll setup incomplete');
            setIsInviting(false);
            return;
          }
          const multiplier = Number(inviteOtMultiplier);
          payrollSetup = {
            monthlySalaryCents,
            effectiveFrom: inviteEffectiveFrom,
            workingDaysPerWeek: Number(inviteDaysPerWeek) || DEFAULT_WORKING_DAYS_PER_WEEK,
            workingHoursPerDay: Number(inviteHoursPerDay) || DEFAULT_WORKING_HOURS_PER_DAY,
            overtimeDailyThresholdHours:
              Number(inviteOtThreshold) || DEFAULT_OVERTIME_DAILY_THRESHOLD_HOURS,
            overtimeMultiplierBps: Math.round(
              (Number.isFinite(multiplier) ? multiplier : 1.5) * 10_000,
            ) || DEFAULT_OVERTIME_MULTIPLIER_BPS,
            payrollReference: invitePayrollRef.trim() || null,
          };
        }
      }

      const result = await createTeamInvite(accessToken, { email, roleId, payrollSetup });
      setInviteUrl(result.inviteUrl);
      setEmail('');
      setInviteSalaryRands('');
      setInvitePayrollIncomplete(false);
      invalidateTeam();
      await reloadTeam();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to create invite');
    } finally {
      setIsInviting(false);
    }
  }

  const inviteDerivedHourly = (() => {
    if (!invitingTechnician || invitePayrollIncomplete) return null;
    const salaryCents = Math.round(Number(inviteSalaryRands) * 100);
    if (!Number.isFinite(salaryCents) || salaryCents <= 0) return null;
    return deriveInternalHourlyCostCents(salaryCents, {
      workingDaysPerWeek: Number(inviteDaysPerWeek) || DEFAULT_WORKING_DAYS_PER_WEEK,
      workingHoursPerDay: Number(inviteHoursPerDay) || DEFAULT_WORKING_HOURS_PER_DAY,
    });
  })();

  async function handleRevokeInvite(inviteId: string) {
    if (!accessToken || !canManage) return;
    setPendingActionId(inviteId);
    setActionError(null);
    try {
      await revokeTeamInvite(accessToken, inviteId);
      invalidateTeam();
      await invitesQuery.refetch();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to revoke invite');
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleSuspend(memberId: string) {
    if (!accessToken || !canManage) return;
    setPendingActionId(memberId);
    setActionError(null);
    setOpenMenuId(null);
    try {
      await updateTeamMemberStatus(accessToken, memberId, false);
      invalidateTeam();
      await membersQuery.refetch();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to suspend member');
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleReactivate(memberId: string) {
    if (!accessToken || !canManage) return;
    setPendingActionId(memberId);
    setActionError(null);
    setOpenMenuId(null);
    try {
      await updateTeamMemberStatus(accessToken, memberId, true);
      invalidateTeam();
      await membersQuery.refetch();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to reactivate member');
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleRemoveAccess(memberId: string) {
    if (!accessToken || !canManage) return;
    setPendingActionId(memberId);
    setActionError(null);
    setOpenMenuId(null);
    try {
      await removeTeamMemberAccess(accessToken, memberId);
      invalidateTeam();
      await membersQuery.refetch();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to remove access');
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleAssignRole(memberId: string) {
    if (!accessToken || !canAssignRoles) return;
    const nextRoleId = roleDrafts[memberId];
    if (!nextRoleId) return;
    setPendingActionId(`role:${memberId}`);
    setActionError(null);
    setOpenMenuId(null);
    try {
      await updateTeamMemberRole(accessToken, memberId, nextRoleId);
      invalidateTeam();
      await membersQuery.refetch();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to assign role');
    } finally {
      setPendingActionId(null);
    }
  }

  async function ensureHardDeleteEligibility(memberId: string) {
    if (!accessToken || !canManage) return;
    const existing = hardDeleteFlags[memberId];
    if (existing && !existing.loading && existing.refusalMessage !== undefined) {
      return existing;
    }
    setHardDeleteFlags((prev) => ({
      ...prev,
      [memberId]: {
        canHardDelete: false,
        refusalMessage: null,
        loading: true,
      },
    }));
    try {
      const eligibility = await fetchTeamMemberDeleteEligibility(accessToken, memberId);
      const next = {
        canHardDelete: eligibility.canHardDelete,
        refusalMessage: eligibility.refusalMessage,
        loading: false,
      };
      setHardDeleteFlags((prev) => ({ ...prev, [memberId]: next }));
      return next;
    } catch (err) {
      const next = {
        canHardDelete: false,
        refusalMessage:
          err instanceof ApiClientError ? err.message : USER_HARD_DELETE_REFUSED_MESSAGE,
        loading: false,
      };
      setHardDeleteFlags((prev) => ({ ...prev, [memberId]: next }));
      return next;
    }
  }

  async function openActionsMenu(memberId: string) {
    setOpenMenuId((prev) => (prev === memberId ? null : memberId));
    if (openMenuId !== memberId) {
      void ensureHardDeleteEligibility(memberId);
    }
  }

  async function openHardDeleteDialog(member: TeamMember) {
    setOpenMenuId(null);
    const flag = await ensureHardDeleteEligibility(member.id);
    if (!flag?.canHardDelete) {
      setActionError(flag?.refusalMessage ?? USER_HARD_DELETE_REFUSED_MESSAGE);
      return;
    }
    setDeleteDialog({ member, confirmation: '', error: null });
  }

  async function confirmHardDelete() {
    if (!accessToken || !deleteDialog) return;
    const { member, confirmation } = deleteDialog;
    setPendingActionId(`delete:${member.id}`);
    setDeleteDialog((prev) => (prev ? { ...prev, error: null } : prev));
    try {
      await hardDeleteTeamMember(accessToken, member.id, confirmation);
      setDeleteDialog(null);
      invalidateTeam();
      await membersQuery.refetch();
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : 'Unable to permanently delete member';
      setDeleteDialog((prev) => (prev ? { ...prev, error: message } : prev));
    } finally {
      setPendingActionId(null);
    }
  }

  if (!canView) {
    return (
      <PageHeader title="Team" description="You do not have permission to view team members." />
    );
  }

  return (
    <>
      <PageHeader
        title={NAV_LABELS.teamAndAccess}
        description="Manage users, canonical roles and invitations. Owner/Admin/Member/Client/Platform Owner cannot be invited. Only Platform Owner may assign Company Owner. You cannot change your own role. Permanent delete is only available for accounts with no business history."
      />
      <SettingsNav />

      {actionError ? <p className="settings-alert settings-alert--error">{actionError}</p> : null}

      {canManage ? (
        <section className="settings-section">
          <h2 className="settings-section__title">Invite user</h2>
          <p className="page-muted">
            Invites are limited to Manager, Dispatcher, Accountant and Technician.
          </p>
          {invitingTechnician ? (
            <ol className="technician-onboarding-steps">
              {TECHNICIAN_ONBOARDING_STEPS.map((step) => (
                <li key={step}>{TECHNICIAN_ONBOARDING_STEP_LABELS[step]}</li>
              ))}
            </ol>
          ) : null}
          <form className="settings-form" onSubmit={(event) => void handleInvite(event)}>
            <div className="settings-grid">
              <Input
                label="Email"
                name="email"
                type="email"
                placeholder="teammate@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <label className="settings-field">
                <span className="settings-field__label">Role</span>
                <select
                  className="settings-select"
                  value={roleId}
                  onChange={(event) => setRoleId(event.target.value)}
                  required
                >
                  {assignableRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {invitingTechnician ? (
              <div className="technician-invite-payroll">
                <h3 className="settings-section__title">Technician payroll setup</h3>
                <p className="page-muted">
                  Monthly salary is private (Owner / Finance only). Job labour uses the derived hourly
                  allocation — salary expense is never double-counted with job labour.
                </p>
                <label className="settings-field settings-field--checkbox">
                  <input
                    type="checkbox"
                    checked={invitePayrollIncomplete}
                    onChange={(event) => setInvitePayrollIncomplete(event.target.checked)}
                  />
                  <span>Payroll information intentionally incomplete — show {PAYROLL_SETUP_INCOMPLETE}</span>
                </label>
                {!invitePayrollIncomplete ? (
                  <div className="settings-grid">
                    <Input
                      label="Monthly salary (R)"
                      type="number"
                      min="1"
                      step="0.01"
                      value={inviteSalaryRands}
                      onChange={(event) => setInviteSalaryRands(event.target.value)}
                      required
                    />
                    <Input
                      label="Effective start date"
                      type="date"
                      value={inviteEffectiveFrom}
                      onChange={(event) => setInviteEffectiveFrom(event.target.value)}
                      required
                    />
                    <Input
                      label="Working days / week"
                      type="number"
                      min="1"
                      max="7"
                      step="0.5"
                      value={inviteDaysPerWeek}
                      onChange={(event) => setInviteDaysPerWeek(event.target.value)}
                      required
                    />
                    <Input
                      label="Working hours / day"
                      type="number"
                      min="1"
                      max="24"
                      step="0.25"
                      value={inviteHoursPerDay}
                      onChange={(event) => setInviteHoursPerDay(event.target.value)}
                      required
                    />
                    <Input
                      label="OT daily threshold (hours)"
                      type="number"
                      min="1"
                      max="24"
                      step="0.25"
                      value={inviteOtThreshold}
                      onChange={(event) => setInviteOtThreshold(event.target.value)}
                      required
                    />
                    <Input
                      label="OT multiplier"
                      type="number"
                      min="1"
                      max="5"
                      step="0.1"
                      value={inviteOtMultiplier}
                      onChange={(event) => setInviteOtMultiplier(event.target.value)}
                      required
                    />
                    <Input
                      label="Payroll reference (optional)"
                      value={invitePayrollRef}
                      onChange={(event) => setInvitePayrollRef(event.target.value)}
                    />
                  </div>
                ) : (
                  <p className="settings-alert settings-alert--error" role="status">
                    {PAYROLL_SETUP_INCOMPLETE} — wage and job-cost figures will stay unavailable until
                    payroll is completed.
                  </p>
                )}
                {inviteDerivedHourly != null ? (
                  <p className="page-muted">
                    Derived internal hourly labour cost: {formatMoney(inviteDerivedHourly)} / hour
                  </p>
                ) : null}
              </div>
            ) : null}

            <Button type="submit" disabled={isInviting || assignableRoles.length === 0}>
              {isInviting
                ? 'Creating invite...'
                : invitingTechnician
                  ? 'Activate Access — create invite link'
                  : 'Create invite link'}
            </Button>
          </form>
          {inviteUrl ? (
            <div className="team-invite-url">
              <p className="team-invite-url__label">Share this invite link:</p>
              <code className="team-invite-url__value">{inviteUrl}</code>
            </div>
          ) : null}
        </section>
      ) : null}

      <AnalyticsTabPanel
        isLoading={membersQuery.isLoading}
        error={membersQuery.error}
        hasData={membersQuery.data !== undefined}
        loadingLabel="Loading team members…"
        onRetry={() => void membersQuery.refetch()}
      >
        <section className="settings-section">
          <h2 className="settings-section__title">Active members</h2>
          {canAssignRoles ? (
            <p className="page-muted">
              Owner role assignment: select a canonical role, then use Actions → Edit role. Suspended
              accounts cannot sign in. Permanent delete requires explicit name/email confirmation and
              a clean dependency check.
            </p>
          ) : null}
          <div className="team-table-wrap">
            <table className="team-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  {canViewPayroll ? <th>Payroll</th> : null}
                  {canManage || canAssignRoles ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td
                      colSpan={
                        (canManage || canAssignRoles ? 5 : 4) + (canViewPayroll ? 1 : 0)
                      }
                      className="team-table__empty"
                    >
                      No team members found.
                    </td>
                  </tr>
                ) : (
                  members.map((member) => {
                    const isSelf = member.id === user?.id;
                    const lifecycle = member.lifecycle;
                    const roleDirty =
                      (roleDrafts[member.id] ?? member.roleId) !== member.roleId;
                    return (
                      <tr key={member.id}>
                        <td>
                          {member.firstName} {member.lastName}
                        </td>
                        <td>{member.email}</td>
                        <td>
                          {canAssignRoles && !isSelf ? (
                            <select
                              className="settings-select"
                              value={roleDrafts[member.id] ?? member.roleId}
                              onChange={(event) =>
                                setRoleDrafts((prev) => ({
                                  ...prev,
                                  [member.id]: event.target.value,
                                }))
                              }
                            >
                              {!manuallyAssignableRoles.some((r) => r.id === member.roleId) ? (
                                <option value={member.roleId}>{member.roleName}</option>
                              ) : null}
                              {manuallyAssignableRoles.map((role) => (
                                <option key={role.id} value={role.id}>
                                  {role.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            member.roleName
                          )}
                        </td>
                        <td>{member.isActive ? 'Active' : 'Suspended'}</td>
                        {canViewPayroll ? (
                          <td>
                            {member.roleName === 'Technician' ? (
                              member.payroll?.setupStatus === 'incomplete' ? (
                                <button
                                  type="button"
                                  className="team-actions__link team-actions__link--warn"
                                  onClick={() => setPayrollMemberId(member.id)}
                                >
                                  {member.payroll.setupLabel ?? PAYROLL_SETUP_INCOMPLETE}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="team-actions__link"
                                  onClick={() => setPayrollMemberId(member.id)}
                                >
                                  {member.payroll?.currentMonthlySalaryCents != null
                                    ? formatMoney(member.payroll.currentMonthlySalaryCents)
                                    : 'View payroll'}
                                </button>
                              )
                            ) : (
                              <span className="page-muted">—</span>
                            )}
                          </td>
                        ) : null}
                        {canManage || canAssignRoles ? (
                          <td>
                            {isSelf ? (
                              <span className="page-muted">You</span>
                            ) : (
                              <div className="team-actions" data-team-actions={member.id}>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={pendingActionId === member.id}
                                  aria-expanded={openMenuId === member.id}
                                  aria-haspopup="menu"
                                  onClick={() => void openActionsMenu(member.id)}
                                >
                                  Actions
                                </Button>
                                {openMenuId === member.id ? (
                                  <ul className="team-actions__menu" role="menu">
                                    {canAssignRoles ? (
                                      <li role="none">
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="team-actions__item"
                                          disabled={
                                            pendingActionId === `role:${member.id}` || !roleDirty
                                          }
                                          onClick={() => void handleAssignRole(member.id)}
                                        >
                                          Edit role
                                        </button>
                                      </li>
                                    ) : null}
                                    {canManage && (lifecycle?.canSuspend ?? member.isActive) ? (
                                      <li role="none">
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="team-actions__item"
                                          disabled={pendingActionId === member.id}
                                          onClick={() => void handleSuspend(member.id)}
                                        >
                                          Suspend
                                        </button>
                                      </li>
                                    ) : null}
                                    {canManage && (lifecycle?.canReactivate ?? !member.isActive) ? (
                                      <li role="none">
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="team-actions__item"
                                          disabled={pendingActionId === member.id}
                                          onClick={() => void handleReactivate(member.id)}
                                        >
                                          Reactivate
                                        </button>
                                      </li>
                                    ) : null}
                                    {canManage && (lifecycle?.canRemoveAccess ?? member.isActive) ? (
                                      <li role="none">
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="team-actions__item"
                                          disabled={pendingActionId === member.id}
                                          onClick={() => void handleRemoveAccess(member.id)}
                                        >
                                          Remove access
                                        </button>
                                      </li>
                                    ) : null}
                                    {canManage ? (
                                      <li role="none">
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="team-actions__item team-actions__item--danger"
                                          disabled={
                                            pendingActionId === `delete:${member.id}` ||
                                            hardDeleteFlags[member.id]?.loading === true ||
                                            hardDeleteFlags[member.id]?.canHardDelete === false ||
                                            lifecycle?.canHardDelete === false
                                          }
                                          title={
                                            hardDeleteFlags[member.id]?.canHardDelete
                                              ? 'Permanently delete this unused account'
                                              : (hardDeleteFlags[member.id]?.refusalMessage ??
                                                lifecycle?.hardDeleteRefusalMessage ??
                                                USER_HARD_DELETE_REFUSED_MESSAGE)
                                          }
                                          onClick={() => void openHardDeleteDialog(member)}
                                        >
                                          {hardDeleteFlags[member.id]?.loading
                                            ? 'Checking delete…'
                                            : 'Delete permanently'}
                                        </button>
                                      </li>
                                    ) : null}
                                  </ul>
                                ) : null}
                              </div>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {canViewPayroll && payrollMemberId ? (
            <section className="settings-section technician-payroll-section">
              <div className="technician-payroll-section__toolbar">
                <Button type="button" variant="secondary" onClick={() => setPayrollMemberId(null)}>
                  Close payroll
                </Button>
              </div>
              <TechnicianPayrollSetupPanel
                accessToken={accessToken!}
                memberId={payrollMemberId}
                memberName={
                  (() => {
                    const m = members.find((row) => row.id === payrollMemberId);
                    return m ? `${m.firstName} ${m.lastName}` : 'Technician';
                  })()
                }
                onUpdated={() => {
                  invalidateTeam();
                  void membersQuery.refetch();
                }}
              />
            </section>
          ) : null}
        </section>
      </AnalyticsTabPanel>

      {canManage ? (
        <AnalyticsTabPanel
          isLoading={invitesQuery.isLoading}
          error={invitesQuery.error}
          hasData={invitesQuery.data !== undefined}
          isEmpty={invites.length === 0}
          emptyTitle="No Pending Invites"
          emptyDescription="Create an invite link to add managers, dispatchers, accountants or technicians."
          loadingLabel="Loading invites…"
          onRetry={() => void invitesQuery.refetch()}
        >
          {invites.length > 0 ? (
            <section className="settings-section">
              <h2 className="settings-section__title">Pending invites</h2>
              <div className="team-table-wrap">
                <table className="team-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Invited by</th>
                      <th>Expires</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((invite) => (
                      <tr key={invite.id}>
                        <td>{invite.email}</td>
                        <td>{invite.roleName}</td>
                        <td>{invite.invitedByName}</td>
                        <td>{new Date(invite.expiresAt).toLocaleString()}</td>
                        <td>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={pendingActionId === invite.id}
                            onClick={() => void handleRevokeInvite(invite.id)}
                          >
                            Revoke
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </AnalyticsTabPanel>
      ) : null}

      {deleteDialog ? (
        <div className="team-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="team-delete-title">
          <div className="team-delete-dialog__panel">
            <h2 id="team-delete-title" className="settings-section__title">
              Delete permanently
            </h2>
            <p>
              This permanently removes{' '}
              <strong>
                {deleteDialog.member.firstName} {deleteDialog.member.lastName}
              </strong>{' '}
              ({deleteDialog.member.email}). This is only allowed for accounts with no business
              history.
            </p>
            <p className="page-muted">
              Type the user&apos;s email or displayed name to confirm.
            </p>
            <Input
              label="Confirmation"
              name="confirmation"
              value={deleteDialog.confirmation}
              onChange={(event) =>
                setDeleteDialog((prev) =>
                  prev ? { ...prev, confirmation: event.target.value, error: null } : prev,
                )
              }
              autoFocus
            />
            {deleteDialog.error ? (
              <p className="settings-alert settings-alert--error">{deleteDialog.error}</p>
            ) : null}
            <div className="settings-inline-actions">
              <Button
                variant="secondary"
                onClick={() => setDeleteDialog(null)}
                disabled={pendingActionId === `delete:${deleteDialog.member.id}`}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void confirmHardDelete()}
                disabled={
                  pendingActionId === `delete:${deleteDialog.member.id}` ||
                  deleteDialog.confirmation.trim().length === 0
                }
              >
                {pendingActionId === `delete:${deleteDialog.member.id}`
                  ? 'Deleting…'
                  : 'Confirm permanent delete'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
