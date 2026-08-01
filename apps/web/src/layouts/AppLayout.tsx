import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { AppShell, Button } from '@titan/ui';
import { AI_NAME } from '@titan/shared';
import { isTechnicianRole } from '@titan/auth/browser';
import { useAuth } from '../lib/auth-context';
import { useCompanyLocale } from '../lib/company-locale-context';
import { filterOwnerStaffNav, toStaffIdentity } from '../lib/role-experience';
import { canAccessGlobalSearch } from '../features/global-search/utils';
import { groupNavItems } from '../lib/nav-groups';
import { prefetchNavIntent } from '../lib/route-prefetch-registry';
import { useStaffPreloadContext } from '../lib/preload-coordinator';
import { CompanyMediaImage } from '../features/company/CompanyMediaImage';
import { NavIcon } from '../components/NavIcon';
import { TitanWordmark } from '../brand/TitanWordmark';
import { StagingBadge } from '../components/StagingBadge';

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CO';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

type AppLayoutProps = {
  children: ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const { user, logout, accessToken } = useAuth();
  const { logoFileId, companyName: profileCompanyName } = useCompanyLocale();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setPendingHref(null);
  }, [location]);

  const activeLocation = pendingHref ?? location;

  const navItems = useMemo(() => (user ? filterOwnerStaffNav(user) : []), [user]);
  const groupedNavItems = useMemo(() => groupNavItems(navItems), [navItems]);
  const isTechnician = user ? isTechnicianRole(toStaffIdentity(user)) : false;
  const canSearch = user ? canAccessGlobalSearch(user.permissions) : false;
  const displayCompanyName = profileCompanyName ?? user?.companyName ?? 'Company';
  const preloadContext = useStaffPreloadContext();

  const handleNavIntent = (href: string) => {
    if (preloadContext) {
      prefetchNavIntent(href, preloadContext);
    }
  };

  const shellClassName = [
    'owner-shell',
    sidebarCollapsed ? 'owner-shell--collapsed' : '',
    mobileNavOpen ? 'owner-shell--mobile-nav-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <AppShell
      className={shellClassName}
      header={
        <div className="app-header">
          <div className="app-header__start">
            <button
              type="button"
              className="app-header__menu-toggle"
              aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              Menu
            </button>
            <div className="app-header__brand">
              <TitanWordmark variant="compact" className="app-header__wordmark" />
              <StagingBadge />
              <span className="brand-sub">
                Powered by <span className="brand-sub__accent">{AI_NAME}</span>
              </span>
              <span className="brand-credit">Built by Young Guns Plumbing</span>
            </div>
          </div>
          <div className="app-header__user">
            {user ? (
              <>
                <Link
                  href="/settings/company"
                  className="app-header__identity"
                  title={`${user.firstName} ${user.lastName} — ${displayCompanyName} · ${user.roleName}`}
                >
                  <span className="app-header__identity-mark" aria-hidden="true">
                    {accessToken && logoFileId ? (
                      <CompanyMediaImage
                        accessToken={accessToken}
                        fileId={logoFileId}
                        alt={`${displayCompanyName} logo`}
                        className="app-header__identity-image"
                        fallback={companyInitials(displayCompanyName)}
                      />
                    ) : (
                      companyInitials(displayCompanyName)
                    )}
                  </span>
                  <span className="app-header__meta">
                    <span className="app-header__name">
                      {user.firstName} {user.lastName}
                    </span>
                    <span className="app-header__tenant">
                      {displayCompanyName} · {user.roleName}
                    </span>
                  </span>
                </Link>
                {canSearch ? (
                  <Link href="/global-search" className="app-header__link">
                    Search
                  </Link>
                ) : null}
                {isTechnician ? (
                  <Link href="/mobile" className="app-header__link">
                    Field Mobile
                  </Link>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => void logout()}>
                  Sign out
                </Button>
              </>
            ) : null}
          </div>
        </div>
      }
      sidebar={
        <div className="app-sidebar">
          <div className="app-nav__toolbar">
            <button
              type="button"
              className="app-nav__collapse-toggle"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!sidebarCollapsed}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              {sidebarCollapsed ? '»' : '«'}
            </button>
          </div>
          <nav className="app-nav" aria-label="Main navigation">
            {groupedNavItems.map(({ group, items }) => (
              <div key={group.id} className="app-nav__group">
                {!sidebarCollapsed ? <p className="app-nav__group-label">{group.label}</p> : null}
                {items.map((item) => {
                  const isActive =
                    activeLocation === item.href ||
                    (item.href !== '/' && activeLocation.startsWith(item.href));

                  return (
                    <Link
                      key={`${item.href}:${item.label}`}
                      href={item.href}
                      className={`app-nav__link${isActive ? ' app-nav__link--active' : ''}`}
                      title={sidebarCollapsed ? item.label : undefined}
                      onClick={() => {
                        setPendingHref(item.href);
                        setMobileNavOpen(false);
                      }}
                      onMouseEnter={() => handleNavIntent(item.href)}
                      onFocus={() => handleNavIntent(item.href)}
                      onTouchStart={() => handleNavIntent(item.href)}
                    >
                      <NavIcon name={item.label} />
                      <span className="app-nav__label">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
      }
    >
      {mobileNavOpen ? (
        <button
          type="button"
          className="owner-shell__backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      {children}
    </AppShell>
  );
}
