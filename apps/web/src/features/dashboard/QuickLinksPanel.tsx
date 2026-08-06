import { Link } from 'wouter';
import { hasAnyPermission } from '@titan/auth/browser';
import { Panel } from '@titan/ui';
import { useAuth } from '../../lib/auth-context';
import type { ReactElement } from 'react';

type QuickLinkTone = 'job' | 'quote' | 'invoice' | 'customers' | 'fleet' | 'aura';

type QuickLink = {
  href: string;
  label: string;
  hint: string;
  create?: boolean;
  tone: QuickLinkTone;
  permissions: string[];
  icon: ReactElement;
};

const ICON_PROPS = {
  width: 18,
  height: 18,
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
    hint: 'Create a job',
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
    hint: 'Create a quote',
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
    hint: 'Create an invoice',
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
    href: '/crm/new',
    label: 'New Customer',
    hint: 'Add a customer',
    create: true,
    tone: 'customers',
    permissions: ['customers:write', '*'],
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M19 8v6M22 11h-6" />
      </svg>
    ),
  },
  {
    href: '/fleet',
    label: 'Open Fleet Map',
    hint: 'Track vehicles',
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
    href: '/aura',
    label: 'AURA Executive Chat',
    hint: 'AI assistant',
    tone: 'aura',
    permissions: ['aura:read', 'aura:write', 'intelligence:read', '*'],
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
        <circle cx="12" cy="12" r="3.2" />
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
    <Panel title="Quick Links" description="Shortcuts to daily actions">
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
            <span className="exec-quick-links__text">
              <span className="exec-quick-links__label">
                {link.create ? <span className="exec-quick-links__plus">+</span> : null}
                {link.label}
              </span>
              <span className="exec-quick-links__hint">{link.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}
