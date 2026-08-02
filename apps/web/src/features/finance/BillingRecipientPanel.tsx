import { FormEvent, useState } from 'react';
import { Button, Input, Panel } from '@titan/ui';
import type { CustomerSummary, UpdateBillingRecipientRequest } from '@titan/shared';

type BillingRecipientPanelProps = {
  title: string;
  serviceCustomerId: string;
  serviceCustomerName: string;
  customers: CustomerSummary[];
  values: {
    billingCustomerId: string | null;
    recipientName: string | null;
    recipientEmail: string | null;
    recipientPhone: string | null;
    billingAddress: string | null;
    vatNumber: string | null;
    poReference: string | null;
    attentionPerson: string | null;
  };
  editable: boolean;
  onSave: (input: UpdateBillingRecipientRequest) => Promise<void>;
};

export function BillingRecipientPanel({
  title,
  serviceCustomerId,
  serviceCustomerName,
  customers,
  values,
  editable,
  onSave,
}: BillingRecipientPanelProps) {
  const [open, setOpen] = useState(false);
  const [billingCustomerId, setBillingCustomerId] = useState(values.billingCustomerId ?? '');
  const [recipientName, setRecipientName] = useState(values.recipientName ?? '');
  const [recipientEmail, setRecipientEmail] = useState(values.recipientEmail ?? '');
  const [recipientPhone, setRecipientPhone] = useState(values.recipientPhone ?? '');
  const [billingAddress, setBillingAddress] = useState(values.billingAddress ?? '');
  const [vatNumber, setVatNumber] = useState(values.vatNumber ?? '');
  const [poReference, setPoReference] = useState(values.poReference ?? '');
  const [attentionPerson, setAttentionPerson] = useState(values.attentionPerson ?? '');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const billedPartyName =
    customers.find((customer) => customer.id === (billingCustomerId || values.billingCustomerId))?.name ??
    (recipientName || values.recipientName || serviceCustomerName);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!editable || reason.trim().length < 3) {
      setError('Reason is required (minimum 3 characters).');
      return;
    }
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await onSave({
        billingCustomerId: billingCustomerId || null,
        recipientName: recipientName || null,
        recipientEmail: recipientEmail || null,
        recipientPhone: recipientPhone || null,
        billingAddress: billingAddress || null,
        vatNumber: vatNumber || null,
        poReference: poReference || null,
        attentionPerson: attentionPerson || null,
        reason: reason.trim(),
      });
      setSuccess('Billing recipient updated.');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update billing recipient');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Panel title={title} description={`Service customer: ${serviceCustomerName} · Billed party: ${billedPartyName}`}>
      {editable ? (
        <div className="panel-inline-actions">
          <Button variant="secondary" size="sm" onClick={() => setOpen((value) => !value)}>
            {open ? 'Close' : 'Change billing / recipient'}
          </Button>
        </div>
      ) : null}
      <dl className="detail-grid">
        <div>
          <dt>Recipient</dt>
          <dd>{values.recipientName ?? billedPartyName}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{values.recipientEmail ?? '—'}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{values.recipientPhone ?? '—'}</dd>
        </div>
        <div>
          <dt>PO reference</dt>
          <dd>{values.poReference ?? '—'}</dd>
        </div>
      </dl>

      {open && editable ? (
        <form className="stack-form billing-recipient-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Billing customer
            <select value={billingCustomerId} onChange={(event) => setBillingCustomerId(event.target.value)}>
              <option value="">Same as service customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setBillingCustomerId(serviceCustomerId);
                setRecipientName(serviceCustomerName);
              }}
            >
              Copy from service customer
            </Button>
          </div>
          <Input label="Recipient name" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} />
          <Input label="Email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} />
          <Input label="Phone" value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} />
          <Input label="Billing address" value={billingAddress} onChange={(event) => setBillingAddress(event.target.value)} />
          <Input label="VAT / tax number" value={vatNumber} onChange={(event) => setVatNumber(event.target.value)} />
          <Input label="PO reference" value={poReference} onChange={(event) => setPoReference(event.target.value)} />
          <Input label="Attention" value={attentionPerson} onChange={(event) => setAttentionPerson(event.target.value)} />
          <Input label="Reason for change" value={reason} onChange={(event) => setReason(event.target.value)} required />
          {error ? <p className="form-error">{error}</p> : null}
          {success ? <p className="form-success">{success}</p> : null}
          <div className="form-actions">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save recipient'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </Panel>
  );
}
