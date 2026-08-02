import { PageHeader } from '../../components/ux';
import { canWriteCompanyMemory, hasAnyPermission } from '@titan/auth/browser';
import { useMemo } from 'react';
import { useAuth } from '../../lib/auth-context';
import { DayPlanningPanel } from '../../features/aura/DayPlanningPanel';
import { CustomerFollowUpsSection } from '../../features/aura/CustomerFollowUpsSection';
import { AuraSectionNav } from '../../features/aura/AuraSectionNav';

export function TodaysPlanPage() {
  const { accessToken, user } = useAuth();

  const canView = useMemo(
    () =>
      user
        ? hasAnyPermission(user.permissions, [
            'intelligence:read',
            'intelligence:write',
            'executive:read',
            'executive:write',
          ])
        : false,
    [user],
  );

  const canWrite = useMemo(
    () =>
      user
        ? canWriteCompanyMemory({
            roleName: user.roleName,
            permissions: user.permissions,
          })
        : false,
    [user],
  );

  if (!user || !canView || !accessToken) {
    return (
      <div className="page-shell">
        <PageHeader
          title="Today&apos;s Plan"
          description="You do not have permission to view today&apos;s plan."
        />
      </div>
    );
  }

  return (
    <div className="page-shell todays-plan-page">
      <PageHeader
        title="Today&apos;s Plan"
        description="Speak or type today’s priorities → Parse suggestions → Owner approve. No automatic payments or customer sends."
      />

      <AuraSectionNav />

      <div className="todays-plan-page__grid">
        <DayPlanningPanel accessToken={accessToken} canWrite={canWrite} />
        <CustomerFollowUpsSection accessToken={accessToken} canWrite={canWrite} />
      </div>
    </div>
  );
}
