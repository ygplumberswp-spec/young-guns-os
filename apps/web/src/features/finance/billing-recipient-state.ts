import type { BillingRecipientSnapshot, UpdateBillingRecipientRequest } from '@titan/shared';

export type BillingRecipientFormValues = Pick<
  BillingRecipientSnapshot,
  | 'billingCustomerId'
  | 'recipientName'
  | 'recipientEmail'
  | 'recipientPhone'
  | 'billingAddress'
  | 'vatNumber'
  | 'poReference'
  | 'attentionPerson'
>;

export function defaultBillingRecipientValues(): BillingRecipientFormValues {
  return {
    billingCustomerId: null,
    recipientName: null,
    recipientEmail: null,
    recipientPhone: null,
    billingAddress: null,
    vatNumber: null,
    poReference: null,
    attentionPerson: null,
  };
}

export function billingValuesFromRecord(
  record: Partial<BillingRecipientSnapshot>,
): BillingRecipientFormValues {
  return {
    billingCustomerId: record.billingCustomerId ?? null,
    recipientName: record.recipientName ?? null,
    recipientEmail: record.recipientEmail ?? null,
    recipientPhone: record.recipientPhone ?? null,
    billingAddress: record.billingAddress ?? null,
    vatNumber: record.vatNumber ?? null,
    poReference: record.poReference ?? null,
    attentionPerson: record.attentionPerson ?? null,
  };
}

export function resolveBillingCustomerName(
  billingCustomerId: string | null,
  customers: Array<{ id: string; name: string }>,
  fallback: string | null,
): string {
  if (!billingCustomerId) return fallback ?? 'Same as service customer';
  return customers.find((customer) => customer.id === billingCustomerId)?.name ?? fallback ?? 'Unknown';
}

export function hasCustomBillingRecipient(
  values: BillingRecipientFormValues,
  serviceCustomerId: string,
): boolean {
  return (
    (values.billingCustomerId != null && values.billingCustomerId !== serviceCustomerId) ||
    Boolean(values.recipientName?.trim()) ||
    Boolean(values.recipientEmail?.trim()) ||
    Boolean(values.recipientPhone?.trim()) ||
    Boolean(values.billingAddress?.trim()) ||
    Boolean(values.vatNumber?.trim()) ||
    Boolean(values.poReference?.trim()) ||
    Boolean(values.attentionPerson?.trim())
  );
}

export function toBillingRecipientPatch(
  values: BillingRecipientFormValues,
  reason: string,
): UpdateBillingRecipientRequest {
  return {
    billingCustomerId: values.billingCustomerId,
    recipientName: values.recipientName,
    recipientEmail: values.recipientEmail,
    recipientPhone: values.recipientPhone,
    billingAddress: values.billingAddress,
    vatNumber: values.vatNumber,
    poReference: values.poReference,
    attentionPerson: values.attentionPerson,
    reason,
  };
}
