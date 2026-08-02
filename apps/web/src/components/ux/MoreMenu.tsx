import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type MoreMenuItem = {
  id: string;
  label: string;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
  hidden?: boolean;
  destructive?: boolean;
};

type MoreMenuProps = {
  label?: string;
  items: MoreMenuItem[];
  trigger?: ReactNode;
  align?: 'start' | 'end';
  usePortal?: boolean;
};

/** Advanced actions under a compact "More" menu — simple mode default elsewhere. */
export function MoreMenu({
  label = 'More',
  items,
  trigger,
  align = 'end',
  usePortal = false,
}: MoreMenuProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number; minWidth: number } | null>(
    null,
  );

  const visibleItems = items.filter((item) => !item.hidden);

  useLayoutEffect(() => {
    if (!open || !usePortal || !triggerRef.current) {
      setPanelStyle(null);
      return;
    }

    function updatePosition() {
      const triggerEl = triggerRef.current;
      if (!triggerEl) return;
      const rect = triggerEl.getBoundingClientRect();
      const minWidth = Math.max(rect.width, 160);
      const left = align === 'end' ? rect.right - minWidth : rect.left;
      setPanelStyle({
        top: rect.bottom + 4,
        left: Math.max(8, left),
        minWidth,
      });
    }

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [align, open, usePortal]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) {
        return;
      }
      if (usePortal) {
        const portalPanel = document.getElementById(menuId);
        if (portalPanel?.contains(target)) {
          return;
        }
      }
      setOpen(false);
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
  }, [menuId, open, usePortal]);

  if (visibleItems.length === 0) {
    return null;
  }

  const panelClassName = usePortal
    ? 'ux-more-menu__panel ux-more-menu__panel--portal'
    : 'ux-more-menu__panel';

  const panel = open ? (
    <ul
      id={menuId}
      className={panelClassName}
      role="menu"
      style={
        usePortal && panelStyle
          ? {
              position: 'fixed',
              top: panelStyle.top,
              left: panelStyle.left,
              minWidth: panelStyle.minWidth,
              right: 'auto',
            }
          : undefined
      }
    >
      {visibleItems.map((item) => (
        <li key={item.id} role="none">
          {item.href ? (
            <a
              className={`ux-more-menu__item${item.destructive ? ' ux-more-menu__item--destructive' : ''}`}
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
              className={`ux-more-menu__item${item.destructive ? ' ux-more-menu__item--destructive' : ''}`}
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
  ) : null;

  return (
    <div className={`ux-more-menu ux-more-menu--${align}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="ux-more-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger ?? label}
      </button>
      {usePortal && panel ? createPortal(panel, document.body) : panel}
    </div>
  );
}

/** Alias for spec naming. */
export const QuickActionsDropdown = MoreMenu;
