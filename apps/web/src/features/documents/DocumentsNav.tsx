import { Link, useLocation } from 'wouter';

const tabs = [
  {
    href: '/documents',
    label: 'Documents',
    match: (location: string) =>
      location === '/documents' ||
      (location.startsWith('/documents/') && !location.startsWith('/documents/categories')),
  },
  {
    href: '/documents/categories',
    label: 'Categories',
    match: (location: string) => location.startsWith('/documents/categories'),
  },
];

export function DocumentsNav() {
  const [location] = useLocation();

  return (
    <nav className="documents-nav" aria-label="Documents sections">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`documents-nav__link ${tab.match(location) ? 'documents-nav__link--active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
