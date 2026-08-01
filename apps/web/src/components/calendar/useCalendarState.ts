import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CalendarViewMode } from '@titan/shared';
import { readNavState, useTitanNavigationHistory, writeNavState } from '../../hooks/useTitanNavigationHistory';
import {
  CALENDAR_STATE_KEY,
  type CalendarPersistedState,
} from './calendar-utils';

const DEFAULT_STATE: CalendarPersistedState = {
  view: 'week',
  anchorDate: new Date().toISOString(),
};

function readCalendarState(pathname: string): CalendarPersistedState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const nav = readNavState(pathname);
    if (nav?.calendarDate) {
      return {
        view: (nav.filters?.view as CalendarViewMode) ?? DEFAULT_STATE.view,
        anchorDate: nav.calendarDate,
        filters: {
          technicianId: nav.filters?.technicianId,
          status: nav.filters?.status,
          suburb: nav.filters?.suburb,
          priority: nav.filters?.priority,
        },
      };
    }
    const raw = sessionStorage.getItem(CALENDAR_STATE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...(JSON.parse(raw) as CalendarPersistedState) };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeCalendarState(pathname: string, state: CalendarPersistedState): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(CALENDAR_STATE_KEY, JSON.stringify(state));
    writeNavState(pathname, {
      calendarDate: state.anchorDate,
      filters: {
        view: state.view,
        technicianId: state.filters?.technicianId ?? '',
        status: state.filters?.status ?? '',
        suburb: state.filters?.suburb ?? '',
        priority: state.filters?.priority ?? '',
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
          status: next.filters?.status ?? '',
          suburb: next.filters?.suburb ?? '',
          priority: next.filters?.priority ?? '',
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
