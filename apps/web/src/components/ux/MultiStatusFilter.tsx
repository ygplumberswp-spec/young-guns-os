import type { StatusColorTone } from '@titan/shared';

export type MultiStatusFilterOption = {
  id: string;
  label: string;
  tone?: StatusColorTone;
};

type MultiStatusFilterProps = {
  options: MultiStatusFilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  ariaLabel: string;
  className?: string;
};

/** Compact multi-select status filter pills above list tables. */
export function MultiStatusFilter({
  options,
  selected,
  onChange,
  ariaLabel,
  className = '',
}: MultiStatusFilterProps) {
  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((entry) => entry !== id));
      return;
    }
    onChange([...selected, id]);
  }

  return (
    <div
      className={`ux-multi-status-filter ${className}`.trim()}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className={`ux-multi-status-filter__pill${selected.length === 0 ? ' ux-multi-status-filter__pill--active' : ''}`}
        onClick={() => onChange([])}
      >
        All
      </button>
      {options.map((option) => {
        const isActive = selected.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            className={`ux-multi-status-filter__pill ux-multi-status-filter__pill--${option.tone ?? 'neutral'}${isActive ? ' ux-multi-status-filter__pill--active' : ''}`}
            aria-pressed={isActive}
            onClick={() => toggle(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
