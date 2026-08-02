import type { AuraSuggestionChip } from './aura-page-suggestions';

const QUOTE_DRAFT_SUGGESTIONS: AuraSuggestionChip[] = [
  {
    id: 'quote-landlord',
    label: 'Bill landlord',
    prompt: 'Invoice this job to the landlord instead. Show the proposed billing recipient change and ask me to approve before applying.',
  },
  {
    id: 'quote-recipient',
    label: 'Change recipient',
    prompt: 'Change the quote recipient to a property management company. Show the proposed change and require my approval before applying.',
  },
  {
    id: 'quote-owner',
    label: 'Send to owner',
    prompt: 'Send the quote to the owner, not the tenant. Propose the recipient change and wait for my confirmation.',
  },
];

const INVOICE_DRAFT_SUGGESTIONS: AuraSuggestionChip[] = [
  {
    id: 'invoice-landlord',
    label: 'Bill landlord',
    prompt: 'Invoice this job to the landlord instead. Show the proposed billing recipient change and ask me to approve before applying.',
  },
  {
    id: 'invoice-recipient',
    label: 'Change recipient',
    prompt: 'Change the invoice recipient to ABC Property Management. Show the proposed change and require my approval before applying.',
  },
  {
    id: 'invoice-owner',
    label: 'Send to owner',
    prompt: 'Send the invoice to the property owner, not the tenant. Propose the recipient change and wait for my confirmation.',
  },
];

export function resolveFinanceDraftAuraSuggestions(
  recordType: 'quote' | 'invoice',
): AuraSuggestionChip[] {
  return recordType === 'quote' ? QUOTE_DRAFT_SUGGESTIONS : INVOICE_DRAFT_SUGGESTIONS;
}
