import type { AuthUser } from '@titan/shared';

type DashboardWelcomeProps = {
  user: AuthUser;
};

export function DashboardWelcome({ user }: DashboardWelcomeProps) {
  return (
    <section className="dashboard-welcome">
      <div>
        <p className="dashboard-welcome__eyebrow">Workspace</p>
        <h1 className="dashboard-welcome__title">{user.companyName}</h1>
        <p className="dashboard-welcome__subtitle">
          Signed in as {user.firstName} {user.lastName} · {user.roleName}
        </p>
      </div>
      <div className="dashboard-welcome__badge">All metrics at zero — no data added yet</div>
    </section>
  );
}
