import { Link, useLocation } from 'wouter';

export type CompactTabItem = {
  href: string;
  label: string;
  hidden?: boolean;
};

type CompactTabsProps = {
  tabs: CompactTabItem[];
  ariaLabel: string;
  maxVisible?: number;
  className?: string;
};

/** Horizontal tabs — surfaces up to maxVisible (default 5); remainder under overflow if needed. */
export function CompactTabs({
  tabs,
  ariaLabel,
  maxVisible = 5,
  className = '',
}: CompactTabsProps) {
  const [location] = useLocation();
  const visible = tabs.filter((tab) => !tab.hidden);
  const primary = visible.slice(0, maxVisible);
  const overflow = visible.slice(maxVisible);

  return (
    <nav className={`ux-compact-tabs ${className}`.trim()} aria-label={ariaLabel}>
      <div className="ux-compact-tabs__row">
        {primary.map((tab) => {
          const isActive = location === tab.href || location.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`ux-compact-tabs__tab${isActive ? ' ux-compact-tabs__tab--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
        {overflow.length > 0 ? (
          <details className="ux-compact-tabs__overflow">
            <summary className="ux-compact-tabs__tab ux-compact-tabs__tab--more">More</summary>
            <div className="ux-compact-tabs__overflow-panel">
              {overflow.map((tab) => {
                const isActive = location === tab.href || location.startsWith(`${tab.href}/`);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`ux-compact-tabs__overflow-item${isActive ? ' ux-compact-tabs__overflow-item--active' : ''}`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </details>
        ) : null}
      </div>
    </nav>
  );
}
