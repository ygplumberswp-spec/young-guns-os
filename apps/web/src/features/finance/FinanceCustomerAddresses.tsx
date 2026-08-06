import { useEffect, useState } from 'react';
import type { CustomerDetail } from '@titan/shared';
import { fetchCustomer } from '../../lib/crm-api';

type FinanceCustomerAddressesProps = {
  accessToken: string;
  customerId: string;
};

function AddressBlock({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="finance-editor-address">
      <span className="finance-editor-address__label">{label}</span>
      <p className="finance-editor-address__value">{value?.trim() || '—'}</p>
    </div>
  );
}

export function FinanceCustomerAddresses({ accessToken, customerId }: FinanceCustomerAddressesProps) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void fetchCustomer(accessToken, customerId)
      .then((data) => {
        if (!cancelled) setCustomer(data);
      })
      .catch(() => {
        if (!cancelled) setCustomer(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, customerId]);

  if (isLoading) {
    return <p className="finance-editor-muted">Loading addresses…</p>;
  }

  if (!customer) {
    return <p className="finance-editor-muted">Addresses unavailable.</p>;
  }

  return (
    <div className="finance-editor-addresses">
      <AddressBlock label="Billing address" value={customer.billingAddress} />
      <AddressBlock label="Site address" value={customer.siteAddress} />
      {customer.vatNumber ? (
        <div className="finance-editor-address">
          <span className="finance-editor-address__label">VAT number</span>
          <p className="finance-editor-address__value">{customer.vatNumber}</p>
        </div>
      ) : null}
    </div>
  );
}
