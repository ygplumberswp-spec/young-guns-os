import { useMemo, useState } from 'react';
import { Button, Input } from '@titan/ui';
import type { JobAssignee } from '@titan/shared';

export type CalendarFilterState = {
  technicianId?: string;
  team?: string;
  status?: string;
  suburb?: string;
  priority?: string;
  jobType?: string;
};

type CalendarFiltersProps = {
  assignees: JobAssignee[];
  filters: CalendarFilterState;
  jobTypes: string[];
  onChange: (filters: CalendarFilterState) => void;
  showTechnicianFilter?: boolean;
  /** When true, filters start collapsed behind a Filters button. */
  collapsible?: boolean;
  defaultExpanded?: boolean;
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
  jobTypes,
  onChange,
  showTechnicianFilter = true,
  collapsible = true,
  defaultExpanded = false,
}: CalendarFiltersProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const hasActiveFilters = Boolean(
    filters.technicianId ||
      filters.team ||
      filters.status ||
      filters.suburb ||
      filters.priority ||
      filters.jobType,
  );

  const activeCount = [
    filters.technicianId,
    filters.team,
    filters.status,
    filters.suburb,
    filters.priority,
    filters.jobType,
  ].filter(Boolean).length;

  const teams = useMemo(
    () => [...new Set(assignees.map((assignee) => assignee.roleName).filter(Boolean))].sort(),
    [assignees],
  );

  const showPanel = !collapsible || expanded;

  return (
    <div className={`cal-filters cal-filters--toolbar${collapsible ? ' cal-filters--collapsible' : ''}`}>
      {collapsible ? (
        <div className="cal-filters__toggle-row">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </Button>
          {hasActiveFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange({})}>
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}

      {showPanel ? (
        <div className="cal-filters__panel">
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

          {showTechnicianFilter && teams.length > 0 ? (
            <label className="titan-input-group cal-filters__field">
              <span className="titan-input-label">Team</span>
              <select
                className="titan-input"
                value={filters.team ?? ''}
                onChange={(event) => onChange({ ...filters, team: event.target.value || undefined })}
              >
                <option value="">All teams</option>
                {teams.map((team) => (
                  <option key={team} value={team}>
                    {team}
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

          <label className="titan-input-group cal-filters__field">
            <span className="titan-input-label">Job type</span>
            <select
              className="titan-input"
              value={filters.jobType ?? ''}
              onChange={(event) => onChange({ ...filters, jobType: event.target.value || undefined })}
            >
              <option value="">All types</option>
              {jobTypes.map((jobType) => (
                <option key={jobType} value={jobType}>
                  {jobType}
                </option>
              ))}
            </select>
          </label>

          <Input
            label="Suburb / zone"
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

          {!collapsible && hasActiveFilters ? (
            <div className="cal-filters__clear">
              <Button variant="ghost" onClick={() => onChange({})}>
                Clear filters
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function applyClientCalendarFilters<
  T extends { jobType?: string | null; assignedUserId?: string | null },
>(items: T[], filters: CalendarFilterState, assignees: JobAssignee[] = []): T[] {
  let result = items;

  if (filters.jobType) {
    result = result.filter((item) => item.jobType === filters.jobType);
  }

  if (filters.team) {
    const teamIds = new Set(
      assignees.filter((assignee) => assignee.roleName === filters.team).map((assignee) => assignee.id),
    );
    result = result.filter((item) => !item.assignedUserId || teamIds.has(item.assignedUserId));
  }

  return result;
}
