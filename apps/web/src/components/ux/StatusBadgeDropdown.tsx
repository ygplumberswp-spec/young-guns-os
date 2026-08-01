import { useEffect, useId, useRef, useState } from 'react';
import type { StatusColorTone } from '@titan/shared';
import { StatusBadge, type StatusBadgeTone } from './StatusBadge';
import { InlineSaveIndicator, type InlineSaveState } from './InlineSaveIndicator';

export type StatusBadgeDropdownOption = {
  id: string;
  label: string;
  disabled?: boolean;
  hidden?: boolean;
};

type StatusBadgeDropdownProps = {
  label: string;
  tone?: StatusColorTone;
  options: StatusBadgeDropdownOption[];
  onSelect: (optionId: string) => void;
  canChange: boolean;
  saveState?: InlineSaveState;
  ariaLabel?: string;
};

function mapTone(tone: StatusColorTone): StatusBadgeTone {
  switch (tone) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'danger':
      return 'danger';
    case 'info':
      return 'info';
    case 'muted':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Compact clickable status badge that opens a status picker dropdown. */
export function StatusBadgeDropdown({
  label,
  tone = 'neutral',
  options,
  onSelect,
  canChange,
  saveState = 'idle',
  ariaLabel = 'Change status',
}: StatusBadgeDropdownProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const visibleOptions = options.filter((option) => !option.hidden);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const isSaving = saveState === 'saving';

  if (!canChange) {
    return (
      <span className="ux-status-badge-dropdown ux-status-badge-dropdown--readonly">
        <StatusBadge label={label} tone={mapTone(tone)} />
        <InlineSaveIndicator state={saveState} />
      </span>
    );
  }

  return (
    <div className="ux-status-badge-dropdown" ref={rootRef}>
      <button
        type="button"
        className="ux-status-badge-dropdown__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel}
        disabled={isSaving}
        onClick={() => setOpen((value) => !value)}
      >
        <StatusBadge label={label} tone={mapTone(tone)} className="ux-status-badge-dropdown__badge" />
        <span className="ux-status-badge-dropdown__chevron" aria-hidden>
          ▾
        </span>
      </button>
      <InlineSaveIndicator state={saveState} />
      {open ? (
        <ul id={menuId} className="ux-status-badge-dropdown__panel" role="menu">
          {visibleOptions.map((option) => (
            <li key={option.id} role="none">
              <button
                type="button"
                className="ux-status-badge-dropdown__item"
                role="menuitem"
                disabled={option.disabled || isSaving}
                onClick={() => {
                  onSelect(option.id);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
