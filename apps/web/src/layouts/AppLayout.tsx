import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { AppShell, Button } from '@titan/ui';
import { AI_NAME, APP_NAME } from '@titan/shared';
import { useAuth } from '../lib/auth-context';

type AppLayoutProps = {
  children: ReactNode;
};

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/crm', label: 'Customers' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/scheduling', label: 'Schedule' },
  { href: '/finance/quotes', label: 'Finance' },
  { href: '/inventory/products', label: 'Inventory' },
  { href: '/fleet', label: 'Fleet' },
  { href: '/communications/messages', label: 'Comms' },
  { href: '/documents', label: 'Documents' },
  { href: '/platform', label: 'Platform' },
  { href: '/saas-management', label: 'SaaS Management' },
  { href: '/voice-reception', label: 'Voice Reception' },
  { href: '/document-ai', label: 'Document AI' },
  { href: '/business-continuity', label: 'Business Continuity' },
  { href: '/global-search', label: 'Global Search' },
  { href: '/data-migration', label: 'Data Migration' },
  { href: '/notifications', label: 'Notifications' },
  { href: '/platform-health', label: 'Platform Health' },
  { href: '/launch-center', label: 'Launch Center' },
  { href: '/release-center', label: 'Release Center' },
  { href: '/go-live', label: 'Go-Live Center' },
  { href: '/release', label: 'TITAN v1.0 Release' },
  { href: '/developers', label: 'Developers' },
  { href: '/developer', label: 'Developer Portal' },
  { href: '/evolution', label: 'Evolution' },
  { href: '/mission-control', label: 'Mission Control' },
  { href: '/knowledge', label: 'Knowledge' },
  { href: '/digital-twin', label: 'Digital Twin' },
  { href: '/automation-studio', label: 'Automation Studio' },
  { href: '/automation', label: 'Automation' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/quality', label: 'Quality' },
  { href: '/communications-intelligence', label: 'Comms Intel' },
  { href: '/asset-equipment', label: 'Assets' },
  { href: '/ai-orchestration', label: 'AI Orchestration' },
  { href: '/dispatch-intelligence', label: 'Dispatch' },
  { href: '/fleet-intelligence', label: 'Fleet Intel' },
  { href: '/security', label: 'Security' },
  { href: '/personal-communications-intelligence', label: 'Comms Assistant' },
  { href: '/recruiting', label: 'Recruiting' },
  { href: '/aura/agents', label: 'Agents' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/settings/portal', label: 'Portal' },
  { href: '/aura', label: 'AURA' },
  { href: '/settings/company', label: 'Company' },
  { href: '/settings/team', label: 'Team' },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

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
                  <span className="app-header__company">{user.companyName}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void logout()}>
                  Sign out
                </Button>
              </>
            ) : null}
          </div>
        </div>
      }
      sidebar={
        <nav>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${location === item.href || (item.href !== '/' && location.startsWith(item.href)) ? 'nav-link--active' : ''}`}
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
