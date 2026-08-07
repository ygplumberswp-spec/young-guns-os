import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  buildFleetOverviewRow,
  buildVehicleCardDetailRows,
  buildVehicleCardModel,
  type VehicleCardModel,
} from '@titan/shared';
import {
  VehicleStatusDot,
  freshnessPillClass,
  type TrackedVehiclePosition,
} from './VehiclePositionAddress';

/**
 * The Owner's Fleet Overview row and expanded vehicle card.
 *
 * Both read from one shared model, so a vehicle cannot be "Moving" in the list and
 * "Parked" in the panel. Readable street and area is the primary location line on every
 * surface; the coordinates stay available behind a disclosure rather than leading.
 */

export function buildPositionCardModel(
  position: TrackedVehiclePosition,
  cartrackConnected: boolean,
  nowMs?: number,
): VehicleCardModel {
  return buildVehicleCardModel({
    licensePlate: position.licensePlate,
    vehicleName: position.vehicleName,
    externalVehicleId: position.externalVehicleId,
    latitude: position.latitude,
    longitude: position.longitude,
    recordedAt: position.recordedAt,
    cartrackConnected,
    address: position.address,
    telemetry: position.telemetry,
    assignedUserName: position.assignedUserName,
    assignedJob: position.assignedJob,
    nowMs,
  });
}

/** Coordinates behind a disclosure — present, but never the primary location line. */
function CoordinatesDisclosure({ coordinates }: { coordinates: string | null }) {
  const [open, setOpen] = useState(false);
  if (!coordinates) return null;

  return (
    <span className="fleet-card__coords">
      <button
        type="button"
        className="jobs-link fleet-card__coords-toggle"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Hide coordinates' : 'View coordinates'}
      </button>
      {open ? (
        <>
          {' '}
          <span className="page-muted fleet-card__coords-value">{coordinates}</span>
        </>
      ) : null}
    </span>
  );
}

/**
 * Compact Fleet Overview row:
 *
 *   🟢 CF77263
 *   Driver: Keanu Venter
 *   Status: Moving
 *   Speed: 67 km/h
 *   Location: R302, Durbanville
 *   Updated: 10:01
 */
export function FleetOverviewVehicleRow({
  model,
  selected = false,
  onSelect,
  actions,
}: {
  model: VehicleCardModel;
  selected?: boolean;
  onSelect?: () => void;
  actions?: ReactNode;
}) {
  const row = buildFleetOverviewRow(model);

  return (
    <li className={`fleet-overview-row ${selected ? 'fleet-overview-row--selected' : ''}`.trim()}>
      <div className="fleet-overview-row__head">
        <VehicleStatusDot tone={row.statusTone} statusLabel={model.statusLabel} />
        {onSelect ? (
          <button type="button" className="fleet-overview-row__plate" onClick={onSelect}>
            {row.plate}
          </button>
        ) : (
          <strong className="fleet-overview-row__plate">{row.plate}</strong>
        )}
        <span className={`status-pill ${freshnessPillClass(row.freshnessLabel)}`}>
          {row.freshnessLabel}
        </span>
      </div>

      <span className="fleet-overview-row__field">{row.driverLine}</span>
      <span className="fleet-overview-row__field">{row.statusLine}</span>
      {row.speedLine ? (
        <span className="fleet-overview-row__field">{row.speedLine}</span>
      ) : null}
      <span className="fleet-overview-row__field" title={row.locationNote ?? undefined}>
        {row.locationLine}
      </span>
      <span className="fleet-overview-row__field">{row.updatedLine}</span>

      {row.locationNote ? <span className="page-muted">{row.locationNote}</span> : null}
      <CoordinatesDisclosure coordinates={model.coordinates} />
      {actions ? <div className="fleet-overview-row__actions">{actions}</div> : null}
    </li>
  );
}

/**
 * Expanded vehicle card:
 *
 *   🟢 CF77263
 *   Moving
 *   R302, Durbanville, Western Cape
 *   Updated: 10:01 · Speed: 28 km/h · Road Speed: 60 km/h · Ignition: ON · Odometer: 129 343 km
 *   Driver: Keanu Venter
 *   Assigned Job: JOB-1042 · Geyser replacement
 *
 * Rows for values Cartrack did not supply are absent rather than blank.
 */
export function FleetVehicleDetailCard({
  model,
  onOpenJob,
  actions,
}: {
  model: VehicleCardModel;
  onOpenJob?: (jobId: string) => void;
  actions?: ReactNode;
}) {
  const detailRows = buildVehicleCardDetailRows(model);

  return (
    <div className="fleet-vehicle-card">
      <div className="fleet-vehicle-card__head">
        <VehicleStatusDot tone={model.statusTone} statusLabel={model.statusLabel} />
        <strong className="fleet-vehicle-card__plate">{model.plate}</strong>
        {model.secondaryName ? (
          <span className="page-muted"> · {model.secondaryName}</span>
        ) : null}
        <span className={`status-pill ${freshnessPillClass(model.freshnessLabel)}`}>
          {model.freshnessLabel}
        </span>
      </div>

      <p className="fleet-vehicle-card__status">{model.statusLabel}</p>

      <p className="fleet-vehicle-card__location">{model.location.line}</p>
      {model.locationArea ? (
        <p className="fleet-vehicle-card__location-area">{model.locationArea}</p>
      ) : null}
      {model.location.note ? <p className="page-muted">{model.location.note}</p> : null}

      {detailRows.length > 0 ? (
        <dl className="fleet-vehicle-card__telemetry">
          {detailRows.map((detail) => (
            <div key={detail.label} className="fleet-vehicle-card__telemetry-row">
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="fleet-vehicle-card__field">Driver: {model.driverLabel}</p>
      {model.driverSource === 'titan_assignment' ? (
        <p className="page-muted">
          From the TITAN vehicle assignment — Cartrack reported no driver tag for this trip.
        </p>
      ) : null}

      <p className="fleet-vehicle-card__field">
        Assigned Job:{' '}
        {model.assignedJob ? (
          onOpenJob ? (
            <button
              type="button"
              className="jobs-link"
              onClick={() => onOpenJob(model.assignedJob!.id)}
            >
              {model.assignedJob.reference}
            </button>
          ) : (
            model.assignedJob.reference
          )
        ) : (
          'None'
        )}
      </p>

      <p className="page-muted">
        {model.updatedAgoLabel} · {model.freshnessNote}
      </p>

      <CoordinatesDisclosure coordinates={model.coordinates} />
      {actions ? <div className="fleet-vehicle-card__actions">{actions}</div> : null}
    </div>
  );
}
