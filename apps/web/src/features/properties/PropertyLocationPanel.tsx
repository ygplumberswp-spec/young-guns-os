type PropertyLocationPanelProps = {
  addressDisplay: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string | null;
  accessInstructions?: string | null;
  className?: string;
};

function buildGoogleMapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function buildGoogleMapsDirectionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

function buildStreetViewUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

/** Truthful property/job location panel — no fake imagery when Maps is not configured. */
export function PropertyLocationPanel({
  addressDisplay,
  latitude,
  longitude,
  googlePlaceId,
  accessInstructions,
  className = '',
}: PropertyLocationPanelProps) {
  const hasCoords =
    latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);
  const hasAddress = Boolean(addressDisplay?.trim());
  const mapsConfigured = Boolean(String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim());

  return (
    <section className={`property-location-panel ${className}`.trim()}>
      <h3 className="property-location-panel__title">Property Location</h3>
      <dl className="property-location-panel__list">
        <div>
          <dt>Address</dt>
          <dd>{hasAddress ? addressDisplay : '—'}</dd>
        </div>
        <div>
          <dt>Coordinates</dt>
          <dd>{hasCoords ? `${latitude!.toFixed(5)}, ${longitude!.toFixed(5)}` : '—'}</dd>
        </div>
        <div>
          <dt>Google Place ID</dt>
          <dd>{googlePlaceId?.trim() || '—'}</dd>
        </div>
        {accessInstructions ? (
          <div>
            <dt>Access Instructions</dt>
            <dd>{accessInstructions}</dd>
          </div>
        ) : null}
        <div>
          <dt>Map Preview</dt>
          <dd>
            {mapsConfigured && hasCoords ? (
              <span className="property-location-panel__status property-location-panel__status--ok">
                Configured — preview on demand
              </span>
            ) : (
              <span className="property-location-panel__status property-location-panel__status--hold">
                Not Configured
              </span>
            )}
          </dd>
        </div>
      </dl>
      {hasAddress ? (
        <div className="property-location-panel__actions">
          <a
            href={buildGoogleMapsSearchUrl(addressDisplay!)}
            className="property-location-panel__link"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Google Maps
          </a>
          <a
            href={buildGoogleMapsDirectionsUrl(addressDisplay!)}
            className="property-location-panel__link"
            target="_blank"
            rel="noopener noreferrer"
          >
            Directions
          </a>
          {hasCoords ? (
            <a
              href={buildStreetViewUrl(latitude!, longitude!)}
              className="property-location-panel__link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Street View
            </a>
          ) : null}
        </div>
      ) : (
        <p className="property-location-panel__empty">
          Add a verified address to enable directions and map links.
        </p>
      )}
    </section>
  );
}
