import { type ReactNode, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@titan/ui';
import { usePortalAuth } from '../lib/portal-auth-context';
import { filterPortalNav } from '../lib/role-experience';

type PortalLayoutProps = {
  children: ReactNode;
};

export function PortalLayout({ children }: PortalLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = usePortalAuth();

  const navItems = useMemo(
    () => (user ? filterPortalNav(user.permissions) : []),
    [user],
  );

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div>
          <span className="portal-brand">Customer Portal</span>
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
              href={item.href}
              className={`portal-nav__link ${location === item.href ? 'portal-nav__link--active' : ''}`}
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
