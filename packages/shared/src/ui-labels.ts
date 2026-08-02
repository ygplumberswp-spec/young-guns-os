/** Approved UI vocabulary — Title Case for labels, sentence case for descriptions. */
export const UI_VOCABULARY = {
  allLeads: 'All Leads',
  openLeads: 'Open Leads',
  overdueFollowUps: 'Overdue Follow-Ups',
  converted: 'Converted',
  awaitingPayment: 'Awaiting Payment',
  partiallyPaid: 'Partially Paid',
  awaitingApproval: 'Awaiting Approval',
  purchaseOrders: 'Purchase Orders',
  partsRequests: 'Parts Requests',
  priceLists: 'Price Lists',
  procureToPay: 'Procure-to-Pay',
  askAura: 'Ask AURA',
  notConfigured: 'Not Configured',
  voided: 'Voided',
  archived: 'Archived',
} as const;

const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'in',
  'nor',
  'of',
  'on',
  'or',
  'per',
  'the',
  'to',
  'vs',
  'via',
]);

/** Convert interface labels to Title Case; preserves acronyms (AURA, COC, PDF). */
export function toTitleCaseLabel(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  return trimmed
    .split(/\s+/)
    .map((word, index) => {
      if (/^[A-Z0-9/&.-]+$/.test(word) && word.length <= 6) {
        return word;
      }
      const lower = word.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** Resolve approved vocabulary or fall back to Title Case. */
export function formatUiLabel(key: keyof typeof UI_VOCABULARY | string): string {
  if (key in UI_VOCABULARY) {
    return UI_VOCABULARY[key as keyof typeof UI_VOCABULARY];
  }
  return toTitleCaseLabel(String(key));
}
