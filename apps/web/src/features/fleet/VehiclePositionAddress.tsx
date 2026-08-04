import { useState } from 'react';
import type { FleetTrackingContext } from '@titan/shared';
import {
  buildSmsShareUrl,
  buildVehicleCardModel,
  buildVehiclePositionNavigateUrl,
  buildVehiclePositionShareMessage,
  buildWhatsappShareUrl,
  deriveFleetPositionHealth,
  formatFleetPositionHealthLabel,
  formatVehicleIgnitionLabel,
  formatVehicleMotionLabel,
  formatVehiclePositionCoordinates,
  formatVehiclePositionFreshness,
  resolveVehicleNavigateWarning,
  resolveVehiclePositionAddressDisplay,
  type VehicleAddressDisplay,
  type VehicleStatusTone,
} from '@titan/shared';

export type TrackedVehiclePosition = FleetTrackingContext['latestPositions'][number];

/**
 * Everything a surface needs to describe where a vehicle is, honestly.
 * Derived in one place so a position can never read as precise on one screen and
 * approximate on another.
 */
export function describeVehiclePosition(
  position: TrackedVehiclePosition,
  cartrackConnected: boolean,
): {
  health: ReturnType<typeof deriveFleetPositionHealth>;
  healthLabel: string;
  display: VehicleAddressDisplay;
  navigateUrl: string | null;
  shareMessage: string | null;
  navigateWarning: string | null;
  coordinates: string | null;
  motionLabel: string;
  ignitionLabel: string;
  freshnessLabel: string;
} {
  const health = deriveFleetPositionHealth({
    cartrackConnected,
    recordedAt: position.recordedAt,
  });
  const display = resolveVehiclePositionAddressDisplay({
    result: position.address,
    latitude: position.latitude,
    longitude: position.longitude,
    recordedAt: position.recordedAt,
    cartrackConnected,
  });
  const navigateUrl = buildVehiclePositionNavigateUrl({
    latitude: position.latitude,
    longitude: position.longitude,
  });
  const shareMessage = buildVehiclePositionShareMessage({
    licensePlate: position.licensePlate,
    vehicleName: position.vehicleName,
    latitude: position.latitude,
    longitude: position.longitude,
    recordedAt: position.recordedAt,
    display,
  });

  return {
    health,
    healthLabel: formatFleetPositionHealthLabel(health),
    display,
    navigateUrl,
    shareMessage,
    navigateWarning: resolveVehicleNavigateWarning({
      display,
      speedKmh: position.speedKmh,
      recordedAt: position.recordedAt,
    }),
    coordinates: formatVehiclePositionCoordinates(position.latitude, position.longitude),
    motionLabel: formatVehicleMotionLabel(position.speedKmh),
    ignitionLabel: formatVehicleIgnitionLabel(position.ignitionOn),
    freshnessLabel: formatVehiclePositionFreshness(position.recordedAt),
  };
}

function statusToneClass(tone: VehicleStatusTone): string {
  switch (tone) {
    case 'active':
      return 'fleet-status-dot--active';
    case 'attention':
      return 'fleet-status-dot--attention';
    case 'neutral':
      return 'fleet-status-dot--neutral';
    case 'muted':
      return 'fleet-status-dot--muted';
  }
}

/**
 * Coloured indicator shown before the plate. The status is also given as text for
 * screen readers and for anyone who cannot rely on colour alone.
 */
export function VehicleStatusDot({
  tone,
  statusLabel,
}: {
  tone: VehicleStatusTone;
  statusLabel: string;
}) {
  return (
    <span
      className={`fleet-status-dot ${statusToneClass(tone)}`}
      role="img"
      aria-label={statusLabel}
      title={statusLabel}
    />
  );
}

export function freshnessPillClass(label: string): string {
  switch (label) {
    case 'LIVE':
    case 'FRESH':
      return 'status-pill--success';
    case 'DELAYED':
      return 'status-pill--warning';
    default:
      return 'status-pill--disabled';
  }
}

function addressToneClass(state: VehicleAddressDisplay['state']): string {
  switch (state) {
    case 'precise':
    case 'street_level':
      return 'status-pill--success';
    case 'approximate':
    case 'stale':
      return 'status-pill--warning';
    default:
      return 'status-pill--disabled';
  }
}

/** Single readable line — used in tables, map popovers and compact lists. */
export function VehicleAddressLine({
  position,
  cartrackConnected,
  showCoordinates = false,
}: {
  position: TrackedVehiclePosition;
  cartrackConnected: boolean;
  showCoordinates?: boolean;
}) {
  const { display, coordinates } = describeVehiclePosition(position, cartrackConnected);

  return (
    <span className="vehicle-address-line">
      <span title={display.note ?? undefined}>{display.line}</span>
      {showCoordinates && coordinates && display.state !== 'coordinates' ? (
        <>
          <br />
          <span className="page-muted">{coordinates}</span>
        </>
      ) : null}
    </span>
  );
}

