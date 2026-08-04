import { Link } from 'wouter';
import { Button, EmptyState, LoadingState, Panel } from '@titan/ui';
import {
  DISPATCHER_STATUS_FLOW,
  JOB_PRIORITY_OPTIONS,
  buildGoogleMapsNavigateUrl,
  compareJobsForDispatcherBoard,
  deriveFleetPositionHealth,
  dominantDispatcherStatus,
  deriveTechnicianAvailability,
  formatCustomerEtaReadinessLabel,
  formatDispatcherStatusLabel,
  formatFleetPositionHealthLabel,
  formatMapsEtaCapabilityLabel,
  formatTechnicianAvailabilityLabel,
  formatVehicleMotionLabel,
  formatVehiclePositionFreshness,
  isDispatcherEmergencyPriority,
  resolveVehiclePositionAddressDisplay,
  mapDispatcherStepToCommunicationHook,
  mapDualTrackToDispatcherStatus,
  resolveCustomerEtaReadiness,
  selectDispatcherEmergencyJobs,
  type DispatcherStatusStep,
  type JobAssignee,
  type JobSummary,
  type MapsEtaCapabilityState,
} from '@titan/shared';
import { fetchTodaysJobs } from '../../lib/jobs-api';
import { fetchVehicles } from '../../lib/fleet-api';
import { fetchGoogleMapsConnection } from '../../lib/google-maps-api';
import { fetchAssignees, updateJobSchedule } from '../../lib/scheduling-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { LiveDispatchPositionsPanel } from '../dispatch/LiveDispatchPositionsPanel';
import { DispatcherStatusFlow } from '../dispatch/DispatcherStatusFlow';
import { GoogleMapView } from '../maps/GoogleMapView';
import { useCartrackLivePositions } from '../dispatch/useCartrackLivePositions';
import {
  VehiclePositionCard,
  type TrackedVehiclePosition,
} from './VehiclePositionAddress';
import { useMemo, useState } from 'react';
import { ApiClientError } from '../../lib/api-client';

type TechnicianColumn = {
  userId: string | null;
  name: string;
  jobs: JobSummary[];
  dominantStep: DispatcherStatusStep | null;
  availabilityLabel: string;
  positionHealthLabel: string | null;
  emergencyCount?: number;
};

/**
 * UX-024 / M3 FLT-001 + Ops Slice 2 — dispatcher board from stored job/vehicle data,
 * Cartrack GPS when connected, Google Maps tiles/navigate when configured.
 * Dual-track status flow + honest ETA/comm readiness — never invents GPS, routes, or messages.
 */
