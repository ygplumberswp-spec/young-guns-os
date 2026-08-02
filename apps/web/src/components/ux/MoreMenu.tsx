import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

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
};

/** Advanced actions under a compact "More" menu — keyboard nav, viewport-aware positioning. */
export function MoreMenu({ label = 'More', items, trigger, align = 'end' }: MoreMenuProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const [flipUp, setFlipUp] = useState(false);

  const visibleItems = items.filter((item) => !item.hidden);
  const regularItems = visibleItems.filter((item) => !item.destructive);
  const destructiveItems = visibleItems.filter((item) => item.destructive);

  useLayoutEffect(() => {
    if (!open || !rootRef.current || !panelRef.current) return;
    const triggerRect = rootRef.current.getBoundingClientRect();
    const panelHeight = panelRef.current.offsetHeight;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    setFlipUp(spaceBelow < panelHeight + 12 && triggerRect.top > panelHeight + 12);
  }, [open, visibleItems.length]);

  useEffect(() => {
    if (!open) {
      setFocusIndex(0);
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

  useEffect(() => {
    if (!open) return;
    const itemButtons = panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    itemButtons?.[focusIndex]?.focus();
  }, [focusIndex, open]);

  function handleTriggerKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handlePanelKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusIndex((index) => Math.min(index + 1, visibleItems.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setFocusIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setFocusIndex(visibleItems.length - 1);
    }
  }

  if (visibleItems.length === 0) {
    return null;
  }

  function renderItem(item: MoreMenuItem, index: number) {
    const className = `ux-more-menu__item${item.destructive ? ' ux-more-menu__item--destructive' : ''}`;
    if (item.href) {
      return (
        <a
          className={className}
          role="menuitem"
          tabIndex={open && focusIndex === index ? 0 : -1}
          href={item.href}
          aria-disabled={item.disabled}
          onClick={() => setOpen(false)}
        >
          {item.label}
        </a>
      );
    }
    return (
      <button
        type="button"
        className={className}
        role="menuitem"
        tabIndex={open && focusIndex === index ? 0 : -1}
        disabled={item.disabled}
        onClick={() => {
          item.onSelect?.();
          setOpen(false);
        }}
      >
        {item.label}
      </button>
    );
  }

  return (
    <div className={`ux-more-menu ux-more-menu--${align}${flipUp ? ' ux-more-menu--flip-up' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="ux-more-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleTriggerKeyDown}
      >
        {trigger ?? label}
      </button>
      {open ? (
        <ul
          id={menuId}
          ref={panelRef}
          className="ux-more-menu__panel"
          role="menu"
          onKeyDown={handlePanelKeyDown}
        >
          {regularItems.map((item) => {
            const index = visibleItems.indexOf(item);
            return (
              <li key={item.id} role="none">
                {renderItem(item, index)}
              </li>
            );
          })}
          {destructiveItems.length > 0 ? (
            <li className="ux-more-menu__separator" role="separator" aria-hidden />
          ) : null}
          {destructiveItems.map((item) => {
            const index = visibleItems.indexOf(item);
            return (
              <li key={item.id} role="none">
                {renderItem(item, index)}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** Alias for spec naming. */
export const QuickActionsDropdown = MoreMenu;
