import type { JobAssignee } from '@titan/shared';
import { Input } from '@titan/ui';

export type CalendarFilterState = {
  technicianId?: string;
  status?: string;
  suburb?: string;
  priority?: string;
};

type CalendarFiltersProps = {
  assignees: JobAssignee[];
  filters: CalendarFilterState;
  onChange: (filters: CalendarFilterState) => void;
  showTechnicianFilter?: boolean;
};

const STATUS_OPTIONS = [
  '',
  'new',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
] as const;

const PRIORITY_OPTIONS = ['', 'low', 'normal', 'high', 'urgent'] as const;

export function CalendarFilters({
  assignees,
  filters,
  onChange,
  showTechnicianFilter = true,
}: CalendarFiltersProps) {
  return (
    <div className="cal-filters">
      {showTechnicianFilter ? (
        <label className="titan-input-group cal-filters__field">
          <span className="titan-input-label">Technician</span>
          <select
            className="titan-input"
            value={filters.technicianId ?? ''}
            onChange={(event) =>
              onChange({ ...filters, technicianId: event.target.value || undefined })
            }
          >
            <option value="">All technicians</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.firstName} {assignee.lastName}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="titan-input-group cal-filters__field">
        <span className="titan-input-label">Status</span>
        <select
          className="titan-input"
          value={filters.status ?? ''}
          onChange={(event) => onChange({ ...filters, status: event.target.value || undefined })}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status || 'all'} value={status}>
              {status ? status.replace('_', ' ') : 'All statuses'}
            </option>
          ))}
        </select>
      </label>

      <Input
        label="Suburb"
        value={filters.suburb ?? ''}
        onChange={(event) => onChange({ ...filters, suburb: event.target.value || undefined })}
        placeholder="Filter by suburb"
      />

      <label className="titan-input-group cal-filters__field">
        <span className="titan-input-label">Priority</span>
        <select
          className="titan-input"
          value={filters.priority ?? ''}
          onChange={(event) => onChange({ ...filters, priority: event.target.value || undefined })}
        >
          {PRIORITY_OPTIONS.map((priority) => (
            <option key={priority || 'all'} value={priority}>
              {priority || 'All priorities'}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
