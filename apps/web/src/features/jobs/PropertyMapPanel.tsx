import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import { buildGoogleMapsNavigateUrl, isValidLatLng, type GoogleRouteEstimate } from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import { estimateGoogleRoute } from '../../lib/google-maps-api';
import { useCartrackLivePositions } from '../dispatch/useCartrackLivePositions';
import { GoogleMapView } from '../maps/GoogleMapView';
import { ApiClientError } from '../../lib/api-client';

export type PropertyMapPanelProps = {
  streetAddress: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  formattedAddress?: string | null;
  assignedUserName?: string | null;
};

/**
 * Job 360 — Property Map.
 * Extension point for future Property Intelligence (site history, access notes overlays, etc.).
 */
export function PropertyMapPanel({
  streetAddress,
  latitude = null,
  longitude = null,
  placeId = null,
  formattedAddress = null,
  assignedUserName = null,
}: PropertyMapPanelProps) {
  const { accessToken } = useAuth();
  const hasCoords = isValidLatLng(latitude, longitude);
  const displayAddress = formattedAddress || streetAddress;
  const navigateUrl = buildGoogleMapsNavigateUrl({
    latitude,
    longitude,
    placeId,
    address: displayAddress,
  });

  const { tracking } = useCartrackLivePositions({
    accessToken,
    enabled: Boolean(accessToken && hasCoords),
  });

  const [route, setRoute] = useState<GoogleRouteEstimate | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  useEffect(() => {
    if (!accessToken || !hasCoords || latitude == null || longitude == null) {
      setRoute(null);
      setRouteError(null);
      return;
    }

    const positions = tracking?.latestPositions ?? [];
    const normalizedAssignee = assignedUserName?.trim().toLowerCase() ?? '';
    const techPosition =
      (normalizedAssignee
        ? positions.find(
            (p) => p.assignedUserName?.trim().toLowerCase() === normalizedAssignee,
          )
        : null) ?? positions[0];

    if (
      !techPosition ||
      !isValidLatLng(techPosition.latitude, techPosition.longitude)
    ) {
      setRoute(null);
      setRouteError(
        tracking?.cartrackConnected
          ? 'Cartrack connected, but no live vehicle position for ETA yet.'
          : 'ETA needs a live Cartrack vehicle position plus verified job coordinates.',
      );
      return;
    }

    let cancelled = false;
    setRouteLoading(true);
    setRouteError(null);
    void estimateGoogleRoute(
      accessToken,
      { latitude: techPosition.latitude, longitude: techPosition.longitude },
      { latitude, longitude },
    )
      .then((result) => {
        if (cancelled) return;
        setRoute(result);
        if (!result) {
          setRouteError('Route estimate unavailable. TITAN will not invent ETA or distance.');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setRoute(null);
        if (err instanceof ApiClientError && err.code === 'NOT_CONNECTED') {
          setRouteError('Google Maps is not connected — ETA/distance unavailable.');
          return;
        }
        setRouteError(err instanceof ApiClientError ? err.message : 'Unable to estimate route');
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    assignedUserName,
    hasCoords,
    latitude,
    longitude,
    tracking?.cartrackConnected,
    tracking?.latestPositions,
  ]);

  const mapMarkers = [
    ...(hasCoords
      ? [
          {
            id: 'property',
            latitude: latitude!,
            longitude: longitude!,
            label: displayAddress ?? 'Job location',
            tone: 'customer' as const,
          },
        ]
      : []),
    ...((tracking?.latestPositions ?? [])
      .filter((p) => isValidLatLng(p.latitude, p.longitude))
      .slice(0, 4)
      .map((p) => ({
        id: `vehicle-${p.externalVehicleId}-${p.recordedAt}`,
        latitude: p.latitude,
        longitude: p.longitude,
        label: p.vehicleName ?? p.licensePlate ?? 'Vehicle',
        tone: 'vehicle' as const,
      })) ?? []),
  ];

  return (
    <Panel
      title="Property map"
      description="Verified job location — extension point for future Property Intelligence"
    >
      {!displayAddress && !hasCoords ? (
        <EmptyState
          title="No property address"
          description="Add a verified job address to show this map. TITAN will not invent a location."
        />
      ) : (
        <>
          <p className="exec-outstanding__count" style={{ marginBottom: '0.75rem' }}>
            {displayAddress ?? 'Coordinates on file'}
            {hasCoords ? ' · Verified coordinates' : ' · Coordinates not verified'}
          </p>
          {hasCoords ? (
            <GoogleMapView
              markers={mapMarkers}
              height={320}
            />
          ) : (
            <EmptyState
              title="Map pin unavailable"
              description="Address text is present, but latitude/longitude are not verified. Use Google Maps address verification on the customer property."
              action={
                <Link href="/integrations/google-maps">
                  <Button size="sm" variant="secondary">
                    Google Maps settings
                  </Button>
                </Link>
              }
            />
          )}

          <dl className="jobs-detail-list" style={{ marginTop: '0.75rem' }}>
            <div>
              <dt>Distance</dt>
              <dd>
                {routeLoading
                  ? 'Estimating…'
                  : route?.distanceText ?? (routeError ? '—' : '—')}
              </dd>
            </div>
            <div>
              <dt>ETA</dt>
              <dd>
                {routeLoading
                  ? 'Estimating…'
                  : route
                    ? `${Math.max(1, Math.round((route.durationInTrafficSeconds ?? route.durationSeconds) / 60))} min (Google Maps)`
                    : '—'}
              </dd>
            </div>
          </dl>
          {routeError ? <p className="page-muted">{routeError}</p> : null}

          {navigateUrl ? (
            <a
              href={navigateUrl}
              target="_blank"
              rel="noreferrer"
              className="titan-btn titan-btn--secondary titan-btn--sm"
              style={{ marginTop: '0.75rem', display: 'inline-flex' }}
            >
              Navigate
            </a>
          ) : null}
          {/* Property Intelligence extension slot — do not remove */}
          <div data-titan-extension="property-intelligence" hidden aria-hidden="true" />
        </>
      )}
    </Panel>
  );
}
