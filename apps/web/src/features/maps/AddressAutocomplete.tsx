import { useEffect, useId, useState } from 'react';
import type { GoogleGeocodedAddress, GooglePlacePrediction } from '@titan/shared';
import { Input } from '@titan/ui';
import { useAuth } from '../../lib/auth-context';
import {
  autocompleteGooglePlaces,
  fetchGooglePlaceDetails,
  geocodeGoogleAddress,
} from '../../lib/google-maps-api';
import { ApiClientError } from '../../lib/api-client';

export type AddressAutocompleteProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onResolved?: (address: GoogleGeocodedAddress) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function AddressAutocomplete({
  label = 'Address',
  value,
  onChange,
  onResolved,
  disabled = false,
  placeholder = 'Start typing a street address…',
}: AddressAutocompleteProps) {
  const { accessToken } = useAuth();
  const listId = useId();
  const [predictions, setPredictions] = useState<GooglePlacePrediction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionToken] = useState(() => crypto.randomUUID());
  const [mapsUnavailable, setMapsUnavailable] = useState(false);

  useEffect(() => {
    if (!accessToken || disabled || value.trim().length < 3 || mapsUnavailable) {
      setPredictions([]);
      return;
    }

    const handle = window.setTimeout(() => {
      void autocompleteGooglePlaces(accessToken, value, sessionToken)
        .then((rows) => {
          setPredictions(rows);
          setError(null);
          setMapsUnavailable(false);
        })
        .catch((err) => {
          if (err instanceof ApiClientError && err.code === 'NOT_CONNECTED') {
            setMapsUnavailable(true);
            setPredictions([]);
            return;
          }
          setError(err instanceof ApiClientError ? err.message : 'Autocomplete unavailable');
          setPredictions([]);
        });
    }, 280);

    return () => window.clearTimeout(handle);
  }, [accessToken, value, disabled, sessionToken, mapsUnavailable]);

  async function selectPrediction(prediction: GooglePlacePrediction) {
    if (!accessToken) return;
    onChange(prediction.description);
    setPredictions([]);
    try {
      const details = await fetchGooglePlaceDetails(accessToken, prediction.placeId);
      if (details) onResolved?.(details);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to resolve place');
    }
  }

  async function verifyTypedAddress() {
    if (!accessToken || !value.trim()) return;
    try {
      const result = await geocodeGoogleAddress(accessToken, value.trim());
      if (!result) {
        setError('Address could not be verified. TITAN will not invent coordinates.');
        return;
      }
      onChange(result.formattedAddress);
      onResolved?.(result);
      setError(null);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'NOT_CONNECTED') {
        setMapsUnavailable(true);
        setError('Google Maps is not connected. Address text can still be saved without coordinates.');
        return;
      }
      setError(err instanceof ApiClientError ? err.message : 'Geocoding failed');
    }
  }

  return (
    <div className="titan-address-autocomplete">
      <label>
        {label}
        <Input
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          list={listId}
          autoComplete="off"
        />
      </label>
      {predictions.length > 0 ? (
        <ul className="titan-address-autocomplete__list" role="listbox">
          {predictions.map((prediction) => (
            <li key={prediction.placeId}>
              <button type="button" onClick={() => void selectPrediction(prediction)}>
                <strong>{prediction.mainText}</strong>
                <span>{prediction.secondaryText}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="titan-address-autocomplete__actions">
        <button type="button" className="titan-btn titan-btn--secondary titan-btn--sm" onClick={() => void verifyTypedAddress()} disabled={disabled || !value.trim()}>
          Verify address
        </button>
        {mapsUnavailable ? (
          <span className="page-muted">Google Maps not connected — text-only address.</span>
        ) : null}
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
