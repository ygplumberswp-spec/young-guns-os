import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Input, LoadingState, PageHeader } from '@titan/ui';
import { hasAnyPermission } from '@titan/auth/browser';
import { ApiClientError } from '../../lib/api-client';
import {
  createTeamInvite,
  fetchTeamInvites,
  fetchTeamMembers,
  fetchTeamRoles,
} from '../../lib/team-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';

export function TeamSettingsPage() {
  const { accessToken, user } = useAuth();
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');

  const canManage = useMemo(
    () => (user ? hasAnyPermission(user.permissions, ['users:manage']) : false),
    [user],
  );

  const canView = useMemo(
    () => (user ? hasAnyPermission(user.permissions, ['users:read', 'users:manage']) : false),
    [user],
  );

  const membersQuery = useCachedQuery({
    queryKey: 'team/members',
    accessToken,
    enabled: canView,
    staleTimeMs: 60_000,
    fetcher: async () => fetchTeamMembers(accessToken!),
  });

  const rolesQuery = useCachedQuery({
    queryKey: 'team/roles',
    accessToken,
    enabled: canView,
    staleTimeMs: 120_000,
    fetcher: async () => fetchTeamRoles(accessToken!),
  });

  const invitesQuery = useCachedQuery({
    queryKey: 'team/invites',
    accessToken,
    enabled: canView && canManage,
    staleTimeMs: 30_000,
    fetcher: async () => fetchTeamInvites(accessToken!),
  });

  const members = membersQuery.data ?? [];
  const assignableRoles = rolesQuery.data?.assignableRoles ?? [];
  const invites = invitesQuery.data ?? [];
  const isLoading = membersQuery.isLoading || rolesQuery.isLoading;

  useEffect(() => {
    if (!roleId && assignableRoles[0]?.id) {
      setRoleId(assignableRoles[0].id);
    }
  }, [assignableRoles, roleId]);

  async function loadTeam() {
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
    setError(null);
    setInviteUrl(null);

    try {
      const result = await createTeamInvite(accessToken, { email, roleId });
      setInviteUrl(result.inviteUrl);
      setEmail('');
      await loadTeam();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create invite');
    } finally {
      setIsInviting(false);
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

  if (isLoading) {
    return (
      <>
      <PageHeader
        title="Users & Access"
        description="Manage users, roles and invitations for your company workspace."
      />
        <LoadingState label="Loading team…" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Users & Access"
        description="Manage users, roles and invitations for your company workspace."
      />

      {error ? <p className="settings-alert settings-alert--error">{error}</p> : null}

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
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="team-table__empty">
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
                    <td>{member.isActive ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {canManage ? (
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
                </tr>
              </thead>
              <tbody>
                {invites.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="team-table__empty">
                      No pending invites.
                    </td>
                  </tr>
                ) : (
                  invites.map((invite) => (
                    <tr key={invite.id}>
                      <td>{invite.email}</td>
                      <td>{invite.roleName}</td>
                      <td>{invite.invitedByName}</td>
                      <td>{new Date(invite.expiresAt).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
