import { useCallback, useEffect, useRef, useState } from 'react';
import type { FinanceCustomerSearchResult, CreateCustomerRequest } from '@titan/shared';
import { findDuplicateCustomersByContact } from '@titan/shared';
import { isValidEmailAddress, normalizeSaPhone } from '@titan/shared';
import { Button, Input } from '@titan/ui';
import { searchFinanceCustomers } from '../../lib/finance-api';
import { createCustomer } from '../../lib/crm-api';

type CustomerSearchFieldProps = {
  accessToken: string;
  value: FinanceCustomerSearchResult | null;
  onChange: (customer: FinanceCustomerSearchResult | null) => void;
  disabled?: boolean;
  canCreateCustomer?: boolean;
};

export function CustomerSearchField({
  accessToken,
  value,
  onChange,
  disabled,
  canCreateCustomer = true,
}: CustomerSearchFieldProps) {
  const [query, setQuery] = useState(value?.name ?? '');
  const [results, setResults] = useState<FinanceCustomerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [newCustomer, setNewCustomer] = useState<CreateCustomerRequest>({ name: '' });
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; phone?: string }>({});
  const [isCreating, setIsCreating] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const skipSearchRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    if (value && query === (value.companyName?.trim() || value.name)) {
      setResults([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void runSearch(query);
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, runSearch, value]);

  function selectCustomer(customer: FinanceCustomerSearchResult) {
    skipSearchRef.current = true;
    onChange(customer);
    setQuery(customer.companyName?.trim() || customer.name);
    setResults([]);
    setHighlightIndex(-1);
    setShowDrawer(false);
    setFieldErrors({});
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function openAddCustomerDrawer() {
    setNewCustomer({
      name: query.trim(),
      companyName: query.trim(),
    });
    setFieldErrors({});
    setShowDrawer(true);
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

  function validateNewCustomerFields(): boolean {
    const nextErrors: { email?: string; phone?: string } = {};
    const email = newCustomer.email?.trim();
    const phone = newCustomer.phone?.trim();

    if (email && !isValidEmailAddress(email)) {
      nextErrors.email = 'Enter a valid email address';
    }
    if (phone && !normalizeSaPhone(phone)) {
      nextErrors.phone = 'Enter a valid South African phone number';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleCreateCustomer() {
    if (!canCreateCustomer || !newCustomer.name.trim()) return;
    if (!validateNewCustomerFields()) return;
    if (duplicateMatches.length > 0) return;

    setIsCreating(true);
    setError(null);
    try {
      const payload: CreateCustomerRequest = {
        ...newCustomer,
        phone: newCustomer.phone?.trim() ? normalizeSaPhone(newCustomer.phone) ?? newCustomer.phone.trim() : undefined,
        email: newCustomer.email?.trim() || undefined,
      };
      const created = await createCustomer(accessToken, payload);
      selectCustomer({
        id: created.id,
        name: created.name,
        companyName: created.companyName,
        email: created.email,
        phone: created.phone,
        xeroContactId: created.xeroContactId,
      });
      setNewCustomer({ name: '' });
    } catch {
      setError('Unable to create customer');
    } finally {
      setIsCreating(false);
    }
  }

  const duplicateMatches = findDuplicateCustomersByContact(newCustomer, results);
  const showAddNew = canCreateCustomer && query.trim().length >= 2 && !value;

  return (
    <div className="finance-customer-search finance-customer-search--editor">
      <label className="titan-input-group finance-editor-field-group">
        <span className="titan-input-label">Customer search</span>
        <input
          ref={searchInputRef}
          className="titan-input finance-editor-field"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value && e.target.value !== (value.companyName?.trim() || value.name)) onChange(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search name, company, phone, email…"
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={results.length > 0 || showAddNew}
          aria-controls="finance-customer-search-results"
        />
      </label>

      {value ? (
        <div className="finance-customer-search__selected" aria-live="polite">
          <div className="finance-customer-search__selected-main">
            <strong>{value.name}</strong>
            {value.companyName ? <span>{value.companyName}</span> : null}
          </div>
          <p className="finance-customer-search__selected-meta">
            {[value.email, value.phone, value.xeroContactId ? `Xero: ${value.xeroContactId}` : null]
              .filter(Boolean)
              .join(' · ') || 'No contact details on file'}
          </p>
        </div>
      ) : null}

      {isSearching ? <p className="finance-editor-muted">Searching…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {results.length > 0 || showAddNew ? (
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
          {showAddNew ? (
            <li>
              <button type="button" className="finance-customer-search__create" onClick={openAddCustomerDrawer}>
                Add new customer
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {showDrawer ? (
        <div className="finance-customer-drawer finance-customer-drawer--editor">
          <h3 className="finance-customer-drawer__title">Add new customer</h3>
          <Input
            label="Customer / business name"
            value={newCustomer.name}
            onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
            required
          />
          <Input
            label="Company / trading name"
            value={newCustomer.companyName ?? ''}
            onChange={(e) => setNewCustomer({ ...newCustomer, companyName: e.target.value })}
          />
          <Input
            label="Contact person"
            value={newCustomer.contactPerson ?? ''}
            onChange={(e) => setNewCustomer({ ...newCustomer, contactPerson: e.target.value })}
          />
          <Input
            label="Phone"
            value={newCustomer.phone ?? ''}
            onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
            error={fieldErrors.phone}
          />
          <Input
            label="Email"
            value={newCustomer.email ?? ''}
            onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
            error={fieldErrors.email}
          />
          <label className="titan-input-group finance-editor-field-group">
            <span className="titan-input-label">Billing address</span>
            <textarea
              className="titan-input finance-editor-field finance-textarea"
              rows={2}
              value={newCustomer.billingAddress ?? ''}
              onChange={(e) => setNewCustomer({ ...newCustomer, billingAddress: e.target.value })}
            />
          </label>
          <label className="titan-input-group finance-editor-field-group">
            <span className="titan-input-label">Site address</span>
            <textarea
              className="titan-input finance-editor-field finance-textarea"
              rows={2}
              value={newCustomer.siteAddress ?? ''}
              onChange={(e) => setNewCustomer({ ...newCustomer, siteAddress: e.target.value })}
            />
          </label>
          {duplicateMatches.length > 0 ? (
            <div className="finance-customer-drawer__duplicates">
              <p className="form-error">Possible duplicate customer — select an existing match or adjust details.</p>
              <ul className="finance-customer-search__results">
                {duplicateMatches.map((customer) => (
                  <li key={customer.id}>
                    <button type="button" className="finance-customer-search__option" onClick={() => selectCustomer(customer)}>
                      <strong>{customer.name}</strong>
                      <span>{[customer.email, customer.phone].filter(Boolean).join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="finance-customer-drawer__actions">
            <Button type="button" variant="secondary" onClick={() => setShowDrawer(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreateCustomer()}
              disabled={!canCreateCustomer || isCreating || !newCustomer.name.trim() || duplicateMatches.length > 0}
            >
              {isCreating ? 'Saving…' : 'Save customer'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
