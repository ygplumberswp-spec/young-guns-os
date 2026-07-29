import { Link, useLocation } from 'wouter';

const tabs = [
  {
    href: '/automation',
    label: 'Workflows',
    match: (location: string) =>
      location === '/automation' ||
      (location.startsWith('/automation/') && !location.startsWith('/automation/executions')),
  },
  {
    href: '/automation/executions',
    label: 'Executions',
    match: (location: string) => location.startsWith('/automation/executions'),
  },
];

export function AutomationNav() {
  const [location] = useLocation();

  return (
    <nav className="automation-nav" aria-label="Automation sections">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`automation-nav__link ${tab.match(location) ? 'automation-nav__link--active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
