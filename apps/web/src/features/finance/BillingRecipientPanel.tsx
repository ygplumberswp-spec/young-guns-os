import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Button, Input, Panel } from '@titan/ui';
import type { CustomerSummary, UpdateBillingRecipientRequest } from '@titan/shared';
import {
  resolveBillingCustomerName,
  type BillingRecipientFormValues,
} from './billing-recipient-state';

type BillingRecipientPanelProps = {
  recipientLabel: string;
  serviceCustomerId: string;
  serviceCustomerName: string;
  customers: CustomerSummary[];
  values: BillingRecipientFormValues;
  editable: boolean;
  blockedMessage?: string | null;
  requireReason?: boolean;
  mode?: 'persisted' | 'local';
  onSave?: (input: UpdateBillingRecipientRequest) => Promise<void>;
  onChange?: (values: BillingRecipientFormValues) => void;
};

export function BillingRecipientPanel({
  recipientLabel,
  serviceCustomerId,
  serviceCustomerName,
  customers,
  values,
  editable,
  blockedMessage,
  requireReason = true,
  mode = 'persisted',
  onSave,
  onChange,
}: BillingRecipientPanelProps) {
  const [billingOpen, setBillingOpen] = useState(false);
  const [recipientOpen, setRecipientOpen] = useState(false);
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

  useEffect(() => {
    setBillingCustomerId(values.billingCustomerId ?? '');
    setRecipientName(values.recipientName ?? '');
    setRecipientEmail(values.recipientEmail ?? '');
    setRecipientPhone(values.recipientPhone ?? '');
    setBillingAddress(values.billingAddress ?? '');
    setVatNumber(values.vatNumber ?? '');
    setPoReference(values.poReference ?? '');
    setAttentionPerson(values.attentionPerson ?? '');
  }, [values]);

  const billingCustomerName = resolveBillingCustomerName(
    values.billingCustomerId,
    customers,
    serviceCustomerName,
  );
  const displayRecipient = values.recipientName ?? billingCustomerName;

  function emitLocalChange(next: BillingRecipientFormValues) {
    onChange?.(next);
  }

  function copyFromServiceCustomer() {
    setBillingCustomerId(serviceCustomerId);
    setRecipientName(serviceCustomerName);
    if (mode === 'local') {
      emitLocalChange({
        billingCustomerId: serviceCustomerId,
        recipientName: serviceCustomerName,
        recipientEmail,
        recipientPhone,
        billingAddress,
        vatNumber,
        poReference,
        attentionPerson,
      });
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!editable) return;

    const resolvedReason = requireReason ? reason.trim() : reason.trim() || 'Draft billing recipient update';
    if (resolvedReason.length < 3) {
      setError('Reason is required (minimum 3 characters).');
      return;
    }

    const payload: UpdateBillingRecipientRequest = {
      billingCustomerId: billingCustomerId || null,
      recipientName: recipientName || null,
      recipientEmail: recipientEmail || null,
      recipientPhone: recipientPhone || null,
      billingAddress: billingAddress || null,
      vatNumber: vatNumber || null,
      poReference: poReference || null,
      attentionPerson: attentionPerson || null,
      reason: resolvedReason,
    };

    if (mode === 'local') {
      emitLocalChange({
        billingCustomerId: payload.billingCustomerId ?? null,
        recipientName: payload.recipientName ?? null,
        recipientEmail: payload.recipientEmail ?? null,
        recipientPhone: payload.recipientPhone ?? null,
        billingAddress: payload.billingAddress ?? null,
        vatNumber: payload.vatNumber ?? null,
        poReference: payload.poReference ?? null,
        attentionPerson: payload.attentionPerson ?? null,
      });
      setSuccess('Billing recipient updated for this draft.');
      setBillingOpen(false);
      setRecipientOpen(false);
      return;
    }

    if (!onSave) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await onSave(payload);
      setSuccess('Billing recipient updated.');
      setBillingOpen(false);
      setRecipientOpen(false);
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update billing recipient');
    } finally {
      setIsSaving(false);
    }
  }

  const formOpen = billingOpen || recipientOpen;

  return (
    <Panel
      title="Billing & Recipient"
      description="Service customer stays linked to the job. Billing and recipient can differ."
    >
      <dl className="detail-grid billing-recipient-summary">
        <div>
          <dt>Service Customer</dt>
          <dd>
            <Link href={`/crm/${serviceCustomerId}`} className="finance-link">
              {serviceCustomerName}
            </Link>
          </dd>
        </div>
        <div>
          <dt>Billing Customer</dt>
          <dd>{billingCustomerName}</dd>
        </div>
        <div>
          <dt>{recipientLabel}</dt>
          <dd>{displayRecipient}</dd>
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
          <dt>PO Reference</dt>
          <dd>{values.poReference ?? '—'}</dd>
        </div>
      </dl>

      {blockedMessage ? <p className="page-muted">{blockedMessage}</p> : null}

      {editable ? (
        <div className="panel-inline-actions">
          <Button variant="secondary" size="sm" onClick={() => setBillingOpen((open) => !open)}>
            {billingOpen ? 'Close' : 'Change Billing Customer'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setRecipientOpen((open) => !open)}>
            {recipientOpen ? 'Close' : 'Change Recipient'}
          </Button>
        </div>
      ) : null}

      {formOpen && editable ? (
        <form className="stack-form billing-recipient-form" onSubmit={(event) => void handleSubmit(event)}>
          {(billingOpen || recipientOpen) && billingOpen ? (
            <label>
              Billing Customer
              <select
                className="titan-input"
                value={billingCustomerId}
                onChange={(event) => setBillingCustomerId(event.target.value)}
              >
                <option value="">Same as service customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="form-row">
            <Button type="button" variant="ghost" size="sm" onClick={copyFromServiceCustomer}>
              Copy From Service Customer
            </Button>
          </div>

          {recipientOpen || billingOpen ? (
            <>
              <Input
                label="Recipient Name"
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
              />
              <Input
                label="Email"
                value={recipientEmail}
                onChange={(event) => setRecipientEmail(event.target.value)}
              />
              <Input
                label="Phone"
                value={recipientPhone}
                onChange={(event) => setRecipientPhone(event.target.value)}
              />
              <Input
                label="Billing Address"
                value={billingAddress}
                onChange={(event) => setBillingAddress(event.target.value)}
              />
              <Input
                label="VAT / Tax Number"
                value={vatNumber}
                onChange={(event) => setVatNumber(event.target.value)}
              />
              <Input
                label="PO Reference"
                value={poReference}
                onChange={(event) => setPoReference(event.target.value)}
              />
              <Input
                label="Attention"
                value={attentionPerson}
                onChange={(event) => setAttentionPerson(event.target.value)}
              />
            </>
          ) : null}

          {mode === 'persisted' && requireReason ? (
            <Input
              label="Reason For Change"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          ) : null}

          {error ? <p className="form-error">{error}</p> : null}
          {success ? <p className="form-success">{success}</p> : null}
          <div className="form-actions">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : mode === 'local' ? 'Apply to draft' : 'Save Recipient'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setBillingOpen(false);
                setRecipientOpen(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </Panel>
  );
}
