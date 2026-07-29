import { Link, useLocation } from 'wouter';

const tabs = [
  {
    href: '/integrations',
    label: 'Dashboard',
    match: (location: string) => location === '/integrations',
  },
  {
    href: '/integrations/sync-jobs',
    label: 'Sync Jobs',
    match: (location: string) => location.startsWith('/integrations/sync-jobs'),
  },
  {
    href: '/integrations/webhooks',
    label: 'Webhooks',
    match: (location: string) => location.startsWith('/integrations/webhooks'),
  },
  {
    href: '/integrations/cartrack',
    label: 'Cartrack',
    match: (location: string) => location.startsWith('/integrations/cartrack'),
  },
  {
    href: '/integrations/xero',
    label: 'Xero',
    match: (location: string) => location.startsWith('/integrations/xero'),
  },
  {
    href: '/integrations/email',
    label: 'Email',
    match: (location: string) => location.startsWith('/integrations/email'),
  },
  {
    href: '/integrations/yoco',
    label: 'Yoco',
    match: (location: string) => location.startsWith('/integrations/yoco'),
  },
  {
    href: '/integrations/whatsapp',
    label: 'WhatsApp',
    match: (location: string) => location.startsWith('/integrations/whatsapp'),
  },
];

export function IntegrationsNav() {
  const [location] = useLocation();

  return (
    <nav className="integrations-nav" aria-label="Integrations sections">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`integrations-nav__link ${tab.match(location) ? 'integrations-nav__link--active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
