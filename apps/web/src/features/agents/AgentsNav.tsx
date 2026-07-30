import { Link, useLocation } from 'wouter';

const tabs = [
  {
    href: '/aura/agents',
    label: 'Capabilities',
    match: (location: string) =>
      location === '/aura/agents' ||
      (location.startsWith('/aura/agents/') &&
        !location.startsWith('/aura/agents/executions') &&
        !location.startsWith('/aura/agents/new')),
  },
  {
    href: '/aura/agents/executions',
    label: 'Executions',
    match: (location: string) => location.startsWith('/aura/agents/executions'),
  },
];

export function AgentsNav() {
  const [location] = useLocation();

  return (
    <nav className="agents-nav" aria-label="AURA agent sections">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`agents-nav__link ${tab.match(location) ? 'agents-nav__link--active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
