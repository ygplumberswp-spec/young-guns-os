import { useState } from 'react';
import type { FleetTrackingContext } from '@titan/shared';
import {
  buildSmsShareUrl,
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

function addressToneClass(state: VehicleAddressDisplay['state']): string {
  switch (state) {
    case 'precise':
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
  const {
    display,
    healthLabel,
    health,
    navigateUrl,
    navigateWarning,
    shareMessage,
    coordinates,
    motionLabel,
    ignitionLabel,
    freshnessLabel,
  } = describeVehiclePosition(position, cartrackConnected);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const driverName = position.driverName || position.assignedUserName || null;
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
        <strong>{identifier}</strong>
        {position.vehicleName && position.vehicleName !== identifier ? (
          <span className="page-muted"> · {position.vehicleName}</span>
        ) : null}
        <span
          className={`status-pill ${health === 'live' ? 'status-pill--success' : 'status-pill--warning'}`}
        >
          {healthLabel}
        </span>
      </div>

      <p className="vehicle-position-card__address">
        <span className={`status-pill ${addressToneClass(display.state)}`}>{display.line}</span>
      </p>
      {display.note ? <p className="page-muted">{display.note}</p> : null}

      <p className="page-muted">
        {motionLabel} · {ignitionLabel}
        {showDriver && driverName ? ` · ${driverName}` : ''}
      </p>
      <p className="page-muted">
        {freshnessLabel}
        {coordinates ? ` · ${coordinates}` : ''}
      </p>

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
