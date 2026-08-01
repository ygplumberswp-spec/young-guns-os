import type { ReactNode } from 'react';
import { useLocation } from 'wouter';

/** Routes that need full-width layout (calendars, dispatch maps, large tables). */
const WIDE_ROUTE_PREFIXES = [
  '/scheduling',
  '/mobile-platform/dispatcher',
  '/workforce/day-timeline',
  '/dispatch-intelligence',
];

type AppContentContainerProps = {
  children: ReactNode;
};

export function AppContentContainer({ children }: AppContentContainerProps) {
  const [location] = useLocation();
  const isWide = WIDE_ROUTE_PREFIXES.some(
    (prefix) => location === prefix || location.startsWith(`${prefix}/`),
  );

  const className = [
    'app-content-container',
    isWide ? 'app-content-container--wide' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={className}>{children}</div>;
}
