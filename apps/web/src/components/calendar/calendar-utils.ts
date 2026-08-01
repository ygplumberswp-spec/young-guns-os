import type { CalendarViewMode } from '@titan/shared';

export const CALENDAR_STATE_KEY = 'titan:calendar-state:/scheduling';

export type CalendarPersistedState = {
  view: CalendarViewMode;
  anchorDate: string;
  filters?: {
    technicianId?: string;
    status?: string;
    suburb?: string;
    priority?: string;
  };
};

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfWeek(date: Date): Date {
  const result = startOfDay(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  return result;
}

export function endOfWeek(start: Date): Date {
  const result = new Date(start);
  result.setDate(result.getDate() + 7);
  return result;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function formatCalendarRange(view: CalendarViewMode, anchor: Date): string {
  if (view === 'day') {
    return anchor.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  if (view === 'week') {
    const start = startOfWeek(anchor);
    const end = addDays(start, 6);
    const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
    return `${fmt.format(start)} – ${fmt.format(end)}`;
  }

  return anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function resolveRange(view: CalendarViewMode, anchor: Date): { from: Date; to: Date } {
  if (view === 'day') {
    const from = startOfDay(anchor);
    const to = addDays(from, 1);
    return { from, to };
  }

  if (view === 'week') {
    const from = startOfWeek(anchor);
    return { from, to: endOfWeek(from) };
  }

  const from = startOfMonth(anchor);
  return { from, to: endOfMonth(anchor) };
}

export function formatTimeRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  if (!end) return timeFmt.format(start);
  return `${timeFmt.format(start)}–${timeFmt.format(end)}`;
}

export function displayStatusTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'Completed':
      return 'success';
    case 'Delayed':
    case 'Cancelled':
      return 'danger';
    case 'Travelling':
    case 'Dispatched':
      return 'info';
    case 'On site':
      return 'warning';
    default:
      return 'neutral';
  }
}