export function FleetDispatchBoard() {
  const { accessToken, user } = useAuth();
  const canDispatchWrite = Boolean(
    user?.permissions.includes('dispatch:write') || user?.permissions.includes('*'),
  );
  const { tracking } = useCartrackLivePositions({
    accessToken,
    enabled: Boolean(accessToken),
  });

  const jobsQuery = useStaffCachedQuery({
    queryKey: 'fleet/dispatch-today-jobs',
    enabled: Boolean(accessToken),
    fetcher: async () => fetchTodaysJobs(accessToken!, { includeCompleted: true }),
  });
  const vehiclesQuery = useStaffCachedQuery({
    queryKey: 'fleet/dispatch-vehicles',
    enabled: Boolean(accessToken),
    fetcher: async () => fetchVehicles(accessToken!),
  });
  const mapsQuery = useStaffCachedQuery({
    queryKey: 'fleet/google-maps-connection',
    enabled: Boolean(accessToken),
    fetcher: async () => fetchGoogleMapsConnection(accessToken!),
  });
  const assigneesQuery = useStaffCachedQuery({
    queryKey: 'fleet/dispatch-assignees',
    enabled: Boolean(accessToken) && canDispatchWrite,
    fetcher: async () => fetchAssignees(accessToken!),
  });

  const [reassigningJobId, setReassigningJobId] = useState<string | null>(null);
  const [reassignError, setReassignError] = useState<string | null>(null);

  const jobs = jobsQuery.data ?? [];
  const vehicles = vehiclesQuery.data ?? [];
  const assignees = assigneesQuery.data ?? [];
  const mapsConnected = Boolean(mapsQuery.data?.connected);
  const mapsState: MapsEtaCapabilityState = mapsConnected
    ? 'connected'
    : mapsQuery.data
      ? 'not_configured'
      : 'not_configured';
  const mapsLabel = formatMapsEtaCapabilityLabel(mapsState);
  const loading =
    (jobsQuery.isLoading && !jobsQuery.data) || (vehiclesQuery.isLoading && !vehiclesQuery.data);

  const cartrackConnected = Boolean(tracking?.cartrackConnected);
  const positionsByVehicleId = useMemo(() => {
    const map = new Map<string, TrackedVehiclePosition>();
    for (const position of tracking?.latestPositions ?? []) {
      if (position.vehicleId) map.set(position.vehicleId, position);
    }
    return map;
  }, [tracking?.latestPositions]);
  const positionsByUserHint = useMemo(() => {
    const map = new Map<string, string>();
    for (const position of tracking?.latestPositions ?? []) {
      const health = deriveFleetPositionHealth({
        cartrackConnected,
        recordedAt: position.recordedAt,
      });
      const key = position.vehicleName ?? position.licensePlate ?? position.externalVehicleId;
      map.set(key, formatFleetPositionHealthLabel(health));
    }
    return map;
  }, [cartrackConnected, tracking?.latestPositions]);

  const technicianColumns = useMemo((): TechnicianColumn[] => {
    const byTech = new Map<string, TechnicianColumn>();

    for (const job of jobs) {
      const key = job.assignedUserId ?? '__unassigned__';
      const existing = byTech.get(key);
      if (existing) {
        existing.jobs.push(job);
      } else {
        byTech.set(key, {
          userId: job.assignedUserId,
          name: job.assignedUserName ?? 'Unassigned',
          jobs: [job],
          dominantStep: null,
          availabilityLabel: 'Scheduled',
          positionHealthLabel: null,
        });
      }
    }

    // Include assignees with no jobs today so availability is visible.
    for (const assignee of assignees) {
      if (!byTech.has(assignee.id)) {
        byTech.set(assignee.id, {
          userId: assignee.id,
          name: `${assignee.firstName} ${assignee.lastName}`.trim(),
          jobs: [],
          dominantStep: null,
          availabilityLabel: 'Available',
          positionHealthLabel: null,
        });
      }
    }

    const columns = [...byTech.values()].map((column) => {
      const sortedJobs = column.jobs.slice().sort(compareJobsForDispatcherBoard);
      const steps = sortedJobs.map((job) =>
        mapDualTrackToDispatcherStatus({
          status: job.status,
          executionPhase: job.executionPhase,
        }),
      );
      const dominantStep = dominantDispatcherStatus(steps);
      const availability = deriveTechnicianAvailability({
        hasAssignedJobsToday: sortedJobs.length > 0,
        dominantStep,
      });
      const vehicleForTech = vehicles.find((v) => v.assignedUserId === column.userId);
      const positionKey = vehicleForTech
        ? vehicleForTech.name || vehicleForTech.licensePlate
        : null;
      const emergencyCount = sortedJobs.filter((job) =>
        isDispatcherEmergencyPriority(job.priority),
      ).length;
      return {
        ...column,
        jobs: sortedJobs,
        dominantStep,
        availabilityLabel: formatTechnicianAvailabilityLabel(availability),
        positionHealthLabel: positionKey ? (positionsByUserHint.get(positionKey) ?? null) : null,
        emergencyCount,
      };
    });

    // Techs with emergency/high-priority open work float first; available techs next; unassigned last.
    columns.sort((a, b) => {
      if (a.userId == null && b.userId != null) return 1;
      if (a.userId != null && b.userId == null) return -1;
      const aEmerg = a.emergencyCount ?? 0;
      const bEmerg = b.emergencyCount ?? 0;
      if (aEmerg !== bEmerg) return bEmerg - aEmerg;
      const aAvail = a.availabilityLabel === 'Available' ? 0 : 1;
      const bAvail = b.availabilityLabel === 'Available' ? 0 : 1;
      if (aAvail !== bAvail) return aAvail - bAvail;
      return a.name.localeCompare(b.name);
    });
    return columns;
  }, [assignees, jobs, positionsByUserHint, vehicles]);

  const emergencyJobs = useMemo(() => selectDispatcherEmergencyJobs(jobs), [jobs]);

  const dailyWorkload = useMemo(() => {
    const open = jobs.filter((j) => j.status !== 'completed' && j.status !== 'cancelled');
    const availableTechs = technicianColumns.filter((c) => c.availabilityLabel === 'Available').length;
    return {
      totalToday: jobs.length,
      openCount: open.length,
      completedCount: jobs.filter((j) => j.status === 'completed').length,
      unassignedCount: open.filter((j) => !j.assignedUserId).length,
      emergencyCount: emergencyJobs.length,
      availableTechs,
      technicianCount: technicianColumns.filter((c) => c.userId != null).length,
    };
  }, [emergencyJobs.length, jobs, technicianColumns]);

  const statusCounts = useMemo(() => {
    const counts: Record<DispatcherStatusStep, number> = {
      scheduled: 0,
      en_route: 0,
      arrived: 0,
      in_progress: 0,
      completed: 0,
    };
    for (const job of jobs) {
      const step = mapDualTrackToDispatcherStatus({
        status: job.status,
        executionPhase: job.executionPhase,
      });
      counts[step] += 1;
    }
    return counts;
  }, [jobs]);

  const mapMarkers = useMemo(() => {
    const vehicleMarkers = (tracking?.latestPositions ?? [])
      .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
      .slice(0, 16)
      .map((position) => {
        const addressDisplay = resolveVehiclePositionAddressDisplay({
          result: position.address,
          latitude: position.latitude,
          longitude: position.longitude,
          recordedAt: position.recordedAt,
          cartrackConnected,
        });
        return {
          id: `vehicle-${position.externalVehicleId}`,
          latitude: position.latitude,
          longitude: position.longitude,
          label: [
            position.licensePlate ?? position.vehicleName ?? 'Vehicle',
            addressDisplay.line,
            formatVehicleMotionLabel(position.speedKmh),
            formatVehiclePositionFreshness(position.recordedAt),
          ].join(' · '),
          tone: 'vehicle' as const,
        };
      });

    const jobMarkers = jobs
      .filter(
        (job) =>
          job.latitude != null &&
          job.longitude != null &&
          Number.isFinite(job.latitude) &&
          Number.isFinite(job.longitude),
      )
      .slice(0, 24)
      .map((job) => ({
        id: `job-${job.id}`,
        latitude: job.latitude!,
        longitude: job.longitude!,
        label: [
          job.customerName,
          job.jobNumber ?? job.title,
          job.assignedUserName ? `Tech: ${job.assignedUserName}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        tone: 'customer' as const,
      }));

    return [...vehicleMarkers, ...jobMarkers];
  }, [cartrackConnected, jobs, tracking?.latestPositions]);

  async function handleReassign(job: JobSummary, assignedUserId: string) {
    if (!accessToken || !job.scheduledAt) return;
    setReassigningJobId(job.id);
    setReassignError(null);
    try {
      await updateJobSchedule(accessToken, job.id, {
        scheduledAt: job.scheduledAt,
        scheduledEndAt: job.scheduledEndAt,
        assignedUserId: assignedUserId || null,
      });
      await jobsQuery.refetch();
    } catch (err) {
      setReassignError(
        err instanceof ApiClientError ? err.message : 'Unable to reassign — check scheduling conflicts.',
      );
    } finally {
      setReassigningJobId(null);
    }
  }

  return (
    <div className="customer-360__stack">
      <LiveDispatchPositionsPanel accessToken={accessToken} />

      <Panel
        title="Dispatcher board"
        description="Daily operational view — technicians, assigned jobs, field status flow, Cartrack presence, and honest ETA/communication readiness."
      >
        <p className="status-pill status-pill--disabled" style={{ display: 'inline-block' }}>
          {mapsLabel}
        </p>
        <p className="page-muted" style={{ marginTop: '0.5rem' }}>
          Status uses dual-track office status + field phase (Scheduled → En route → Arrived → In
          progress → Completed). Live vehicle GPS uses Cartrack only when connected. Customer ETA is
          schedule-based until Maps can route from real coordinates — TITAN never invents GPS,
          routes, ETA, or messages.
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginTop: '0.75rem',
          }}
        >
          <span className="status-pill status-pill--pending">
            Today: {dailyWorkload.totalToday}
          </span>
          <span className="status-pill status-pill--connected">
            Open: {dailyWorkload.openCount}
          </span>
          <span className="status-pill status-pill--disabled">
            Completed: {dailyWorkload.completedCount}
          </span>
          <span className="status-pill status-pill--attention">
            Unassigned: {dailyWorkload.unassignedCount}
          </span>
          <span className="status-pill status-pill--warning">
            Emergency / high: {dailyWorkload.emergencyCount}
          </span>
          <span className="status-pill status-pill--connected">
            Available techs: {dailyWorkload.availableTechs}/{dailyWorkload.technicianCount}
          </span>
          {DISPATCHER_STATUS_FLOW.map((step) => (
            <span key={step} className="status-pill status-pill--pending">
              {formatDispatcherStatusLabel(step)}: {statusCounts[step]}
            </span>
          ))}
        </div>

        <p style={{ marginTop: '0.75rem' }}>
          <Link href="/scheduling">Open scheduling calendar</Link>
          {' · '}
          <Link href="/mobile-platform/dispatcher">Live Dispatch console</Link>
          {' · '}
          <Link href="/workforce/day-timeline">Day timeline</Link>
          {' · '}
          <Link href="/communications">Communications (approve/queue)</Link>
          {' · '}
          <Link href="/operations">Operations</Link>
        </p>

        {mapMarkers.length > 0 ? (
          <div style={{ marginTop: '0.75rem' }}>
            <GoogleMapView
              markers={mapMarkers}
              cameraContextKey="fleet-dispatch"
              height={260}
              emptyTitle="Live Map Unavailable"
              emptyDescription="Verified vehicle GPS or job coordinates exist, but Google Maps browser key is not configured."
            />
          </div>
        ) : (
          <p className="page-muted" style={{ marginTop: '0.75rem' }}>
            No verified technician GPS or customer job coordinates to plot yet. TITAN will not invent
            markers.
          </p>
        )}

        {loading ? <LoadingState label="Loading today's dispatch…" /> : null}

        {jobsQuery.error || vehiclesQuery.error ? (
          <EmptyState
            title="Unable To Load Dispatch Board"
            description={jobsQuery.error || vehiclesQuery.error || 'Retry to reload.'}
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void jobsQuery.refetch();
                  void vehiclesQuery.refetch();
                }}
              >
                Retry
              </Button>
            }
          />
        ) : null}

        {reassignError ? <p className="form-error">{reassignError}</p> : null}

        {!loading && !jobsQuery.error ? (
          <>
            <h3 className="page-section-title" style={{ marginTop: '1rem' }}>
              Emergency / high priority
            </h3>
            <p className="page-muted">
              From stored job priority (urgent/high), matching ops-intel emergency queue — not
              invented.
            </p>
            {emergencyJobs.length === 0 ? (
              <p className="page-muted">No urgent or high-priority open jobs today.</p>
            ) : (
              <ul className="portal-list" style={{ marginTop: '0.5rem' }}>
                {emergencyJobs.map((job) => (
                  <DispatchJobRow
                    key={`emergency-${job.id}`}
                    job={job}
                    mapsConnected={mapsConnected}
                    mapsState={mapsState}
                    cartrackConnected={cartrackConnected}
                    hasLiveTechGps={Boolean(
                      technicianColumns.find((c) => c.userId === job.assignedUserId)
                        ?.positionHealthLabel,
                    )}
                    canDispatchWrite={canDispatchWrite}
                    assignees={assignees}
                    reassigning={reassigningJobId === job.id}
                    onReassign={(userId) => void handleReassign(job, userId)}
                    emphasizePriority
                  />
                ))}
              </ul>
            )}

            <h3 className="page-section-title" style={{ marginTop: '1rem' }}>
              Technicians today
            </h3>
            {technicianColumns.length === 0 ? (
              <EmptyState
                title="No Technicians Or Jobs Today"
                description="When jobs are scheduled for today, technicians and assignments appear here."
                action={
                  <Link href="/scheduling">
                    <Button size="sm" variant="secondary">
                      Open scheduling
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div
                style={{
                  display: 'grid',
                  gap: '0.75rem',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  marginTop: '0.5rem',
                }}
              >
                {technicianColumns.map((column) => (
                  <section
                    key={column.userId ?? 'unassigned'}
                    style={{
                      border: '1px solid var(--border-color, #d8dde6)',
                      borderRadius: '0.5rem',
                      padding: '0.75rem',
                    }}
                  >
                    <header>
                      <strong>{column.name}</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
                        <span className="status-pill status-pill--connected">
                          {column.availabilityLabel}
                        </span>
                        <span className="status-pill status-pill--pending">
                          {column.jobs.length} job(s)
                        </span>
                        {(column.emergencyCount ?? 0) > 0 ? (
                          <span className="status-pill status-pill--warning">
                            {column.emergencyCount} emergency/high
                          </span>
                        ) : null}
                        {column.positionHealthLabel ? (
                          <span className="status-pill status-pill--attention">
                            GPS {column.positionHealthLabel}
                          </span>
                        ) : (
                          <span className="status-pill status-pill--disabled">No linked GPS</span>
                        )}
                      </div>
                      {column.dominantStep ? (
                        <div style={{ marginTop: '0.5rem' }}>
                          <DispatcherStatusFlow current={column.dominantStep} compact />
                        </div>
                      ) : null}
                    </header>

                    {column.jobs.length === 0 ? (
                      <p className="page-muted" style={{ marginTop: '0.5rem' }}>
                        No jobs assigned today — available for dispatch.
                      </p>
                    ) : (
                      <ul className="portal-list" style={{ marginTop: '0.5rem' }}>
                        {column.jobs.map((job) => (
                          <DispatchJobRow
                            key={job.id}
                            job={job}
                            mapsConnected={mapsConnected}
                            mapsState={mapsState}
                            cartrackConnected={cartrackConnected}
                            hasLiveTechGps={Boolean(column.positionHealthLabel)}
                            canDispatchWrite={canDispatchWrite}
                            assignees={assignees}
                            reassigning={reassigningJobId === job.id}
                            onReassign={(userId) => void handleReassign(job, userId)}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>
            )}

            <h3 className="page-section-title" style={{ marginTop: '1.25rem' }}>
              Vehicles & drivers
            </h3>
            {vehicles.length === 0 ? (
              <p className="page-muted">No vehicles on file.</p>
            ) : (
              <ul className="portal-list">
                {vehicles.slice(0, 12).map((vehicle) => {
                  const position = positionsByVehicleId.get(vehicle.id) ?? null;
                  return (
                    <li key={vehicle.id}>
                      <strong>
                        {vehicle.name} · {vehicle.licensePlate}
                      </strong>
                      <span>
                        {[vehicle.make, vehicle.model].filter(Boolean).join(' ') ||
                          'Make/model unset'}
                        {' · '}
                        {vehicle.status.replace(/_/g, ' ')}
                        {vehicle.assignedUserName
                          ? ` · driver/tech ${vehicle.assignedUserName}`
                          : ' · unassigned'}
                      </span>
                      {position ? (
                        <VehiclePositionCard
                          position={position}
                          cartrackConnected={cartrackConnected}
                          compact
                        />
                      ) : (
                        <span className="page-muted">
                          No Cartrack position stored for this vehicle — TITAN shows no address.
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : null}
      </Panel>
    </div>
  );
}

function DispatchJobRow({
  job,
  mapsConnected,
  mapsState,
  cartrackConnected,
  hasLiveTechGps,
  canDispatchWrite,
  assignees,
  reassigning,
  onReassign,
  emphasizePriority = false,
}: {
  job: JobSummary;
  mapsConnected: boolean;
  mapsState: MapsEtaCapabilityState;
  cartrackConnected: boolean;
  hasLiveTechGps: boolean;
  canDispatchWrite: boolean;
  assignees: JobAssignee[];
  reassigning: boolean;
  onReassign: (userId: string) => void;
  emphasizePriority?: boolean;
}) {
  const step = mapDualTrackToDispatcherStatus({
    status: job.status,
    executionPhase: job.executionPhase,
  });
  const hasVerifiedCoords =
    job.latitude != null &&
    job.longitude != null &&
    Number.isFinite(job.latitude) &&
    Number.isFinite(job.longitude);

  const eta = resolveCustomerEtaReadiness({
    status: job.status,
    assignedUserId: job.assignedUserId,
    scheduledAt: job.scheduledAt,
    scheduledEndAt: job.scheduledEndAt,
    jobHasVerifiedCoordinates: hasVerifiedCoords,
    mapsCapability: mapsState,
    cartrackPositionAvailable: cartrackConnected && hasLiveTechGps,
  });

  const commHook = mapDispatcherStepToCommunicationHook(step);
  const navigateUrl = buildGoogleMapsNavigateUrl({
    latitude: job.latitude,
    longitude: job.longitude,
    placeId: job.placeId,
    address: job.addressDisplay,
  });
  const priorityLabel =
    JOB_PRIORITY_OPTIONS.find((option) => option.value === job.priority)?.label ?? job.priority;
  const isEmergency = isDispatcherEmergencyPriority(job.priority);

  return (
    <li>
      <Link href={`/jobs/${job.id}`}>
        <strong>
          {job.jobNumber ? `${job.jobNumber} · ` : ''}
          {job.title}
        </strong>
      </Link>
      <span>
        {job.customerName}
        {job.assignedUserName ? ` · tech ${job.assignedUserName}` : ' · unassigned'}
        {job.scheduledAt
          ? ` · planned ${new Date(job.scheduledAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}`
          : ''}
      </span>
      <span>
        <span
          className={`status-pill ${
            isEmergency || emphasizePriority ? 'status-pill--warning' : 'status-pill--pending'
          }`}
        >
          Priority: {priorityLabel}
        </span>
      </span>
      <div style={{ marginTop: '0.35rem' }}>
        <DispatcherStatusFlow current={step} compact />
      </div>
      <span>
        Office: {job.status.replace(/_/g, ' ')}
        {job.executionPhase ? ` · Field: ${job.executionPhase.replace(/_/g, ' ')}` : ''}
      </span>
      <span>
        ETA: {formatCustomerEtaReadinessLabel(eta.state)}
        {eta.etaAt
          ? ` · ${new Date(eta.etaAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}`
          : ''}
      </span>
      {eta.warning ? <span className="page-muted">{eta.warning}</span> : null}
      <span>
        CX comm:{' '}
        {commHook
          ? `${commHook.replace(/_/g, ' ')} — draft→approve→queue (not auto-sent)`
          : 'No outbound hook for this phase'}
        {' · '}
        <Link href="/communications">Open communications</Link>
      </span>
      <span>
        {job.addressDisplay
          ? `Site: ${job.addressDisplay}`
          : 'Site address missing on job snapshot'}
        {hasVerifiedCoords ? ' · verified coordinates' : ' · coordinates not verified'}
      </span>
      {navigateUrl ? (
        <a href={navigateUrl} target="_blank" rel="noreferrer">
          {mapsConnected
            ? 'Suggested route in Google Maps'
            : 'Open address in Maps (deep-link)'}
        </a>
      ) : null}
      <Link href={`/jobs/${job.id}#property-map`}>Property map & ETA</Link>
      {canDispatchWrite && job.scheduledAt ? (
        <label style={{ display: 'block', marginTop: '0.35rem' }}>
          <span className="page-muted">Reassign via scheduling API</span>
          <select
            disabled={reassigning}
            defaultValue={job.assignedUserId ?? ''}
            onChange={(event) => onReassign(event.target.value)}
            style={{ display: 'block', marginTop: '0.2rem', maxWidth: '100%' }}
          >
            <option value="">Unassigned</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.firstName} {assignee.lastName}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </li>
  );
}
