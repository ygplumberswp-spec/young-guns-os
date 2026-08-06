import type { CalendarJobDisplayStatus, CalendarViewMode, SchedulingSettingsSummary } from '@titan/shared';

export const CALENDAR_STATE_KEY = 'titan:calendar-state:/scheduling';

export function calendarStateKey(pathname: string): string {
  return `titan:calendar-state:${pathname}`;
}
export const CAL_HOUR_HEIGHT_PX = 52;
export const CAL_SLOT_MINUTES = 15;

export type CalendarPersistedState = {
  view: CalendarViewMode;
  anchorDate: string;
  filters?: {
    technicianId?: string;
    status?: string;
    suburb?: string;
    priority?: string;
    jobType?: string;
    team?: string;
  };
};

export function defaultCalendarView(pathname: string): CalendarViewMode {
  return pathname.startsWith('/mobile/schedule') ? 'day' : 'week';
}

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
      return 'danger';
    case 'Cancelled':
      return 'neutral';
    case 'Travelling':
    case 'Dispatched':
      return 'info';
    case 'On site':
      return 'warning';
    case 'Scheduled':
      return 'info';
    default:
      return 'neutral';
  }
}

export function displayStatusClass(status: CalendarJobDisplayStatus): string {
  switch (status) {
    case 'Unassigned':
      return 'cal-job-card--unassigned';
    case 'Scheduled':
    case 'Dispatched':
      return 'cal-job-card--scheduled';
    case 'Travelling':
      return 'cal-job-card--travelling';
    case 'On site':
      return 'cal-job-card--on-site';
    case 'Completed':
      return 'cal-job-card--completed';
    case 'Delayed':
      return 'cal-job-card--delayed';
    case 'Cancelled':
      return 'cal-job-card--cancelled';
    default:
      return 'cal-job-card--scheduled';
  }
}

export function resolveWorkingHours(settings?: SchedulingSettingsSummary): {
  startHour: number;
  endHour: number;
} {
  return {
    startHour: settings?.workDayStartHour ?? 7,
    endHour: settings?.workDayEndHour ?? 18,
  };
}

export function buildHourLabels(startHour: number, endHour: number): number[] {
  const hours: number[] = [];
  for (let hour = startHour; hour <= endHour; hour += 1) {
    hours.push(hour);
  }
  return hours;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function snapMinutes(minutes: number): number {
  return Math.round(minutes / CAL_SLOT_MINUTES) * CAL_SLOT_MINUTES;
}

export function eventDurationMs(event: { scheduledAt: string; scheduledEndAt: string | null }): number {
  if (event.scheduledEndAt) {
    return Math.max(
      CAL_SLOT_MINUTES * 60_000,
      new Date(event.scheduledEndAt).getTime() - new Date(event.scheduledAt).getTime(),
    );
  }
  return 60 * 60_000;
}

export function eventBlockStyle(
  event: { scheduledAt: string; scheduledEndAt: string | null },
  day: Date,
  startHour: number,
  endHour: number,
): { top: string; height: string } | null {
  const eventStart = new Date(event.scheduledAt);
  if (!isSameDay(eventStart, day)) return null;

  const dayStart = startOfDay(day);
  dayStart.setHours(startHour, 0, 0, 0);
  const gridEnd = startOfDay(day);
  gridEnd.setHours(endHour, 0, 0, 0);

  const eventEnd = new Date(eventStart.getTime() + eventDurationMs(event));
  const visibleStart = Math.max(eventStart.getTime(), dayStart.getTime());
  const visibleEnd = Math.min(eventEnd.getTime(), gridEnd.getTime());
  if (visibleEnd <= visibleStart) return null;

  const totalMs = gridEnd.getTime() - dayStart.getTime();
  const top = ((visibleStart - dayStart.getTime()) / totalMs) * 100;
  const height = ((visibleEnd - visibleStart) / totalMs) * 100;
  return {
    top: `${top}%`,
    height: `${Math.max(height, (CAL_SLOT_MINUTES / ((endHour - startHour) * 60)) * 100)}%`,
  };
}

export function dropTimeFromOffset(
  offsetY: number,
  startHour: number,
  endHour: number,
): { hour: number; minute: number } {
  const gridHeight = (endHour - startHour) * CAL_HOUR_HEIGHT_PX;
  const ratio = Math.max(0, Math.min(1, offsetY / gridHeight));
  const totalMinutes = ratio * (endHour - startHour) * 60;
  const hour = startHour + Math.floor(totalMinutes / 60);
  const minute = snapMinutes(Math.floor(totalMinutes % 60));
  return { hour, minute: minute >= 60 ? 0 : minute };
}

export function composeSlotDate(day: Date, hour: number, minute: number): Date {
  const slot = startOfDay(day);
  slot.setHours(hour, minute, 0, 0);
  return slot;
}

export function formatHourLabel(hour: number): string {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric' });
}

export function currentTimeIndicatorTop(startHour: number, endHour: number): string | null {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = startHour * 60;
  const end = endHour * 60;
  if (minutes < start || minutes > end) return null;
  return `${((minutes - start) / (end - start)) * 100}%`;
}
