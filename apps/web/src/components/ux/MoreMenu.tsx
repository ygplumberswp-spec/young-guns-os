import { useEffect, useRef, useState, type ReactNode } from 'react';

export type MoreMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
};

type MoreMenuProps = {
  label?: string;
  items: MoreMenuItem[];
};

export function MoreMenu({ label = 'More', items }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="ux-more-menu" ref={rootRef}>
      <button
        type="button"
        className="ux-more-menu__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        {label} ▾
      </button>
      {open ? (
        <div className="ux-more-menu__panel" role="menu">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="ux-more-menu__item"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type QuickActionsDropdownProps = MoreMenuProps & {
  actions?: ReactNode;
};

/** Simple mode shows primary actions; advanced actions live under More. */
export function QuickActionsDropdown({ actions, ...menuProps }: QuickActionsDropdownProps) {
  return (
    <div className="ux-quick-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      {actions}
      <MoreMenu {...menuProps} />
    </div>
  );
}
