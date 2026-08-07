import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { AppShell, Button } from '@titan/ui';
import {
  AI_NAME,
  NAV_MODULE_LABELS,
  NAV_MODULE_PRIMARY_HREF,
  resolveNavModuleForHref,
  selectModuleToolItems,
  selectPrimaryNavItems,
} from '@titan/shared';
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
import { AuditSandboxBanner } from '../components/AuditSandboxBanner';
import { SessionStatusBanner } from '../components/SessionStatusBanner';
import {
  HeaderSearchTrigger,
  ModuleToolbar,
  SearchCommandPalette,
  useSearchCommandPaletteShortcut,
  AppContentContainer,
} from '../components/ux';

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
  const { user, logout, accessToken, sessionUxState, dismissSessionUxState } = useAuth();
  const { logoFileId, companyName: profileCompanyName } = useCompanyLocale();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const openCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, []);

  useEffect(() => {
    setPendingHref(null);
  }, [location]);

  // MOBILE-001: close drawer on route change so content is never trapped under nav.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileNavOpen]);

  const activeLocation = pendingHref ?? location;

  // `navItems` stays the full permission-filtered registry. The sidebar shows
  // one landing page per business module; the rest surface inside their module,
  // so nothing is hidden from someone who could already open it.
  const navItems = useMemo(() => (user ? filterOwnerStaffNav(user) : []), [user]);
  const primaryNavItems = useMemo(() => selectPrimaryNavItems(navItems), [navItems]);
  const groupedNavItems = useMemo(() => groupNavItems(primaryNavItems), [primaryNavItems]);

  const activeModule = useMemo(() => resolveNavModuleForHref(activeLocation), [activeLocation]);
  const moduleToolItems = useMemo(
    () => (activeModule ? selectModuleToolItems(navItems, activeModule) : []),
    [navItems, activeModule],
  );
  const isTechnician = user ? isTechnicianRole(toStaffIdentity(user)) : false;
  const canSearch = user ? canAccessGlobalSearch(user.permissions) : false;
  useSearchCommandPaletteShortcut(openCommandPalette, canSearch);
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
              aria-controls="owner-mobile-nav"
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              <span aria-hidden="true" className="app-header__menu-glyph">
                {mobileNavOpen ? '✕' : '☰'}
              </span>
              <span className="app-header__menu-label">{mobileNavOpen ? 'Close' : 'Menu'}</span>
            </button>
            <div className="app-header__brand">
              <TitanWordmark variant="compact" className="app-header__wordmark" />
              <div className="app-header__brand-meta">
                <StagingBadge />
                <span className="brand-sub">
                  Powered by <span className="brand-sub__accent">{AI_NAME}</span>
                </span>
              </div>
              <span className="brand-credit">
                <span className="brand-credit__by">Built by</span>{' '}
                <span className="brand-credit__org">Young Guns Plumbing</span>
              </span>
            </div>
          </div>
          {canSearch ? (
            <div className="app-header__search">
              <HeaderSearchTrigger onClick={openCommandPalette} />
            </div>
          ) : null}
          <div className="app-header__user">
            {user ? (
              <>
                <Link
                  href="/settings/company"
                  className="app-header__identity"
                  title={`${user.firstName} ${user.lastName} — ${displayCompanyName} — ${user.roleName}`}
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
                    <span className="app-header__tenant">{displayCompanyName}</span>
                    <span className="app-header__role">{user.roleName}</span>
                  </span>
                </Link>
                {isTechnician ? (
                  <Link href="/mobile" className="app-header__link">
                    Field Mobile
                  </Link>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className="app-header__signout"
                  onClick={() => void logout()}
                >
                  <span className="app-header__signout-full">Sign Out</span>
                  <span className="app-header__signout-short" aria-hidden="true">
                    Out
                  </span>
                </Button>
              </>
            ) : null}
          </div>
        </div>
      }
      sidebar={
        <div className="app-sidebar" id="owner-mobile-nav">
          <div className="app-nav__toolbar">
            <button
              type="button"
              className="app-nav__collapse-toggle"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!sidebarCollapsed}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              <span aria-hidden="true">{sidebarCollapsed ? '›' : '‹'}</span>
            </button>
          </div>
          {user ? (
            <div className="app-sidebar__profile" aria-label="Signed-in profile">
              <span className="app-sidebar__profile-mark" aria-hidden="true">
                {accessToken && logoFileId ? (
                  <CompanyMediaImage
                    accessToken={accessToken}
                    fileId={logoFileId}
                    alt=""
                    className="app-header__identity-image"
                    fallback={companyInitials(displayCompanyName)}
                  />
                ) : (
                  companyInitials(displayCompanyName)
                )}
              </span>
              <span className="app-sidebar__profile-meta">
                <span className="app-sidebar__profile-name">
                  {user.firstName} {user.lastName}
                </span>
                <span className="app-sidebar__profile-tenant">{displayCompanyName}</span>
                <span className="app-sidebar__profile-role">{user.roleName}</span>
              </span>
            </div>
          ) : null}
          <nav className="app-nav" aria-label="Main Navigation">
            {groupedNavItems.map(({ group, items }) => {
              const groupHasActive = items.some(
                (entry) =>
                  activeLocation === entry.href ||
                  (entry.href !== '/' && activeLocation.startsWith(entry.href)),
              );
              return (
              <div
                key={group.id}
                className={`app-nav__group${groupHasActive ? ' app-nav__group--expanded' : ''}`}
              >
                {!sidebarCollapsed && group.label ? (
                  <p className="app-nav__group-label">{group.label}</p>
                ) : null}
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
                      <span className="app-nav__icon-slot">
                        <NavIcon name={item.label} />
                      </span>
                      <span className="app-nav__label">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
            })}
          </nav>
        </div>
      }
    >
      {mobileNavOpen ? (
        <button
          type="button"
          className="owner-shell__backdrop"
          aria-label="Close Navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <SessionStatusBanner state={sessionUxState} onDismiss={dismissSessionUxState} />
      <AuditSandboxBanner />
      <SearchCommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        canAccessSearch={canSearch}
      />
      <AppContentContainer>
        {activeModule ? (
          <ModuleToolbar
            moduleLabel={NAV_MODULE_LABELS[activeModule]}
            moduleHref={NAV_MODULE_PRIMARY_HREF[activeModule]}
            items={moduleToolItems}
            activeLocation={activeLocation}
            onNavigate={(href) => {
              setPendingHref(href);
              setMobileNavOpen(false);
            }}
            onIntent={handleNavIntent}
          />
        ) : null}
        {children}
      </AppContentContainer>
    </AppShell>
  );
}
