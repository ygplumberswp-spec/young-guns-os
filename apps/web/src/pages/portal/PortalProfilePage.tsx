import { useEffect, useState } from 'react';
import { Button, PageHeader, Panel } from '@titan/ui';
import type { CxCustomerPropertySummary, CxEngagementPreferencesSummary } from '@titan/shared';
import {
  PortalApiClientError,
  createCxPortalProperty,
  fetchCxEngagementPreferences,
  fetchCxPortalProperties,
  updateCxEngagementPreferences,
} from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';

export function PortalProfilePage() {
  const { accessToken } = usePortalAuth();
  const [properties, setProperties] = useState<CxCustomerPropertySummary[]>([]);
  const [preferences, setPreferences] = useState<CxEngagementPreferencesSummary | null>(null);
  const [propertyName, setPropertyName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void Promise.all([fetchCxPortalProperties(accessToken), fetchCxEngagementPreferences(accessToken)])
      .then(([props, prefs]) => {
        setProperties(props);
        setPreferences(prefs);
      })
      .catch((err) => setError(err instanceof PortalApiClientError ? err.message : 'Unable to load profile'));
  }, [accessToken]);

  async function addProperty() {
    if (!accessToken || !propertyName.trim()) return;
    try {
      const property = await createCxPortalProperty(accessToken, { propertyName: propertyName.trim(), isPrimary: properties.length === 0 });
      setProperties((current) => [...current, property]);
      setPropertyName('');
      setSuccess('Property added');
    } catch (err) {
      setError(err instanceof PortalApiClientError ? err.message : 'Unable to add property');
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
      <PageHeader title="Profile & properties" description="Manage your properties, sites, and notification preferences." />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel title="Properties & sites">
        <ul className="portal-list">
          {properties.map((property) => (
            <li key={property.id}>
              <strong>{property.propertyName}</strong>
              {property.isPrimary ? <span>Primary</span> : null}
              <span>
                {[property.addressLine1, property.city, property.postalCode].filter(Boolean).join(', ') || 'No address'}
              </span>
            </li>
          ))}
        </ul>
        <div className="form-row">
          <input
            type="text"
            placeholder="Property name"
            value={propertyName}
            onChange={(event) => setPropertyName(event.target.value)}
          />
          <Button onClick={() => void addProperty()}>Add property</Button>
        </div>
      </Panel>

      {preferences ? (
        <Panel title="Engagement & consent">
          <ul className="portal-list">
            {(['emailEnabled', 'smsEnabled', 'whatsappEnabled', 'pushEnabled', 'marketingEnabled', 'trackingConsent'] as const).map(
              (key) => (
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
              ),
            )}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
