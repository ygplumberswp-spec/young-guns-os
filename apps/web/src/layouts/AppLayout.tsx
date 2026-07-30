import { type ReactNode, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { AppShell, Button } from '@titan/ui';
import { AI_NAME, APP_NAME } from '@titan/shared';
import { isTechnicianRole } from '@titan/auth/browser';
import { useAuth } from '../lib/auth-context';
import { filterOwnerStaffNav, toStaffIdentity } from '../lib/role-experience';

type AppLayoutProps = {
  children: ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const navItems = useMemo(() => (user ? filterOwnerStaffNav(user) : []), [user]);
  const isTechnician = user ? isTechnicianRole(toStaffIdentity(user)) : false;

  return (
    <AppShell
      header={
        <div className="app-header">
          <div>
            <span className="brand">{APP_NAME}</span>
            <span className="brand-sub">powered by {AI_NAME}</span>
          </div>
          <div className="app-header__user">
            {user ? (
              <>
                <div className="app-header__meta">
                  <span className="app-header__name">
                    {user.firstName} {user.lastName}
                  </span>
                  <span className="app-header__company">
                    {user.companyName} · {user.roleName}
                  </span>
                </div>
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
        <nav className="app-nav">
          {navItems.map((item) => (
            <Link
              key={`${item.href}:${item.label}`}
              href={item.href}
              className={`app-nav__link ${location === item.href || (item.href !== '/' && location.startsWith(item.href)) ? 'app-nav__link--active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      }
    >
      {children}
    </AppShell>
  );
}
