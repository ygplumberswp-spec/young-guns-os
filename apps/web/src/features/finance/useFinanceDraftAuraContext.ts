import { useEffect } from 'react';
import { useOptionalContextualAura } from '../aura/contextual-aura-context';
import { resolveFinanceDraftAuraSuggestions } from '../aura/finance-draft-aura-suggestions';

type FinanceDraftAuraInput = {
  pageTitle: string;
  recordType: 'quote' | 'invoice';
  recordId?: string;
  serviceCustomerId: string;
  serviceCustomerName: string;
  billingCustomerName: string;
  recipientName: string | null;
  jobId?: string | null;
  propertyId?: string | null;
};

/** Registers finance draft billing context for contextual AURA on quote/invoice forms. */
export function useFinanceDraftAuraContext(input: FinanceDraftAuraInput | null) {
  const aura = useOptionalContextualAura();

  useEffect(() => {
    if (!aura || !input) return;

    aura.setPageContext({
      pageTitle: input.pageTitle,
      recordType: input.recordType,
      recordId: input.recordId,
      customerId: input.serviceCustomerId,
      jobId: input.jobId ?? undefined,
      quoteId: input.recordType === 'quote' ? input.recordId : undefined,
      invoiceId: input.recordType === 'invoice' ? input.recordId : undefined,
      financeDraft: {
        serviceCustomerName: input.serviceCustomerName,
        billingCustomerName: input.billingCustomerName,
        recipientName: input.recipientName,
        propertyId: input.propertyId ?? null,
      },
      auraSuggestions: resolveFinanceDraftAuraSuggestions(input.recordType),
    });
  }, [aura, input]);
}
