import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import type { CalendarViewMode } from '@titan/shared';
import { readNavState, useTitanNavigationHistory, writeNavState } from '../../hooks/useTitanNavigationHistory';
import { buildSearchString, readSearchParam } from '../../lib/url-nav-state';
import {
  calendarStateKey,
  defaultCalendarView,
  type CalendarPersistedState,
} from './calendar-utils';

const CALENDAR_VIEW_MODES = new Set<CalendarViewMode>(['day', 'week', 'month']);

function defaultState(pathname: string): CalendarPersistedState {
  return {
    view: defaultCalendarView(pathname),
    anchorDate: new Date().toISOString(),
  };
}

function readFiltersFromParams(): CalendarPersistedState['filters'] {
  return {
    technicianId: readSearchParam('technicianId') ?? undefined,
    team: readSearchParam('team') ?? undefined,
    status: readSearchParam('status') ?? undefined,
    suburb: readSearchParam('suburb') ?? undefined,
    priority: readSearchParam('priority') ?? undefined,
    jobType: readSearchParam('jobType') ?? undefined,
  };
}

function calendarSearchEntries(state: CalendarPersistedState, pathname: string) {
  return {
    view: state.view === defaultCalendarView(pathname) ? null : state.view,
    date: state.anchorDate.slice(0, 10),
    technicianId: state.filters?.technicianId ?? null,
    team: state.filters?.team ?? null,
    status: state.filters?.status ?? null,
    suburb: state.filters?.suburb ?? null,
    priority: state.filters?.priority ?? null,
    jobType: state.filters?.jobType ?? null,
  };
}

function readCalendarState(pathname: string): CalendarPersistedState {
  if (typeof window === 'undefined') return defaultState(pathname);
  try {
    const viewParam = readSearchParam('view');
    const dateParam = readSearchParam('date');
    const urlView =
      viewParam && CALENDAR_VIEW_MODES.has(viewParam as CalendarViewMode)
        ? (viewParam as CalendarViewMode)
        : null;
    const urlFilters = readFiltersFromParams();

    if (urlView || dateParam || Object.values(urlFilters ?? {}).some(Boolean)) {
      return {
        view: urlView ?? defaultCalendarView(pathname),
        anchorDate: dateParam ? new Date(dateParam).toISOString() : new Date().toISOString(),
        filters: urlFilters,
      };
    }

    const nav = readNavState(pathname);
    if (nav?.calendarDate) {
      return {
        view: (nav.filters?.view as CalendarViewMode) ?? defaultCalendarView(pathname),
        anchorDate: nav.calendarDate,
        filters: {
          technicianId: nav.filters?.technicianId,
          team: nav.filters?.team,
          status: nav.filters?.status,
          suburb: nav.filters?.suburb,
          priority: nav.filters?.priority,
          jobType: nav.filters?.jobType,
        },
      };
    }
    const raw = sessionStorage.getItem(calendarStateKey(pathname));
    if (!raw) return defaultState(pathname);
    return { ...defaultState(pathname), ...(JSON.parse(raw) as CalendarPersistedState) };
  } catch {
    return defaultState(pathname);
  }
}

function calendarUrl(pathname: string, state: CalendarPersistedState): string {
  return `${pathname}${buildSearchString(calendarSearchEntries(state, pathname))}`;
}

function writeCalendarPersistence(pathname: string, state: CalendarPersistedState): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(calendarStateKey(pathname), JSON.stringify(state));
    writeNavState(pathname, {
      calendarDate: state.anchorDate,
      filters: {
        view: state.view,
        technicianId: state.filters?.technicianId ?? '',
        team: state.filters?.team ?? '',
        status: state.filters?.status ?? '',
        suburb: state.filters?.suburb ?? '',
        priority: state.filters?.priority ?? '',
        jobType: state.filters?.jobType ?? '',
      },
    });
  } catch {
    // ignore quota errors
  }
}

export type CalendarStateController = ReturnType<typeof useCalendarState>;

export function useCalendarState(pathname = '/scheduling') {
  const search = useSearch();
  const [, navigate] = useLocation();
  const { saveListState } = useTitanNavigationHistory();
  const initial = useMemo(() => readCalendarState(pathname), [pathname]);
  const [view, setViewState] = useState<CalendarViewMode>(initial.view);
  const [anchorDate, setAnchorDateState] = useState(() => new Date(initial.anchorDate));
  const [filters, setFiltersState] = useState(initial.filters ?? {});

  const syncFromUrl = useCallback(() => {
    const next = readCalendarState(pathname);
    setViewState(next.view);
    setAnchorDateState(new Date(next.anchorDate));
    setFiltersState(next.filters ?? {});
  }, [pathname]);

  useEffect(() => {
    syncFromUrl();
  }, [search, syncFromUrl]);

  useEffect(() => {
    function onPopState() {
      syncFromUrl();
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [syncFromUrl]);

  const snapshot = useCallback(
    (patch: Partial<CalendarPersistedState> = {}): CalendarPersistedState => ({
      view: patch.view ?? view,
      anchorDate: patch.anchorDate ?? anchorDate.toISOString(),
      filters: patch.filters ?? filters,
    }),
    [anchorDate, filters, view],
  );

  const persistNavMeta = useCallback(
    (next: CalendarPersistedState) => {
      writeCalendarPersistence(pathname, next);
      saveListState({
        calendarDate: next.anchorDate,
        filters: {
          view: next.view,
          technicianId: next.filters?.technicianId ?? '',
          team: next.filters?.team ?? '',
          status: next.filters?.status ?? '',
          suburb: next.filters?.suburb ?? '',
          priority: next.filters?.priority ?? '',
          jobType: next.filters?.jobType ?? '',
        },
      });
    },
    [pathname, saveListState],
  );

  const syncUrl = useCallback(
    (next: CalendarPersistedState, mode: 'push' | 'replace') => {
      persistNavMeta(next);
      const url = calendarUrl(pathname, next);
      const current = `${window.location.pathname}${window.location.search}`;
      if (current === url) return;
      navigate(url, { replace: mode === 'replace' });
    },
    [navigate, pathname, persistNavMeta],
  );

  useEffect(() => {
    syncUrl(snapshot(), 'replace');
  }, [view, anchorDate, filters, snapshot, syncUrl]);

  const pushHistory = useCallback(
    (patch: Partial<CalendarPersistedState>) => {
      syncUrl(snapshot(patch), 'push');
    },
    [snapshot, syncUrl],
  );

  return {
    view,
    setView: (next: CalendarViewMode) => {
      pushHistory({ view: next });
      setViewState(next);
    },
    anchorDate,
    setAnchorDate: (next: Date) => {
      pushHistory({ anchorDate: next.toISOString() });
      setAnchorDateState(next);
    },
    filters,
    setFilters: (next: CalendarPersistedState['filters']) => {
      pushHistory({ filters: next ?? {} });
      setFiltersState(next ?? {});
    },
    persist: syncUrl,
  };
}
