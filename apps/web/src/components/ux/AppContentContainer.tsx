import type { ReactNode } from 'react';
import { useLocation } from 'wouter';

/**
 * Routes that opt into full-bleed main width explicitly.
 * Default container is already uncapped (V1 responsive layout); this flag
 * remains for semantic wide layouts (calendars, maps, large tables).
 */
const WIDE_ROUTE_PREFIXES = [
  '/',
  '/crm',
  '/leads',
  '/jobs',
  '/scheduling',
  '/finance',
  '/fleet',
  '/fleet-intelligence',
  '/inventory',
  '/procurement',
  '/documents',
  '/communications',
  '/communications-hub',
  '/communications-intelligence',
  '/analytics',
  '/reports',
  '/aura',
  '/settings',
  '/integrations',
  '/mission-control',
  '/mobile-platform/dispatcher',
  '/workforce/day-timeline',
  '/dispatch-intelligence',
  '/automation',
  '/automation-studio',
  '/sales-intelligence',
  '/marketing-intelligence',
  '/enterprise-security',
];

/** Narrow only for dense prose / single-column reading surfaces. */
const NARROW_ROUTE_PREFIXES: string[] = [];

type AppContentContainerProps = {
  children: ReactNode;
};

function matchesPrefix(location: string, prefix: string): boolean {
  if (prefix === '/') {
    return location === '/' || location === '';
  }
  return location === prefix || location.startsWith(`${prefix}/`);
}

export function AppContentContainer({ children }: AppContentContainerProps) {
  const [location] = useLocation();
  const isNarrow = NARROW_ROUTE_PREFIXES.some((prefix) => matchesPrefix(location, prefix));
  const isWide =
    !isNarrow &&
    WIDE_ROUTE_PREFIXES.some((prefix) => matchesPrefix(location, prefix));

  const className = [
    'app-content-container',
    isNarrow ? 'app-content-container--narrow' : '',
    isWide ? 'app-content-container--wide' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={className}>{children}</div>;
}
