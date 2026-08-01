import { useEffect, useState } from 'react';
import { Link } from 'wouter';

type SearchCommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  canAccessSearch: boolean;
};

export function SearchCommandPalette({ open, onClose, canAccessSearch }: SearchCommandPaletteProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
      <div className="ux-command-palette" role="dialog" aria-label="Command palette">
        <input
          className="ux-command-palette__input"
          type="search"
          placeholder="Search TITAN… (full search coming in phase 2)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
        <p className="ux-command-palette__hint">
          {canAccessSearch ? (
            <>
              Press Enter to open{' '}
              <Link href={`/global-search${query ? `?q=${encodeURIComponent(query)}` : ''}`} onClick={onClose}>
                Global Search
              </Link>
              {query ? ` for “${query}”` : ''}. Cmd+K / Ctrl+K toggles this palette.
            </>
          ) : (
            'Global search requires search permissions. Cmd+K / Ctrl+K toggles this palette.'
          )}
        </p>
      </div>
    </div>
  );
}

export function useSearchCommandPaletteShortcut(onToggle: () => void): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onToggle();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggle]);
}
