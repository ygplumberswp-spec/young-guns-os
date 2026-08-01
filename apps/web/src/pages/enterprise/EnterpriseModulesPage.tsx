import { PageHeader } from '../../components/ux';
import { useMemo } from 'react';
import { Link } from 'wouter';
import { EmptyState, Panel } from '@titan/ui';
import { ENTERPRISE_MODULE_LINKS } from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import { filterOwnerStaffNav } from '../../lib/role-experience';

/**
 * UX-K / UX-048 — honest index of enterprise modules that remain URL-reachable.
 * Primary nav links here instead of silently orphaning routes.
 */
export function EnterpriseModulesPage() {
  const { user } = useAuth();
  const canView = useMemo(() => {
    if (!user) return false;
    return filterOwnerStaffNav(user).some((item) => item.href === '/enterprise-modules');
  }, [user]);

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader
          title="Enterprise modules"
          description="You do not have permission to browse enterprise modules."
        />
      </div>
    );
  }

  return (
    <div className="automation-page">
      <PageHeader
        title="Enterprise modules"
        description="These Owner modules are reachable in TITAN. They are listed here deliberately so they are not hidden orphans from primary navigation."
      />

      {ENTERPRISE_MODULE_LINKS.length === 0 ? (
        <EmptyState
          title="No enterprise modules listed"
          description="Enterprise module index is empty."
        />
      ) : (
        <Panel title="Available modules">
          <ul className="enterprise-modules-list">
            {ENTERPRISE_MODULE_LINKS.map((module) => (
              <li key={module.href} className="enterprise-modules-list__item">
                <Link href={module.href} className="enterprise-modules-list__link">
                  <strong>{module.label}</strong>
                  <span className="page-muted">{module.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="page-muted" style={{ marginTop: '1rem' }}>
            Capability depth on each module follows existing honesty rules — this index does not
            claim live provider connectivity.
          </p>
        </Panel>
      )}
    </div>
  );
}
