/**
 * Confident email → CRM entity matching for Business Gmail indexing.
 * Only returns a link when exactly one high-confidence match exists.
 */

export type GmailEntityLinkCandidate = {
  linkTargetType: 'customer' | 'lead' | 'job' | 'quote' | 'invoice';
  linkTargetId: string;
  participantKind: 'customer' | 'unknown';
  confidence: 'exact_email';
};

export type GmailEntityLinkLookups = {
  customersByEmail: Map<string, string[]>;
  leadsByEmail: Map<string, string[]>;
  jobsByCustomerId: Map<string, string[]>;
  quotesByCustomerId: Map<string, string[]>;
  invoicesByEmail: Map<string, string[]>;
  invoicesByCustomerId: Map<string, string[]>;
};

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (!match) return null;
  return match[0]!.trim().toLowerCase();
}

export function extractEmailsFromHeader(header: string | null | undefined): string[] {
  if (!header) return [];
  const found = header.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const unique = new Set(found.map((e) => e.trim().toLowerCase()));
  return [...unique];
}

/**
 * Prefer: unique customer email → unique lead email → unique invoice billing email.
 * Jobs/quotes are linked only when the matched customer has exactly one open/related row
 * (still unique — never invent multi-match links).
 */
export function resolveConfidentGmailEntityLink(
  participantEmails: string[],
  lookups: GmailEntityLinkLookups,
): GmailEntityLinkCandidate | null {
  const emails = participantEmails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (emails.length === 0) return null;

  const customerIds = uniqueIdsForEmails(emails, lookups.customersByEmail);
  if (customerIds.length === 1) {
    const customerId = customerIds[0]!;
    const jobs = lookups.jobsByCustomerId.get(customerId) ?? [];
    if (jobs.length === 1) {
      return {
        linkTargetType: 'job',
        linkTargetId: jobs[0]!,
        participantKind: 'customer',
        confidence: 'exact_email',
      };
    }
    const quotes = lookups.quotesByCustomerId.get(customerId) ?? [];
    if (quotes.length === 1 && jobs.length === 0) {
      return {
        linkTargetType: 'quote',
        linkTargetId: quotes[0]!,
        participantKind: 'customer',
        confidence: 'exact_email',
      };
    }
    const invoices = lookups.invoicesByCustomerId.get(customerId) ?? [];
    if (invoices.length === 1 && jobs.length === 0 && quotes.length === 0) {
      return {
        linkTargetType: 'invoice',
        linkTargetId: invoices[0]!,
        participantKind: 'customer',
        confidence: 'exact_email',
      };
    }
    return {
      linkTargetType: 'customer',
      linkTargetId: customerId,
      participantKind: 'customer',
      confidence: 'exact_email',
    };
  }

  const leadIds = uniqueIdsForEmails(emails, lookups.leadsByEmail);
  if (leadIds.length === 1 && customerIds.length === 0) {
    return {
      linkTargetType: 'lead',
      linkTargetId: leadIds[0]!,
      participantKind: 'customer',
      confidence: 'exact_email',
    };
  }

  const invoiceIds = uniqueIdsForEmails(emails, lookups.invoicesByEmail);
  if (invoiceIds.length === 1 && customerIds.length === 0 && leadIds.length === 0) {
    return {
      linkTargetType: 'invoice',
      linkTargetId: invoiceIds[0]!,
      participantKind: 'customer',
      confidence: 'exact_email',
    };
  }

  return null;
}

function uniqueIdsForEmails(emails: string[], index: Map<string, string[]>): string[] {
  const ids = new Set<string>();
  for (const email of emails) {
    for (const id of index.get(email) ?? []) {
      ids.add(id);
    }
  }
  return [...ids];
}
