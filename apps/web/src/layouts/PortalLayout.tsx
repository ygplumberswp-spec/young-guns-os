import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@titan/ui';
import { usePortalAuth } from '../lib/portal-auth-context';

type PortalLayoutProps = {
  children: ReactNode;
};

const NAV_ITEMS = [
  { href: '/portal', label: 'Dashboard' },
  { href: '/portal/jobs', label: 'Jobs' },
  { href: '/portal/quotes', label: 'Quotes' },
  { href: '/portal/finance', label: 'Finance' },
  { href: '/portal/appointments', label: 'Appointments' },
  { href: '/portal/communications', label: 'Communications' },
  { href: '/portal/knowledge', label: 'Knowledge' },
  { href: '/portal/notifications', label: 'Notifications' },
];

export function PortalLayout({ children }: PortalLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = usePortalAuth();

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
