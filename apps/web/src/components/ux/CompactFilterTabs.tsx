import { useMemo } from 'react';

export type CompactFilterOption<T extends string = string> = {
  id: T;
  label: string;
};

type CompactFilterTabsProps<T extends string> = {
  options: CompactFilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  maxVisible?: number;
  className?: string;
};

/** Compact status filters — mirrors CompactTabs styling without route navigation. */
export function CompactFilterTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  maxVisible = 5,
  className = '',
}: CompactFilterTabsProps<T>) {
  const primary = useMemo(() => options.slice(0, maxVisible), [maxVisible, options]);
  const overflow = useMemo(() => options.slice(maxVisible), [maxVisible, options]);
  const overflowActive = overflow.some((option) => option.id === value);

  return (
    <nav className={`ux-compact-tabs ux-compact-tabs--filters ${className}`.trim()} aria-label={ariaLabel}>
      <div className="ux-compact-tabs__row">
        {primary.map((option) => {
          const isActive = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              className={`ux-compact-tabs__tab${isActive ? ' ux-compact-tabs__tab--active' : ''}`}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => onChange(option.id)}
            >
              {option.label}
            </button>
          );
        })}
        {overflow.length > 0 ? (
          <details className="ux-compact-tabs__overflow" open={overflowActive ? true : undefined}>
            <summary
              className={`ux-compact-tabs__tab ux-compact-tabs__tab--more${overflowActive ? ' ux-compact-tabs__tab--active' : ''}`}
            >
              More
            </summary>
            <div className="ux-compact-tabs__overflow-panel">
              {overflow.map((option) => {
                const isActive = option.id === value;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`ux-compact-tabs__overflow-item${isActive ? ' ux-compact-tabs__overflow-item--active' : ''}`}
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => onChange(option.id)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </details>
        ) : null}
      </div>
    </nav>
  );
}
