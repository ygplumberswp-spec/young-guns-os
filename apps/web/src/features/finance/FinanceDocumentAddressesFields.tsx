import type { FinanceDocumentAddresses } from './finance-editor-utils';

type FinanceDocumentAddressesFieldsProps = {
  addresses: FinanceDocumentAddresses;
  onChange: (addresses: FinanceDocumentAddresses) => void;
  disabled?: boolean;
};

export function FinanceDocumentAddressesFields({
  addresses,
  onChange,
  disabled,
}: FinanceDocumentAddressesFieldsProps) {
  return (
    <div className="finance-editor-addresses finance-editor-addresses--editable">
      <label className="titan-input-group finance-editor-field-group">
        <span className="titan-input-label">Billing address</span>
        <textarea
          className="titan-input finance-editor-field finance-textarea"
          rows={2}
          value={addresses.billingAddress}
          disabled={disabled}
          onChange={(e) => onChange({ ...addresses, billingAddress: e.target.value })}
        />
      </label>
      <label className="titan-input-group finance-editor-field-group">
        <span className="titan-input-label">Delivery / site address</span>
        <textarea
          className="titan-input finance-editor-field finance-textarea"
          rows={2}
          value={addresses.siteAddress}
          disabled={disabled}
          onChange={(e) => onChange({ ...addresses, siteAddress: e.target.value })}
        />
      </label>
      <label className="titan-input-group finance-editor-field-group">
        <span className="titan-input-label">Postal address</span>
        <textarea
          className="titan-input finance-editor-field finance-textarea"
          rows={2}
          value={addresses.postalAddress}
          disabled={disabled}
          onChange={(e) => onChange({ ...addresses, postalAddress: e.target.value })}
        />
      </label>
    </div>
  );
}
