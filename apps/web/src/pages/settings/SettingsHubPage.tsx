import { useMemo } from 'react';
import { Link } from 'wouter';
import { Panel } from '@titan/ui';
import { hasAnyPermission } from '@titan/auth/browser';
import { useAuth } from '../../lib/auth-context';
import { Breadcrumbs, PageHeader } from '../../components/ux';

const SETTINGS_SECTIONS = [
  {
    href: '/settings/company',
    label: 'Company',
    description: 'Branding, locale, and company profile.',
    permissions: ['settings:manage', 'company:manage', '*'],
  },
  {
    href: '/settings/team',
    label: 'Team & Access',
    description: 'Users, roles, and invitations.',
    permissions: ['users:read', 'users:manage', '*'],
  },
  {
    href: '/settings/security',
    label: 'Security',
    description: 'MFA, sessions, and security policies.',
    permissions: ['security:read', 'security:manage', '*'],
  },
  {
    href: '/settings/portal',
    label: 'Client portal',
    description: 'Portal branding and client experience.',
    permissions: ['settings:manage', 'portal:manage', '*'],
  },
  {
    href: '/settings/cartrack',
    label: 'Cartrack',
    description: 'Fleet telematics integration settings.',
    permissions: ['integrations:read', 'integrations:manage', '*'],
  },
  {
    href: '/settings/billing',
    label: 'Billing',
    description: 'Subscription and billing (owner).',
    permissions: ['billing:read', 'billing:manage', '*'],
  },
  {
    href: '/settings/about',
    label: 'About',
    description: 'Version, support, and platform information.',
    permissions: ['settings:manage', '*'],
  },
  {
    href: '/enterprise-modules',
    label: 'Enterprise modules',
    description: 'Advanced modules reachable by URL.',
    permissions: ['company:manage', 'ops:read', 'executive:read', '*'],
  },
] as const;

export function SettingsHubPage() {
  const { user } = useAuth();

  const sections = useMemo(() => {
    if (!user) return [];
    return SETTINGS_SECTIONS.filter((section) =>
      hasAnyPermission(user.permissions, [...section.permissions]),
    );
  }, [user]);

  if (!user) {
    return null;
  }

  return (
    <div className="settings-page">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs items={[{ label: 'Settings' }]} />
        }
        title="Settings"
        description="Company configuration, team access, security, and integrations."
      />

      <Panel title="Settings sections">
        {sections.length === 0 ? (
          <p className="page-muted">No settings sections available for your role.</p>
        ) : (
          <ul className="enterprise-modules-list">
            {sections.map((section) => (
              <li key={section.href} className="enterprise-modules-list__item">
                <Link href={section.href} className="enterprise-modules-list__link">
                  <strong>{section.label}</strong>
                  <span className="page-muted">{section.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
