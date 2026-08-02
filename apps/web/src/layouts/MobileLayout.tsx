import { type ReactNode, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@titan/ui';
import { AI_NAME } from '@titan/shared';
import { useAuth } from '../lib/auth-context';
import { mobileHrefMatchesLocation, toMobileNestedHref } from '../lib/nested-routing';
import { filterTechnicianNav } from '../lib/role-experience';
import { prefetchNavIntent } from '../lib/route-prefetch-registry';
import { useStaffPreloadContext } from '../lib/preload-coordinator';
import { TitanWordmark } from '../brand/TitanWordmark';
import { StagingBadge } from '../components/StagingBadge';

type MobileLayoutProps = {
  children: ReactNode;
};

export function MobileLayout({ children }: MobileLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const navItems = useMemo(() => (user ? filterTechnicianNav(user) : []), [user]);
  const preloadContext = useStaffPreloadContext();

  const handleNavIntent = (href: string) => {
    if (preloadContext) {
      prefetchNavIntent(href, preloadContext);
    }
  };

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div className="portal-header__brand-block">
          <TitanWordmark variant="compact" className="portal-header__wordmark" />
          <StagingBadge />
          <span className="portal-brand">Field Mobile</span>
          <span className="brand-sub">
            Powered by <span className="brand-sub__accent">{AI_NAME}</span>
          </span>
          <span className="brand-credit">
            <span className="brand-credit__by">Built by</span>{' '}
            <span className="brand-credit__org">Young Guns Plumbing</span>
          </span>
        </div>
        <div className="portal-header__user">
          {user ? (
            <>
              <div className="portal-header__meta">
                <span className="portal-header__name">
                  {user.firstName} {user.lastName}
                </span>
                <span className="portal-header__company">{user.companyName}</span>
                <span className="portal-header__role">{user.roleName}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void logout()}>
                Sign Out
              </Button>
            </>
          ) : null}
        </div>
      </header>
      <div className="portal-body">
        <nav className="portal-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={toMobileNestedHref(item.href)}
              className={`portal-nav__link ${mobileHrefMatchesLocation(item.href, location) ? 'portal-nav__link--active' : ''}`}
              onMouseEnter={() => handleNavIntent(item.href)}
              onFocus={() => handleNavIntent(item.href)}
              onTouchStart={() => handleNavIntent(item.href)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="portal-main">{children}</main>
      </div>
    </div>
  );
}
