import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useState } from 'react';
import { Button, EmptyState, Input, Panel } from '@titan/ui';
import type { CxCustomerPropertySummary, CxEngagementPreferencesSummary } from '@titan/shared';
import {
  PortalApiClientError,
  createCxPortalProperty,
  fetchCxEngagementPreferences,
  fetchCxPortalProperties,
  updateCxEngagementPreferences,
} from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';

function formatPropertyAddress(property: CxCustomerPropertySummary): string {
  return (
    [
      property.unitNumber ? `Unit ${property.unitNumber}` : null,
      property.addressLine1,
      property.addressLine2,
      property.suburb,
      property.city,
      property.province,
      property.postalCode,
    ]
      .filter(Boolean)
      .join(', ') || 'No address'
  );
}

export function PortalProfilePage() {
  const { accessToken } = usePortalAuth();
  const [properties, setProperties] = useState<CxCustomerPropertySummary[]>([]);
  const [preferences, setPreferences] = useState<CxEngagementPreferencesSummary | null>(null);
  const [propertyName, setPropertyName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [suburb, setSuburb] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    void Promise.all([
      fetchCxPortalProperties(accessToken),
      fetchCxEngagementPreferences(accessToken),
    ])
      .then(([props, prefs]) => {
        setProperties(props);
        setPreferences(prefs);
      })
      .catch((err) =>
        setError(err instanceof PortalApiClientError ? err.message : 'Unable to load profile'),
      );
  }, [accessToken]);

  async function addProperty(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !propertyName.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const property = await createCxPortalProperty(accessToken, {
        propertyName: propertyName.trim(),
        addressLine1: addressLine1.trim() || undefined,
        addressLine2: addressLine2.trim() || undefined,
        suburb: suburb.trim() || undefined,
        city: city.trim() || undefined,
        province: province.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        unitNumber: unitNumber.trim() || undefined,
        isPrimary: properties.length === 0,
      });
      setProperties((current) => [...current, property]);
      setPropertyName('');
      setAddressLine1('');
      setAddressLine2('');
      setSuburb('');
      setCity('');
      setProvince('');
      setPostalCode('');
      setUnitNumber('');
      setSuccess(
        addressLine1.trim() || suburb.trim() || city.trim()
          ? 'Property added with address'
          : 'Property added (address left blank — update later if needed)',
      );
    } catch (err) {
      setError(err instanceof PortalApiClientError ? err.message : 'Unable to add property');
    } finally {
      setSaving(false);
    }
  }

  async function togglePreference(key: keyof CxEngagementPreferencesSummary) {
    if (!accessToken || !preferences || key === 'preferences') return;
    const updated = await updateCxEngagementPreferences(accessToken, {
      [key]: !preferences[key],
    });
    setPreferences(updated);
    setSuccess('Preferences updated');
  }

  return (
    <div className="portal-page">
      <PageHeader
        title="Profile & properties"
        description="Manage your properties, sites, and notification preferences."
      />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel title="Properties & sites">
        {properties.length === 0 ? (
          <EmptyState
            className="titan-empty-state--compact"
            title="No properties yet"
            description="Add a site with an address so bookings and jobs can use the correct location."
          />
        ) : (
          <ul className="portal-list">
            {properties.map((property) => (
              <li key={property.id}>
                <strong>{property.propertyName}</strong>
                {property.isPrimary ? <span>Primary</span> : null}
                <span>{formatPropertyAddress(property)}</span>
              </li>
            ))}
          </ul>
        )}
        <form className="auth-form" onSubmit={(event) => void addProperty(event)}>
          <Input
            name="propertyName"
            label="Property name"
            value={propertyName}
            onChange={(e) => setPropertyName(e.target.value)}
            required
            placeholder="e.g. Home, Office, Unit 4"
          />
          <Input
            name="addressLine1"
            label="Street address"
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            placeholder="Street number and name"
          />
          <Input
            name="addressLine2"
            label="Address line 2"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            placeholder="Complex / estate (optional)"
          />
          <div className="auth-form__row">
            <Input
              name="unitNumber"
              label="Unit / suite"
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
            />
            <Input
              name="suburb"
              label="Suburb"
              value={suburb}
              onChange={(e) => setSuburb(e.target.value)}
            />
          </div>
          <div className="auth-form__row">
            <Input name="city" label="City" value={city} onChange={(e) => setCity(e.target.value)} />
            <Input
              name="province"
              label="Province"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
            />
          </div>
          <Input
            name="postalCode"
            label="Postal code"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
          />
          <Button type="submit" disabled={saving || !propertyName.trim()}>
            {saving ? 'Saving…' : 'Add property'}
          </Button>
        </form>
      </Panel>

      {preferences ? (
        <Panel title="Engagement & consent">
          <ul className="portal-list">
            {(
              [
                'emailEnabled',
                'smsEnabled',
                'whatsappEnabled',
                'pushEnabled',
                'marketingEnabled',
                'trackingConsent',
              ] as const
            ).map((key) => (
              <li key={key}>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(preferences[key])}
                    onChange={() => void togglePreference(key)}
                  />
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                </label>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
