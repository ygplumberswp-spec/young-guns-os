import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CalendarViewMode } from '@titan/shared';
import { readNavState, useTitanNavigationHistory, writeNavState } from '../../hooks/useTitanNavigationHistory';
import {
  calendarStateKey,
  defaultCalendarView,
  type CalendarPersistedState,
} from './calendar-utils';

function defaultState(pathname: string): CalendarPersistedState {
  return {
    view: defaultCalendarView(pathname),
    anchorDate: new Date().toISOString(),
  };
}

function readCalendarState(pathname: string): CalendarPersistedState {
  if (typeof window === 'undefined') return defaultState(pathname);
  try {
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

function writeCalendarState(pathname: string, state: CalendarPersistedState): void {
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

export function useCalendarState(pathname = '/scheduling') {
  const { saveListState } = useTitanNavigationHistory();
  const initial = useMemo(() => readCalendarState(pathname), [pathname]);
  const [view, setView] = useState<CalendarViewMode>(initial.view);
  const [anchorDate, setAnchorDate] = useState(() => new Date(initial.anchorDate));
  const [filters, setFilters] = useState(initial.filters ?? {});

  const persist = useCallback(
    (patch: Partial<CalendarPersistedState>) => {
      const next: CalendarPersistedState = {
        view: patch.view ?? view,
        anchorDate: patch.anchorDate ?? anchorDate.toISOString(),
        filters: patch.filters ?? filters,
      };
      writeCalendarState(pathname, next);
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
    [anchorDate, filters, pathname, saveListState, view],
  );

  useEffect(() => {
    persist({});
  }, [view, anchorDate, filters, persist]);

  return {
    view,
    setView: (next: CalendarViewMode) => setView(next),
    anchorDate,
    setAnchorDate: (next: Date) => setAnchorDate(next),
    filters,
    setFilters,
    persist,
  };
}
