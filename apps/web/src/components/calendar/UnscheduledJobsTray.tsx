import { useMemo, useState } from 'react';
import { Button } from '@titan/ui';
import type { JobSummary, ScheduledJobEvent } from '@titan/shared';

type TraySection = 'unassigned' | 'needsScheduling' | 'delayed' | 'conflicts';

type UnscheduledJobsTrayProps = {
  jobs: JobSummary[];
  events: ScheduledJobEvent[];
  canWrite: boolean;
  onDragStart: (job: JobSummary) => void;
  onJobClick: (job: JobSummary) => void;
};

export function UnscheduledJobsTray({
  jobs,
  events,
  canWrite,
  onDragStart,
  onJobClick,
}: UnscheduledJobsTrayProps) {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<TraySection>('needsScheduling');

  const sections = useMemo(() => {
    const now = Date.now();
    const unassigned = jobs.filter((job) => !job.assignedUserId && job.status !== 'cancelled');
    const needsScheduling = jobs.filter((job) => !job.scheduledAt && job.status !== 'cancelled');
    const delayed = jobs.filter((job) => {
      if (!job.scheduledAt || job.status === 'completed' || job.status === 'cancelled') return false;
      const endMs = job.scheduledEndAt
        ? new Date(job.scheduledEndAt).getTime()
        : new Date(job.scheduledAt).getTime() + 60 * 60_000;
      return endMs < now;
    });
    const conflictReview = events.filter((event) => event.displayStatus === 'Delayed');

    return {
      unassigned,
      needsScheduling,
      delayed,
      conflicts: conflictReview,
    };
  }, [jobs, events]);

  const totalCount =
    sections.unassigned.length +
    sections.needsScheduling.length +
    sections.delayed.length +
    sections.conflicts.length;

  if (totalCount === 0) return null;

  const sectionItems: Array<{ id: TraySection; label: string; count: number }> = [
    { id: 'unassigned', label: 'Unassigned', count: sections.unassigned.length },
    { id: 'needsScheduling', label: 'Needs Scheduling', count: sections.needsScheduling.length },
    { id: 'delayed', label: 'Delayed', count: sections.delayed.length },
    { id: 'conflicts', label: 'Conflict Review', count: sections.conflicts.length },
  ].filter((section) => section.count > 0) as Array<{
    id: TraySection;
    label: string;
    count: number;
  }>;

  const activeItems =
    activeSection === 'conflicts'
      ? sections.conflicts.map((event) => ({
          id: event.id,
          label: event.customerName,
          meta: `${event.jobType || 'Job'} · ${event.suburb || 'No suburb'}`,
          job: jobs.find((item) => item.id === event.id),
          event,
        }))
      : sections[activeSection].map((job) => ({
          id: job.id,
          label: job.customerName,
          meta: `${job.jobType || 'Job'} · ${job.title}`,
          job,
          event: null,
        }));

  return (
    <aside className={`cal-tray${open ? ' cal-tray--open' : ''}`}>
      <button
        type="button"
        className="cal-tray__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>Unscheduled &amp; review</span>
        <span className="cal-tray__badge">{totalCount}</span>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>

      {open ? (
        <div className="cal-tray__body">
          <div className="cal-tray__tabs">
            {sectionItems.map((section) => (
              <Button
                key={section.id}
                variant={activeSection === section.id ? 'secondary' : 'ghost'}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label} ({section.count})
              </Button>
            ))}
          </div>
          <ul className="cal-tray__list">
            {activeItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="cal-tray__item"
                  draggable={canWrite && Boolean(item.job)}
                  onDragStart={() => item.job && onDragStart(item.job)}
                  onClick={() => item.job && onJobClick(item.job)}
                >
                  <span className="cal-tray__item-title">{item.label}</span>
                  <span className="cal-tray__item-meta">{item.meta}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
