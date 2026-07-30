import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Input, PageHeader } from '@titan/ui';
import { hasAnyPermission } from '@titan/auth/browser';
import { ApiClientError } from '../../lib/api-client';
import {
  createTeamInvite,
  fetchTeamInvites,
  fetchTeamMembers,
  fetchTeamRoles,
  revokeTeamInvite,
  updateTeamMemberStatus,
} from '../../lib/team-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';

export function TeamSettingsPage() {
  const { accessToken, user } = useAuth();
  const { invalidateTeam } = useStaffMutationInvalidation();
  const [isInviting, setIsInviting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const canManage = useMemo(
    () => (user ? hasAnyPermission(user.permissions, ['users:manage']) : false),
    [user],
  );

  const canView = useMemo(
    () => (user ? hasAnyPermission(user.permissions, ['users:read', 'users:manage']) : false),
    [user],
  );

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
  const invites = invitesQuery.data ?? [];

  useEffect(() => {
    if (!roleId && assignableRoles[0]?.id) {
      setRoleId(assignableRoles[0].id);
    }
  }, [assignableRoles, roleId]);

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

  async function handleToggleMember(memberId: string, isActive: boolean) {
    if (!accessToken || !canManage) return;
    setPendingActionId(memberId);
    setActionError(null);
    try {
      await updateTeamMemberStatus(accessToken, memberId, isActive);
      invalidateTeam();
      await membersQuery.refetch();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to update member');
    } finally {
      setPendingActionId(null);
    }
  }

  if (!canView) {
    return (
      <PageHeader
        title="Team"
        description="You do not have permission to view team members."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Users & Access"
        description="Manage users, roles and invitations for your company workspace."
      />

      {actionError ? <p className="settings-alert settings-alert--error">{actionError}</p> : null}

      {canManage ? (
        <section className="settings-section">
          <h2 className="settings-section__title">Invite user</h2>
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
          <div className="team-table-wrap">
            <table className="team-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  {canManage ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} className="team-table__empty">
                      No team members found.
                    </td>
                  </tr>
                ) : (
                  members.map((member) => (
                    <tr key={member.id}>
                      <td>
                        {member.firstName} {member.lastName}
                      </td>
                      <td>{member.email}</td>
                      <td>{member.roleName}</td>
                      <td>{member.isActive ? 'Active' : 'Suspended'}</td>
                      {canManage ? (
                        <td>
                          {member.id !== user?.id ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={pendingActionId === member.id}
                              onClick={() =>
                                void handleToggleMember(member.id, !member.isActive)
                              }
                            >
                              {member.isActive ? 'Suspend' : 'Restore'}
                            </Button>
                          ) : (
                            <span className="page-muted">You</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))
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
          emptyTitle="No pending invites"
          emptyDescription="Create an invite link to add office staff, dispatchers or technicians."
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
    </>
  );
}