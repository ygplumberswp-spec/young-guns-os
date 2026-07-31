import { type ReactNode, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@titan/ui';
import { AI_NAME } from '@titan/shared';
import { usePortalAuth } from '../lib/portal-auth-context';
import { filterPortalNav } from '../lib/role-experience';
import { portalHrefMatchesLocation, toPortalNestedHref } from '../lib/portal-routing';
import { prefetchNavIntent } from '../lib/route-prefetch-registry';
import { usePortalPreloadContext } from '../lib/preload-coordinator';
import { TitanWordmark } from '../brand/TitanWordmark';
import { StagingBadge } from '../components/StagingBadge';

type PortalLayoutProps = {
  children: ReactNode;
};

export function PortalLayout({ children }: PortalLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = usePortalAuth();

  const navItems = useMemo(() => (user ? filterPortalNav(user.permissions) : []), [user]);
  const preloadContext = usePortalPreloadContext();

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
          <span className="portal-brand">Customer Portal</span>
          <span className="brand-sub">
            Powered by <span className="brand-sub__accent">{AI_NAME}</span>
          </span>
          <span className="brand-credit">Built by Young Guns Plumbing</span>
          {user ? <span className="portal-brand-sub">{user.companyName}</span> : null}
        </div>
        <div className="portal-header__user">
          {user ? (
            <>
              <div className="portal-header__meta">
                <span className="portal-header__name">
                  {user.firstName} {user.lastName}
                </span>
                <span className="portal-header__company">{user.customerName}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void logout()}>
                Sign out
              </Button>
            </>
          ) : null}
        </div>
      </header>
      <div className="portal-body">
        <nav className="portal-nav">
          {navItems.map((item) => (
            <Link
              key={`${item.href}:${item.label}`}
              href={toPortalNestedHref(item.href)}
              className={`portal-nav__link ${portalHrefMatchesLocation(item.href, location) ? 'portal-nav__link--active' : ''}`}
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
