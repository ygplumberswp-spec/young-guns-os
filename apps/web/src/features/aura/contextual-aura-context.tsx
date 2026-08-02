import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'wouter';
import { inferAuraModuleFromPath } from './aura-page-suggestions';

export type AuraPageContextModule =
  | 'dashboard'
  | 'leads'
  | 'crm'
  | 'jobs'
  | 'scheduling'
  | 'finance'
  | 'inventory'
  | 'procurement'
  | 'fleet'
  | 'communications'
  | 'documents'
  | 'analytics'
  | 'settings'
  | 'aura'
  | 'other';

export type AuraPageContext = {
  module: AuraPageContextModule;
  route: string;
  pageTitle?: string;
  recordId?: string;
  recordType?: string;
  customerId?: string;
  jobId?: string;
  vehicleId?: string;
  filters?: Record<string, string | boolean | number | null | undefined>;
};

type ContextualAuraContextValue = {
  isOpen: boolean;
  pageContext: AuraPageContext;
  draftPrompt: string;
  openDrawer: (prompt?: string) => void;
  closeDrawer: () => void;
  setDraftPrompt: (value: string) => void;
  setPageContext: (patch: Partial<AuraPageContext>) => void;
};

const ContextualAuraContext = createContext<ContextualAuraContextValue | null>(null);

export function ContextualAuraProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [pageOverrides, setPageOverrides] = useState<Partial<AuraPageContext>>({});

  const baseContext = useMemo<AuraPageContext>(
    () => ({
      module: inferAuraModuleFromPath(location),
      route: location,
      ...pageOverrides,
    }),
    [location, pageOverrides],
  );

  const openDrawer = useCallback((prompt?: string) => {
    if (prompt) setDraftPrompt(prompt);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
  }, []);

  const setPageContext = useCallback((patch: Partial<AuraPageContext>) => {
    setPageOverrides((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    setPageOverrides({});
  }, [location]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const withModifier = event.metaKey || event.ctrlKey;
      if (withModifier && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setIsOpen((open) => !open);
      }
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const value = useMemo(
    () => ({
      isOpen,
      pageContext: baseContext,
      draftPrompt,
      openDrawer,
      closeDrawer,
      setDraftPrompt,
      setPageContext,
    }),
    [baseContext, closeDrawer, draftPrompt, isOpen, openDrawer, setPageContext],
  );

  return <ContextualAuraContext.Provider value={value}>{children}</ContextualAuraContext.Provider>;
}

export function useContextualAura(): ContextualAuraContextValue {
  const ctx = useContext(ContextualAuraContext);
  if (!ctx) {
    throw new Error('useContextualAura must be used within ContextualAuraProvider');
  }
  return ctx;
}

export function useOptionalContextualAura(): ContextualAuraContextValue | null {
  return useContext(ContextualAuraContext);
}
