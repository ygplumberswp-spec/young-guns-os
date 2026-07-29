import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@titan/ui';
import { useAuth } from '../lib/auth-context';

type MobileLayoutProps = {
  children: ReactNode;
};

const NAV_ITEMS = [
  { href: '/mobile', label: 'Dashboard' },
  { href: '/mobile/jobs', label: 'Jobs' },
  { href: '/mobile/route', label: 'Route' },
  { href: '/mobile/inventory', label: 'Inventory' },
  { href: '/mobile/time', label: 'Time' },
  { href: '/mobile/notifications', label: 'Notifications' },
  { href: '/mobile/sync', label: 'Offline sync' },
];

export function MobileLayout({ children }: MobileLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div>
          <span className="portal-brand">Field Mobile</span>
          {user ? <span className="portal-brand-sub">{user.companyName}</span> : null}
        </div>
        <div className="portal-header__user">
          {user ? (
            <>
              <div className="portal-header__meta">
                <span className="portal-header__name">
                  {user.firstName} {user.lastName}
                </span>
                <span className="portal-header__company">Technician</span>
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
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
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
