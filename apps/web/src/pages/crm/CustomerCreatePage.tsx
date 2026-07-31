import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, Input, PageHeader } from '@titan/ui';
import type { CustomerStatus } from '@titan/shared';
import { CUSTOMER_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { createCustomer } from '../../lib/crm-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { canManageCustomers } from '../../features/crm/CustomerList';

export function CustomerCreatePage() {
  const { accessToken, user } = useAuth();
  const { invalidateCustomers } = useStaffMutationInvalidation();
  const [, navigate] = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<CustomerStatus>('active');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageCustomers(user.permissions) : false;

  useEffect(() => {
    if (user && !canWrite) {
      navigate('/crm');
    }
  }, [canWrite, navigate, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !canWrite) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const customer = await createCustomer(accessToken, {
        name,
        email: email.trim() || null,
        phone: phone.trim() || null,
        status,
        notes: notes.trim() || null,
      });

      invalidateCustomers();
      navigate(`/crm/${customer.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create customer');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="crm-page">
      <PageHeader
        title="New customer"
        description="Create a customer record for your company."
        actions={
          <Link href="/crm">
            <Button variant="secondary">Back to customers</Button>
          </Link>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}

      <form className="crm-form" onSubmit={(event) => void handleSubmit(event)}>
        <Input
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />

        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <Input label="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} />

        <label className="titan-input-group">
          <span className="titan-input-label">Status</span>
          <select
            className="titan-input"
            value={status}
            onChange={(event) => setStatus(event.target.value as CustomerStatus)}
          >
            {CUSTOMER_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="titan-input-group">
          <span className="titan-input-label">Notes</span>
          <textarea
            className="titan-input crm-textarea"
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="General notes about this customer"
          />
        </label>

        <div className="crm-form__actions">
          <Button type="submit" disabled={isSaving || !name.trim()}>
            {isSaving ? 'Creating…' : 'Create customer'}
          </Button>
        </div>
      </form>
    </div>
  );
}
