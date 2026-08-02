import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, LoadingState, Panel } from '@titan/ui';
import {
  buildGoogleMapsPlaceUrl,
  formatLatLngCoordinates,
  type CustomerPropertySummary,
  type GoogleGeocodedAddress,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { createCustomerProperty, fetchCustomerProperties } from '../../lib/crm-api';
import { canManageJobs } from '../jobs/JobList';
import { AddressAutocomplete } from '../maps/AddressAutocomplete';

type CustomerPropertiesPanelProps = {
  accessToken: string;
  customerId: string;
  canWrite: boolean;
  canCreateJob: boolean;
};

export function CustomerPropertiesPanel({
  accessToken,
  customerId,
  canWrite,
  canCreateJob,
}: CustomerPropertiesPanelProps) {
  const [properties, setProperties] = useState<CustomerPropertySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [propertyName, setPropertyName] = useState('');
  const [street, setStreet] = useState('');
  const [suburb, setSuburb] = useState('');
  const [city, setCity] = useState('Cape Town');
  const [province, setProvince] = useState('Western Cape');
  const [postalCode, setPostalCode] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [geo, setGeo] = useState<GoogleGeocodedAddress | null>(null);

  async function loadProperties() {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await fetchCustomerProperties(accessToken, customerId);
      setProperties(rows);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load properties');
      setProperties([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProperties();
  }, [accessToken, customerId]);

  function applyGeocoded(address: GoogleGeocodedAddress) {
    setGeo(address);
    if (address.street) setStreet(address.street);
    if (address.suburb) setSuburb(address.suburb);
    if (address.city) setCity(address.city);
    if (address.province) setProvince(address.province);
    if (address.postalCode) setPostalCode(address.postalCode);
  }

  async function handleCreateProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || !propertyName.trim()) return;

    setIsSaving(true);
    setError(null);
    try {
      await createCustomerProperty(accessToken, customerId, {
        propertyName: propertyName.trim(),
        street: street.trim() || null,
        suburb: suburb.trim() || null,
        city: city.trim() || null,
        province: province.trim() || null,
        postalCode: postalCode.trim() || null,
        isPrimary,
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
        placeId: geo?.placeId ?? null,
        formattedAddress: geo?.formattedAddress ?? null,
        geocodeStatus: geo ? 'verified' : null,
      });
      setPropertyName('');
      setStreet('');
      setSuburb('');
      setCity('Cape Town');
      setProvince('Western Cape');
      setPostalCode('');
      setIsPrimary(false);
      setGeo(null);
      setShowForm(false);
      await loadProperties();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create property');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Panel
      title="Properties"
      description="Sites of work linked to this customer — used for jobs, quotes, and portal handoff."
    >
      {error ? <p className="form-error">{error}</p> : null}

      {isLoading ? (
        <LoadingState label="Loading Properties…" />
      ) : properties.length === 0 ? (
        <EmptyState
          title="No Properties Yet"
          description="Add a property with a verified address before creating operational jobs at this customer."
          action={
            canWrite ? (
              <Button type="button" size="sm" onClick={() => setShowForm(true)}>
                Add property
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="crm-property-list">
          {properties.map((property) => (
            <li key={property.id} className="crm-property-item">
              <div className="crm-property-item__header">
                <strong>{property.propertyName}</strong>
                {property.isPrimary ? (
                  <span className="crm-property-item__badge">Primary</span>
                ) : null}
                {property.geocodeStatus === 'verified' ? (
                  <span className="crm-property-item__badge">Verified map</span>
                ) : null}
              </div>
              <p className="crm-property-item__address">
                {property.formattedAddress ?? property.addressDisplay ?? 'Address not complete'}
              </p>
              {property.latitude != null && property.longitude != null ? (
                <p className="page-muted">
                  {formatLatLngCoordinates(property.latitude, property.longitude, 5)}
                  {property.placeId ? ` · Place ID stored` : ''}
                </p>
              ) : (
                <p className="page-muted">Coordinates not verified</p>
              )}
              {(() => {
                const mapsUrl = buildGoogleMapsPlaceUrl({
                  latitude: property.latitude,
                  longitude: property.longitude,
                  placeId: property.placeId,
                  address: property.formattedAddress ?? property.addressDisplay,
                });
                return mapsUrl ? (
                  <a href={mapsUrl} target="_blank" rel="noreferrer" className="crm-link">
                    Open in Google Maps
                  </a>
                ) : null;
              })()}
              {canCreateJob ? (
                <Link
                  href={`/jobs/new?customerId=${encodeURIComponent(customerId)}&propertyId=${encodeURIComponent(property.id)}`}
                  className="crm-link"
                >
                  Create job at this property
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canWrite && properties.length > 0 && !showForm ? (
        <div className="crm-form__actions">
          <Button type="button" variant="secondary" onClick={() => setShowForm(true)}>
            Add property
          </Button>
        </div>
      ) : null}

      {canWrite && showForm ? (
        <form className="crm-form crm-form--nested" onSubmit={(event) => void handleCreateProperty(event)}>
          <Input
            label="Property Name"
            value={propertyName}
            onChange={(event) => setPropertyName(event.target.value)}
            placeholder="e.g. Main residence, Block A unit 4"
            required
          />
          <AddressAutocomplete
            label="Search Address (Google Places)"
            value={street}
            onChange={(value) => {
              setStreet(value);
              setGeo(null);
            }}
            onResolved={applyGeocoded}
          />
          <Input
            label="Street"
            value={street}
            onChange={(event) => {
              setStreet(event.target.value);
              setGeo(null);
            }}
          />
          <Input label="Suburb" value={suburb} onChange={(event) => setSuburb(event.target.value)} />
          <Input label="City" value={city} onChange={(event) => setCity(event.target.value)} />
          <Input
            label="Province"
            value={province}
            onChange={(event) => setProvince(event.target.value)}
          />
          <Input
            label="Postal Code"
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value)}
          />
          {geo ? (
            <p className="page-muted">
              Verified: {geo.latitude.toFixed(5)}, {geo.longitude.toFixed(5)}
              {geo.placeId ? ` · ${geo.placeId}` : ''}
            </p>
          ) : (
            <p className="page-muted">
              Verify with Google Maps to store latitude, longitude, and Place ID. TITAN will not invent
              coordinates.
            </p>
          )}
          <label className="titan-checkbox">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(event) => setIsPrimary(event.target.checked)}
            />
            Mark as primary property
          </label>
          <div className="crm-form__actions">
            <Button type="submit" disabled={isSaving || !propertyName.trim()}>
              {isSaving ? 'Saving…' : 'Save property'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </Panel>
  );
}

export function canCreateJobAtProperty(permissions: string[]): boolean {
  return canManageJobs(permissions);
}
