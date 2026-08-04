import { useState } from 'react';
import type { GoogleGeocodedAddress } from '@titan/shared';
import { Button } from '@titan/ui';
import type { FinanceDocumentAddresses } from './finance-editor-utils';
import { AddressAutocomplete } from '../maps/AddressAutocomplete';
import { GoogleMapView } from '../maps/GoogleMapView';

type FinanceDocumentAddressesFieldsProps = {
  addresses: FinanceDocumentAddresses;
  onChange: (addresses: FinanceDocumentAddresses) => void;
  disabled?: boolean;
};

type SiteGeoState = {
  latitude: number;
  longitude: number;
  placeId: string | null;
  verified: boolean;
} | null;

export function FinanceDocumentAddressesFields({
  addresses,
  onChange,
  disabled,
}: FinanceDocumentAddressesFieldsProps) {
  const [siteGeo, setSiteGeo] = useState<SiteGeoState>(null);

  function patch(patch: Partial<FinanceDocumentAddresses>) {
    onChange({ ...addresses, ...patch });
  }

  function applySiteResolved(address: GoogleGeocodedAddress) {
    setSiteGeo({
      latitude: address.latitude,
      longitude: address.longitude,
      placeId: address.placeId ?? null,
      verified: true,
    });
  }

  return (
    <div className="finance-editor-addresses finance-editor-addresses--editable">
      <div className="finance-editor-addresses__field">
        <AddressAutocomplete
          label="Billing address"
          value={addresses.billingAddress}
          disabled={disabled}
          placeholder="Search billing address or type manually…"
          onChange={(value) => patch({ billingAddress: value })}
          onResolved={(resolved) => patch({ billingAddress: resolved.formattedAddress })}
        />
        <div className="finance-editor-addresses__shortcuts">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || !addresses.siteAddress.trim()}
            onClick={() => patch({ billingAddress: addresses.siteAddress })}
          >
            Same as site
          </Button>
        </div>
      </div>

      <div className="finance-editor-addresses__field">
        <AddressAutocomplete
          label="Delivery / site address"
          value={addresses.siteAddress}
          disabled={disabled}
          placeholder="Search site address or type manually…"
          onChange={(value) => {
            patch({ siteAddress: value });
            setSiteGeo(null);
          }}
          onResolved={(resolved) => {
            patch({ siteAddress: resolved.formattedAddress });
            applySiteResolved(resolved);
          }}
        />
        {siteGeo?.verified ? (
          <p className="finance-editor-hint finance-editor-hint--verified">
            Verified with Google Maps
            {siteGeo.placeId ? ' · place resolved' : ''}
          </p>
        ) : addresses.siteAddress.trim() ? (
          <p className="finance-editor-hint">
            Manual entry allowed — select a suggestion or verify to preview the site map.
          </p>
        ) : null}
        {siteGeo?.verified ? (
          <div className="finance-editor-addresses__map">
            <GoogleMapView
              markers={[
                {
                  id: 'site',
                  latitude: siteGeo.latitude,
                  longitude: siteGeo.longitude,
                  label: 'Site',
                  tone: 'customer',
                },
              ]}
              height={220}
              emptyTitle="Site map"
              emptyDescription="Map preview unavailable."
              cameraContextKey={addresses.siteAddress}
            />
          </div>
        ) : null}
      </div>

      <div className="finance-editor-addresses__field">
        <AddressAutocomplete
          label="Postal address"
          value={addresses.postalAddress}
          disabled={disabled}
          placeholder="Search postal address or type manually…"
          onChange={(value) => patch({ postalAddress: value })}
          onResolved={(resolved) => patch({ postalAddress: resolved.formattedAddress })}
        />
        <div className="finance-editor-addresses__shortcuts">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || !addresses.billingAddress.trim()}
            onClick={() => patch({ postalAddress: addresses.billingAddress })}
          >
            Same as billing
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || !addresses.siteAddress.trim()}
            onClick={() => patch({ postalAddress: addresses.siteAddress })}
          >
            Same as site
          </Button>
        </div>
      </div>
    </div>
  );
}
