import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Input, PageHeader } from '@titan/ui';
import { hasAnyPermission } from '@titan/auth/browser';
import type { TeamInvite, TeamMember, TeamRole } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  createTeamInvite,
  fetchTeamInvites,
  fetchTeamMembers,
  fetchTeamRoles,
} from '../../lib/team-api';
import { useAuth } from '../../lib/auth-context';

export function TeamSettingsPage() {
  const { accessToken, user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [assignableRoles, setAssignableRoles] = useState<TeamRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  async function loadTeam() {
    if (!accessToken) {
      return;
    }

    const [memberData, roleData, inviteData] = await Promise.all([
      fetchTeamMembers(accessToken),
      fetchTeamRoles(accessToken),
      canManage ? fetchTeamInvites(accessToken) : Promise.resolve([]),
    ]);

    setMembers(memberData);
    setAssignableRoles(roleData.assignableRoles);
    setInvites(inviteData);
    setRoleId((current) => current || roleData.assignableRoles[0]?.id || '');
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        await loadTeam();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load team');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canManage, canView]);

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
    return <div className="settings-loading">Loading team...</div>;
  }

  return (
    <>
      <PageHeader
        title="Team Members"
        description="Manage users in your company workspace. Invites are link-based until email delivery is added."
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
