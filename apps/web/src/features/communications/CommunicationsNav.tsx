import { Link, useLocation } from 'wouter';

const tabs = [
  { href: '/communications/messages', label: 'History' },
  { href: '/communications/templates', label: 'Templates' },
];

export function CommunicationsNav() {
  const [location] = useLocation();

  return (
    <nav className="communications-nav" aria-label="Communications Sections">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`communications-nav__link ${location.startsWith(tab.href) ? 'communications-nav__link--active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