/**
 * Full vehicle position block: plate, driver where authorised, readable address,
 * movement, ignition, freshness, and the Navigate / Share actions.
 */
export function VehiclePositionCard({
  position,
  cartrackConnected,
  showDriver = true,
  compact = false,
}: {
  position: TrackedVehiclePosition;
  cartrackConnected: boolean;
  /** Driver identity is only rendered where the surface is authorised to show it. */
  showDriver?: boolean;
  compact?: boolean;
}) {
  const { display, navigateUrl, navigateWarning, shareMessage, coordinates } =
    describeVehiclePosition(position, cartrackConnected);
  // Status, freshness and telemetry come from the shared card model so this card cannot
  // describe a vehicle differently from the Fleet Overview row or the follow panel.
  const model = buildVehicleCardModel({
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
  });
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [coordsOpen, setCoordsOpen] = useState(false);

  const identifier = position.licensePlate ?? position.externalVehicleId;
  const whatsappUrl = buildWhatsappShareUrl(shareMessage);
  const smsUrl = buildSmsShareUrl(shareMessage);

  async function copyShareMessage() {
    if (!shareMessage) return;
    try {
      await navigator.clipboard.writeText(shareMessage);
      setShareNote('Directions copied to the clipboard.');
    } catch {
      setShareNote('This browser blocked the clipboard — use WhatsApp or SMS below.');
    }
  }

  return (
    <div className="vehicle-position-card">
      <div className="vehicle-position-card__head">
        <VehicleStatusDot tone={model.statusTone} statusLabel={model.statusLabel} />
        <strong>{identifier}</strong>
        {model.secondaryName ? (
          <span className="page-muted"> · {model.secondaryName}</span>
        ) : null}
        <span className={`status-pill ${freshnessPillClass(model.freshnessLabel)}`}>
          {model.freshnessLabel}
        </span>
      </div>

      <p className="vehicle-position-card__status">{model.statusLabel}</p>

      <p className="vehicle-position-card__address">
        <span className={`status-pill ${addressToneClass(display.state)}`}>{display.line}</span>
      </p>
      {display.note ? <p className="page-muted">{display.note}</p> : null}

      <p className="page-muted">
        {model.updatedAgoLabel}
        {model.speedValue ? ` · ${model.speedValue}` : ''}
        {model.roadSpeedValue ? ` · limit ${model.roadSpeedValue}` : ''}
        {model.ignitionValue ? ` · ignition ${model.ignitionValue}` : ''}
        {showDriver && model.driverSource !== 'unassigned' ? ` · ${model.driverLabel}` : ''}
      </p>

      {coordinates ? (
        <p className="page-muted vehicle-position-card__coords">
          <button
            type="button"
            className="jobs-link"
            onClick={() => setCoordsOpen((open) => !open)}
          >
            {coordsOpen ? 'Hide coordinates' : 'View coordinates'}
          </button>
          {coordsOpen ? <span> {coordinates}</span> : null}
        </p>
      ) : null}

      {navigateWarning ? <p className="form-error">{navigateWarning}</p> : null}

      {navigateUrl ? (
        <p className="vehicle-position-card__actions">
          <a href={navigateUrl} target="_blank" rel="noreferrer">
            Navigate to {identifier}
          </a>
          {shareMessage ? (
            <>
              {' · '}
              <button
                type="button"
                className="jobs-link vehicle-position-card__share"
                onClick={() => setShareOpen((open) => !open)}
              >
                Share directions
              </button>
            </>
          ) : null}
        </p>
      ) : (
        <p className="page-muted">
          Navigation is unavailable — TITAN has no usable coordinate for this vehicle.
        </p>
      )}

      {shareOpen && shareMessage ? (
        <div className="vehicle-position-card__share-panel">
          {!compact ? (
            <pre className="vehicle-position-card__share-preview">{shareMessage}</pre>
          ) : null}
          <p>
            <button type="button" className="jobs-link" onClick={() => void copyShareMessage()}>
              Copy directions
            </button>
            {whatsappUrl ? (
              <>
                {' · '}
                <a href={whatsappUrl} target="_blank" rel="noreferrer">
                  Share on WhatsApp
                </a>
              </>
            ) : null}
            {smsUrl ? (
              <>
                {' · '}
                <a href={smsUrl}>Share by SMS</a>
              </>
            ) : null}
          </p>
          <p className="page-muted">
            The link carries the coordinate, the plate and the position time only. TITAN opens your
            messaging app — it does not send the message or confirm delivery.
          </p>
          {shareNote ? <p className="page-muted">{shareNote}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
