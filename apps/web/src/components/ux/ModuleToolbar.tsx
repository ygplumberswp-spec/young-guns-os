import { Link } from 'wouter';
import type { NavItemConfig } from '@titan/shared';

type ModuleToolbarProps = {
  moduleLabel: string;
  moduleHref: string;
  items: NavItemConfig[];
  activeLocation: string;
  onNavigate?: (href: string) => void;
  onIntent?: (href: string) => void;
};

function isActive(location: string, href: string): boolean {
  return location === href || location.startsWith(`${href}/`);
}

/**
 * In-module navigation. The sidebar lists business modules; the pages that
 * support a module appear here once you are inside it, so consolidating the
 * sidebar never puts a page out of reach.
 *
 * Items arrive already permission-filtered by the same rules the sidebar uses,
 * so this shows nothing the person could not already open.
 */
export function ModuleToolbar({
  moduleLabel,
  moduleHref,
  items,
  activeLocation,
  onNavigate,
  onIntent,
}: ModuleToolbarProps) {
  if (items.length === 0) return null;

  const overviewActive = activeLocation === moduleHref;

  return (
    <nav className="module-toolbar" aria-label={`${moduleLabel} sections`}>
      <Link
        href={moduleHref}
        className={`module-toolbar__link${overviewActive ? ' module-toolbar__link--active' : ''}`}
        aria-current={overviewActive ? 'page' : undefined}
        onClick={() => onNavigate?.(moduleHref)}
        onMouseEnter={() => onIntent?.(moduleHref)}
        onFocus={() => onIntent?.(moduleHref)}
      >
        {moduleLabel}
      </Link>
      {items.map((item) => {
        const active = isActive(activeLocation, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`module-toolbar__link${active ? ' module-toolbar__link--active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => onNavigate?.(item.href)}
            onMouseEnter={() => onIntent?.(item.href)}
            onFocus={() => onIntent?.(item.href)}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
