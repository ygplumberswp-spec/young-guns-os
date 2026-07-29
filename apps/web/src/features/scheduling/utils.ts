import { hasAnyPermission } from '@titan/auth/browser';

export function canAccessScheduling(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['dispatch:read', 'dispatch:write']);
}

export function canManageScheduling(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['dispatch:write']);
}

export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() + diff);
  return result;
}

export function endOfWeek(start: Date): Date {
  const result = new Date(start);
  result.setDate(result.getDate() + 7);
  return result;
}

export function formatWeekLabel(start: Date, end: Date): string {
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const endLabel = new Date(end);
  endLabel.setDate(endLabel.getDate() - 1);
  return `${formatter.format(start)} – ${formatter.format(endLabel)}`;
}

export function groupEventsByDay<T extends { scheduledAt: string }>(
  events: T[],
  weekStart: Date,
): Array<{ date: Date; label: string; events: T[] }> {
  const days: Array<{ date: Date; label: string; events: T[] }> = [];

  for (let index = 0; index < 7; index += 1) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);

    const dayKey = date.toDateString();
    const dayEvents = events.filter((event) => new Date(event.scheduledAt).toDateString() === dayKey);

    days.push({
      date,
      label: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      events: dayEvents.sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      ),
    });
  }

  return days;
}

export function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}
