import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { canAccessGlobalSearch } from '../../features/global-search/utils';
import { useAuth } from '../../lib/auth-context';
import { filterRecentItemsByRbac, readRecentItems } from '../../lib/recent-items';

type SearchCommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  /** When false, palette UI still opens but search actions are gated. */
  canAccessSearch?: boolean;
};

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function SearchCommandPalette({
  open,
  onClose,
  canAccessSearch = true,
}: SearchCommandPaletteProps) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [query, setQuery] = useState('');

  const recentItems = useMemo(() => {
    if (!user) return [];
    return filterRecentItemsByRbac(
      readRecentItems(user.companyId, user.id),
      user.permissions,
    ).slice(0, 6);
  }, [user]);

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const globalSearchHref = `/global-search${query ? `?q=${encodeURIComponent(query)}` : ''}`;

  return (
    <div
      className="ux-command-palette-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="ux-command-palette" role="dialog" aria-label="Search TITAN" aria-modal="true">
        <input
          className="ux-command-palette__input"
          type="search"
          placeholder="Search TITAN…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canAccessSearch) {
              event.preventDefault();
              onClose();
              navigate(globalSearchHref);
            }
          }}
        />
        <p className="ux-command-palette__hint">
          {canAccessSearch ? (
            <>
              Press Enter to open{' '}
              <Link href={globalSearchHref} onClick={onClose}>
                Global Search
              </Link>
              {query ? ` for “${query}”` : ''}. Cmd+K / Ctrl+K toggles this palette.
            </>
          ) : (
            'Global search requires search permissions. Cmd+K / Ctrl+K toggles this palette.'
          )}
        </p>
        {recentItems.length > 0 ? (
          <div className="ux-command-palette__recent">
            <p className="ux-command-palette__recent-title">Recently viewed</p>
            <ul className="ux-command-palette__recent-list">
              {recentItems.map((item) => (
                <li key={`${item.kind}-${item.id}`} className="ux-command-palette__recent-item">
                  <button
                    type="button"
                    className="ux-command-palette__recent-link"
                    onClick={() => {
                      onClose();
                      navigate(item.href);
                    }}
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function useSearchCommandPaletteShortcut(
  onOpen: () => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const isK = event.key.toLowerCase() === 'k';
      const withModifier = event.metaKey || event.ctrlKey;
      if (!withModifier || !isK) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      onOpen();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onOpen]);
}

/** Self-contained palette with auth + shortcut wiring (legacy mount sites). */
export function SearchCommandPaletteShell({ enabled = true }: { enabled?: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const canSearch = user ? canAccessGlobalSearch(user.permissions) : false;

  const openPalette = useCallback(() => {
    setOpen(true);
  }, []);

  useSearchCommandPaletteShortcut(openPalette, enabled && canSearch);

  return (
    <SearchCommandPalette
      open={open}
      onClose={() => setOpen(false)}
      canAccessSearch={canSearch}
    />
  );
}
