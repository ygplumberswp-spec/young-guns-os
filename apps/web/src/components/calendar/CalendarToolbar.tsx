import { Button } from '@titan/ui';
import type { CalendarViewMode } from '@titan/shared';
import { CompactFilterTabs } from '../ux';
import { addDays, addMonths, formatCalendarRange } from './calendar-utils';

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

export function CalendarToolbar({
  view,
  anchorDate,
  onViewChange,
  onAnchorChange,
}: CalendarToolbarProps) {
  function navigate(delta: number) {
    if (view === 'day') onAnchorChange(addDays(anchorDate, delta));
    else if (view === 'week') onAnchorChange(addDays(anchorDate, delta * 7));
    else onAnchorChange(addMonths(anchorDate, delta));
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
      <p className="cal-toolbar__range">{formatCalendarRange(view, anchorDate)}</p>
      <CompactFilterTabs
        options={VIEW_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
        value={view}
        onChange={(value) => onViewChange(value as CalendarViewMode)}
        ariaLabel="Calendar view"
      />
    </div>
  );
}
