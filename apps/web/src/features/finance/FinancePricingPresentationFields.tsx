import type { CalloutAllocationPolicy, PricingPresentationMode } from '@titan/shared';

export type FinancePricingPresentationState = {
  pricingPresentationMode: PricingPresentationMode;
  labourIncluded: boolean;
  calloutIncluded: boolean;
  calloutAllocation: CalloutAllocationPolicy;
};

export const DEFAULT_FINANCE_PRICING_PRESENTATION: FinancePricingPresentationState = {
  pricingPresentationMode: 'ITEMISED',
  labourIncluded: false,
  calloutIncluded: false,
  calloutAllocation: 'PER_JOB',
};

type Props = {
  value: FinancePricingPresentationState;
  onChange: (next: FinancePricingPresentationState) => void;
  disabled?: boolean;
};

export function FinancePricingPresentationFields({ value, onChange, disabled }: Props) {
  const flat = value.pricingPresentationMode === 'FLAT_RATE_INCLUDED';
  return (
    <div className="finance-editor-card__section">
      <h3 className="finance-editor-card__section-title">Pricing presentation</h3>
      <p className="page-muted" style={{ marginBottom: '0.75rem' }}>
        Flat-rate absorbs labour/call-out into the customer-facing service price. Internal
        components stay available for authorised staff.
      </p>
      <label className="field">
        <span>Customer pricing mode</span>
        <select
          value={value.pricingPresentationMode}
          disabled={disabled}
          onChange={(event) => {
            const mode = event.target.value as PricingPresentationMode;
            onChange({
              ...value,
              pricingPresentationMode: mode,
              labourIncluded: mode === 'FLAT_RATE_INCLUDED' ? value.labourIncluded : false,
              calloutIncluded: mode === 'FLAT_RATE_INCLUDED' ? value.calloutIncluded : false,
            });
          }}
        >
          <option value="ITEMISED">Itemised (labour/call-out may show separately)</option>
          <option value="FLAT_RATE_INCLUDED">Flat-rate (included labour/call-out hidden)</option>
        </select>
      </label>
      {flat ? (
        <div className="finance-editor-card__inline-fields" style={{ marginTop: '0.75rem' }}>
          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={value.labourIncluded}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...value, labourIncluded: event.target.checked })
              }
            />
            <span>Labour included in fixed service price</span>
          </label>
          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={value.calloutIncluded}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...value, calloutIncluded: event.target.checked })
              }
            />
            <span>Call-out included in fixed service price</span>
          </label>
          {value.calloutIncluded ? (
            <label className="field">
              <span>Call-out allocation</span>
              <select
                value={value.calloutAllocation}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    calloutAllocation: event.target.value as CalloutAllocationPolicy,
                  })
                }
              >
                <option value="PER_JOB">Once per job / quote</option>
                <option value="PER_UNIT">Per unit / per service line</option>
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
