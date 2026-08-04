import { useCallback, useEffect, useRef, useState } from 'react';
import type { FinanceCustomerSearchResult, CreateCustomerRequest } from '@titan/shared';
import { findDuplicateCustomerHint } from '@titan/shared';
import { Button, Input } from '@titan/ui';
import { searchFinanceCustomers } from '../../lib/finance-api';
import { createCustomer } from '../../lib/crm-api';

type CustomerSearchFieldProps = {
  accessToken: string;
  value: FinanceCustomerSearchResult | null;
  onChange: (customer: FinanceCustomerSearchResult | null) => void;
  disabled?: boolean;
};

export function CustomerSearchField({ accessToken, value, onChange, disabled }: CustomerSearchFieldProps) {
  const [query, setQuery] = useState(value?.name ?? '');
  const [results, setResults] = useState<FinanceCustomerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [newCustomer, setNewCustomer] = useState<CreateCustomerRequest>({ name: '' });
  const [isCreating, setIsCreating] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (value) setQuery(value.companyName?.trim() || value.name);
  }, [value]);

  const runSearch = useCallback(
    async (searchQuery: string) => {
      if (searchQuery.trim().length < 2) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      setError(null);
      try {
        const data = await searchFinanceCustomers(accessToken, searchQuery);
        setResults(data);
        setHighlightIndex(data.length > 0 ? 0 : -1);
      } catch {
        setError('Unable to search customers');
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void runSearch(query);
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  function selectCustomer(customer: FinanceCustomerSearchResult) {
    onChange(customer);
    setQuery(customer.companyName?.trim() || customer.name);
    setResults([]);
    setHighlightIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightIndex((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && highlightIndex >= 0) {
      event.preventDefault();
      selectCustomer(results[highlightIndex]!);
    } else if (event.key === 'Escape') {
      setResults([]);
    }
  }

  async function handleCreateCustomer() {
    if (!newCustomer.name.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      const created = await createCustomer(accessToken, newCustomer);
      selectCustomer({
        id: created.id,
        name: created.name,
        companyName: created.companyName,
        email: created.email,
        phone: created.phone,
        xeroContactId: created.xeroContactId,
      });
      setShowDrawer(false);
      setNewCustomer({ name: '' });
    } catch {
      setError('Unable to create customer');
    } finally {
      setIsCreating(false);
    }
  }

  const duplicateHint = findDuplicateCustomerHint(newCustomer.name, results);

  return (
    <div className="finance-customer-search">
      <label className="titan-input-group">
        <span className="titan-input-label">Customer</span>
        <input
          className="titan-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value && e.target.value !== (value.companyName?.trim() || value.name)) onChange(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search name, company, phone, email, Xero contact…"
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="finance-customer-search-results"
        />
      </label>

      {isSearching ? <p className="page-muted finance-customer-search__hint">Searching…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {results.length > 0 ? (
        <ul id="finance-customer-search-results" className="finance-customer-search__results" role="listbox">
          {results.map((customer, index) => (
            <li key={customer.id}>
              <button
                type="button"
                className={`finance-customer-search__option${index === highlightIndex ? ' finance-customer-search__option--active' : ''}`}
                onClick={() => selectCustomer(customer)}
              >
                <strong>{customer.name}</strong>
                {customer.companyName ? <span>{customer.companyName}</span> : null}
                <span>{[customer.email, customer.phone, customer.xeroContactId].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="finance-customer-search__create" onClick={() => setShowDrawer(true)}>
              Create new customer
            </button>
          </li>
        </ul>
      ) : null}

      {showDrawer ? (
        <div className="finance-customer-drawer">
          <h3>New customer</h3>
          <Input label="Customer / company name" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} required />
          <Input label="Company / trading name" value={newCustomer.companyName ?? ''} onChange={(e) => setNewCustomer({ ...newCustomer, companyName: e.target.value })} />
          <Input label="Contact person" value={newCustomer.contactPerson ?? ''} onChange={(e) => setNewCustomer({ ...newCustomer, contactPerson: e.target.value })} />
          <Input label="Phone" value={newCustomer.phone ?? ''} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
          <Input label="Email" value={newCustomer.email ?? ''} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} />
          <label className="titan-input-group">
            <span className="titan-input-label">Billing address</span>
            <textarea className="titan-input finance-textarea" rows={2} value={newCustomer.billingAddress ?? ''} onChange={(e) => setNewCustomer({ ...newCustomer, billingAddress: e.target.value })} />
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Site address</span>
            <textarea className="titan-input finance-textarea" rows={2} value={newCustomer.siteAddress ?? ''} onChange={(e) => setNewCustomer({ ...newCustomer, siteAddress: e.target.value })} />
          </label>
          <Input label="VAT number" value={newCustomer.vatNumber ?? ''} onChange={(e) => setNewCustomer({ ...newCustomer, vatNumber: e.target.value })} />
          {duplicateHint ? <p className="form-error">A similar customer may already exist. Review matches before saving.</p> : null}
          <div className="finance-customer-drawer__actions">
            <Button type="button" variant="secondary" onClick={() => setShowDrawer(false)}>Cancel</Button>
            <Button type="button" onClick={() => void handleCreateCustomer()} disabled={isCreating || !newCustomer.name.trim()}>
              {isCreating ? 'Saving…' : 'Save customer'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
