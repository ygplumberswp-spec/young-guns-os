import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { canAccessGlobalSearch } from '../../features/global-search/utils';
import { useAuth } from '../../lib/auth-context';

type SearchCommandPaletteProps = {
  /** When true, registers Cmd/Ctrl+K globally. */
  enabled?: boolean;
};

/**
 * Cmd+K shell — navigates to the existing global search route (no fake index).
 */
export function SearchCommandPalette({ enabled = true }: SearchCommandPaletteProps) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const canSearch = user ? canAccessGlobalSearch(user.permissions) : false;

  useEffect(() => {
    if (!enabled || !canSearch) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const isK = event.key.toLowerCase() === 'k';
      const withModifier = event.metaKey || event.ctrlKey;
      if (!withModifier || !isK) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      setOpen(true);
      navigate('/global-search');
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, canSearch, navigate]);

  if (!canSearch || !open) {
    return null;
  }

  return (
    <div className="ux-command-palette" role="dialog" aria-label="Search" aria-modal="true">
      <div className="ux-command-palette__backdrop" onClick={() => setOpen(false)} />
      <div className="ux-command-palette__shell">
        <p className="ux-command-palette__hint">Opening global search…</p>
      </div>
    </div>
  );
}
