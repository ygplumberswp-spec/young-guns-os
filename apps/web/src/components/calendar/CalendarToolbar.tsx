import { useRef } from 'react';
import { Button } from '@titan/ui';
import type { CalendarViewMode } from '@titan/shared';
import { CompactFilterTabs } from '../ux';
import { addDays, addMonths, formatCalendarRange, startOfDay } from './calendar-utils';

type CalendarToolbarProps = {
  view: CalendarViewMode;
  anchorDate: Date;
  onViewChange: (view: CalendarViewMode) => void;
  onAnchorChange: (date: Date) => void;
};

const VIEW_OPTIONS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
] as const;

function toDateInputValue(date: Date): string {
  const local = startOfDay(date);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function CalendarToolbar({
  view,
  anchorDate,
  onViewChange,
  onAnchorChange,
}: CalendarToolbarProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);

  function navigate(delta: number) {
    if (view === 'day') onAnchorChange(addDays(anchorDate, delta));
    else if (view === 'week') onAnchorChange(addDays(anchorDate, delta * 7));
    else onAnchorChange(addMonths(anchorDate, delta));
  }

  function openDatePicker() {
    const input = dateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  }

  return (
    <div className="cal-toolbar">
      <div className="cal-toolbar__nav">
        <Button variant="ghost" onClick={() => navigate(-1)} aria-label="Previous">
          ←
        </Button>
        <Button variant="ghost" onClick={() => onAnchorChange(new Date())}>
          Today
        </Button>
        <Button variant="ghost" onClick={() => navigate(1)} aria-label="Next">
          →
        </Button>
      </div>

      <div className="cal-toolbar__range-wrap">
        <button
          type="button"
          className="cal-toolbar__range"
          onClick={openDatePicker}
          aria-label="Choose Date"
        >
          {formatCalendarRange(view, anchorDate)}
        </button>
        <input
          ref={dateInputRef}
          className="cal-toolbar__date-input"
          type="date"
          value={toDateInputValue(anchorDate)}
          onChange={(event) => {
            if (!event.target.value) return;
            const [year, month, day] = event.target.value.split('-').map(Number);
            onAnchorChange(new Date(year!, month! - 1, day, 12, 0, 0, 0));
          }}
        />
      </div>

      <CompactFilterTabs
        options={VIEW_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
        value={view}
        onChange={(value) => onViewChange(value as CalendarViewMode)}
        ariaLabel="Calendar view"
      />
    </div>
  );
}
