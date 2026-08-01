import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type MoreMenuItem = {
  id: string;
  label: string;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
  hidden?: boolean;
};

type MoreMenuProps = {
  label?: string;
  items: MoreMenuItem[];
  trigger?: ReactNode;
  align?: 'start' | 'end';
};

/** Advanced actions under a compact "More" menu — simple mode default elsewhere. */
export function MoreMenu({ label = 'More', items, trigger, align = 'end' }: MoreMenuProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const visibleItems = items.filter((item) => !item.hidden);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div className={`ux-more-menu ux-more-menu--${align}`} ref={rootRef}>
      <button
        type="button"
        className="ux-more-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger ?? label}
      </button>
      {open ? (
        <ul id={menuId} className="ux-more-menu__panel" role="menu">
          {visibleItems.map((item) => (
            <li key={item.id} role="none">
              {item.href ? (
                <a
                  className="ux-more-menu__item"
                  role="menuitem"
                  href={item.href}
                  aria-disabled={item.disabled}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
              ) : (
                <button
                  type="button"
                  className="ux-more-menu__item"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    item.onSelect?.();
                    setOpen(false);
                  }}
                >
                  {item.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Alias for spec naming. */
export const QuickActionsDropdown = MoreMenu;
