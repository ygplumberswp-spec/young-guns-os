import { Link } from 'wouter';
import { hasAnyPermission } from '@titan/auth/browser';
import { Panel } from '@titan/ui';
import { useAuth } from '../../lib/auth-context';
import type { ReactElement } from 'react';

type QuickLinkTone =
  | 'job'
  | 'quote'
  | 'invoice'
  | 'customers'
  | 'schedule'
  | 'inventory'
  | 'fleet'
  | 'reports';

type QuickLink = {
  href: string;
  label: string;
  create?: boolean;
  tone: QuickLinkTone;
  permissions: string[];
  icon: ReactElement;
};

const ICON_PROPS = {
  width: 26,
  height: 26,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.55,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

const QUICK_LINKS: QuickLink[] = [
  {
    href: '/jobs/new',
    label: 'New Job',
    create: true,
    tone: 'job',
    permissions: ['jobs:write', '*'],
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    href: '/finance/quotes/new',
    label: 'New Quote',
    create: true,
    tone: 'quote',
    permissions: ['finance:write', '*'],
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M8 13h8M8 17h5" />
      </svg>
    ),
  },
  {
    href: '/finance/invoices/new',
    label: 'New Invoice',
    create: true,
    tone: 'invoice',
    permissions: ['finance:write', '*'],
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 15h4" />
      </svg>
    ),
  },
  {
    href: '/crm',
    label: 'Customers',
    tone: 'customers',
    permissions: ['customers:read', 'customers:write', '*'],
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/scheduling',
    label: 'Schedule',
    tone: 'schedule',
    permissions: ['dispatch:read', 'jobs:read', '*'],
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    href: '/inventory/products',
    label: 'Inventory',
    tone: 'inventory',
    permissions: ['inventory:read', 'inventory:write', '*'],
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <path d="M3.3 7 12 12l8.7-5M12 22V12" />
      </svg>
    ),
  },
  {
    href: '/fleet',
    label: 'Fleet',
    tone: 'fleet',
    permissions: ['fleet:read', 'fleet:write', '*'],
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3 17h13v-5H3zM16 12h3l2 3v2h-5z" />
        <circle cx="6.5" cy="17.5" r="1.5" />
        <circle cx="17.5" cy="17.5" r="1.5" />
      </svg>
    ),
  },
  {
    href: '/analytics',
    label: 'Reports',
    tone: 'reports',
    permissions: ['analytics:read', 'intelligence:read', '*'],
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M4 19V5M4 19h16M8 17V9M12 17v-6M16 17V7" />
      </svg>
    ),
  },
];

export function QuickLinksPanel() {
  const { user } = useAuth();
  if (!user) return null;

  const links = QUICK_LINKS.filter((link) => hasAnyPermission(user.permissions, link.permissions));
  if (links.length === 0) return null;

  return (
    <Panel title="Quick Links" description="Premium shortcuts into daily operations">
      <div className="exec-quick-links">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`exec-quick-links__item exec-quick-links__item--${link.tone}`}
          >
            <span className="exec-quick-links__icon-wrap" aria-hidden="true">
              {link.icon}
            </span>
            <span className="exec-quick-links__label">
              {link.create ? <span className="exec-quick-links__plus">+</span> : null}
              {link.label}
            </span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}
