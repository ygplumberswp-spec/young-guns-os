import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Input } from '@titan/ui';
import { hasAnyPermission, isCompanyOwnerRole, isPlatformOwnerRole } from '@titan/auth/browser';
import type { TeamMember } from '@titan/shared';
import { USER_HARD_DELETE_REFUSED_MESSAGE } from '@titan/shared';
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

  const canManage = useMemo(
    () => (user ? hasAnyPermission(user.permissions, ['users:manage']) : false),
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

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !canManage || !roleId) {
      return;
    }

    setIsInviting(true);
    setActionError(null);
    setInviteUrl(null);

    try {
      const result = await createTeamInvite(accessToken, { email, roleId });
      setInviteUrl(result.inviteUrl);
      setEmail('');
      invalidateTeam();
      await reloadTeam();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to create invite');
    } finally {
      setIsInviting(false);
    }
  }

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
            <Button type="submit" disabled={isInviting || assignableRoles.length === 0}>
              {isInviting ? 'Creating invite...' : 'Create invite link'}
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
                  {canManage || canAssignRoles ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={canManage || canAssignRoles ? 5 : 4} className="team-table__empty">
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
