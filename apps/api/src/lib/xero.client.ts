export class XeroError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'XeroError';
  }
}

export type XeroOrganisationRecord = {
  organisationId: string;
  name: string;
  baseCurrency: string | null;
  raw: Record<string, unknown>;
};

export type XeroContactRecord = {
  contactId: string;
  name: string;
  email: string | null;
  raw: Record<string, unknown>;
};

export type XeroQuoteRecord = {
  quoteId: string;
  quoteNumber: string | null;
  status: string | null;
  raw: Record<string, unknown>;
};

export type XeroInvoiceRecord = {
  invoiceId: string;
  invoiceNumber: string | null;
  status: string | null;
  amountDue: number;
  amountPaid: number;
  total: number;
  currencyCode: string | null;
  raw: Record<string, unknown>;
};

export type XeroPaymentRecord = {
  paymentId: string;
  invoiceId: string | null;
  amount: number;
  currencyCode: string | null;
  date: string | null;
  raw: Record<string, unknown>;
};

type XeroClientOptions = {
  tenantId: string;
  getAccessToken: () => Promise<string>;
};

const API_BASE_URL = 'https://api.xero.com/api.xro/2.0';

export class XeroClient {
  private readonly tenantId: string;
  private readonly getAccessToken: () => Promise<string>;
  private cachedAccessToken: string | null = null;
  private cachedSalesAccountCode: string | null = null;

  constructor({ tenantId, getAccessToken }: XeroClientOptions) {
    this.tenantId = tenantId.trim();
    this.getAccessToken = getAccessToken;
  }

  async testConnection(): Promise<XeroOrganisationRecord> {
    return this.fetchOrganisation();
  }

  async fetchOrganisation(): Promise<XeroOrganisationRecord> {
    const payload = await this.apiRequest('GET', '/Organisation');
    const organisations = extractOrganisations(payload);

    if (organisations.length === 0) {
      throw new XeroError('API_ERROR', 'Xero returned no organisation records for this tenant');
    }

    return organisations[0]!;
  }

  async findContactByEmail(email: string): Promise<XeroContactRecord | null> {
    const normalized = email.trim().toLowerCase();

    if (!normalized) {
      return null;
    }

    const where = encodeURIComponent(`EmailAddress=="${normalized}"`);
    const payload = await this.apiRequest('GET', `/Contacts?where=${where}`);
    const contacts = extractContacts(payload);

    return contacts[0] ?? null;
  }

  async createContact(input: {
    name: string;
    email?: string | null;
    phone?: string | null;
  }): Promise<XeroContactRecord> {
    const payload = await this.apiRequest('POST', '/Contacts', {
      Contacts: [
        {
          Name: input.name,
          EmailAddress: input.email ?? undefined,
          Phones: input.phone
            ? [{ PhoneType: 'DEFAULT', PhoneNumber: input.phone }]
            : undefined,
        },
      ],
    });

    const contacts = extractContacts(payload);

    if (contacts.length === 0) {
      throw new XeroError('API_ERROR', 'Xero did not return a created contact');
    }

    return contacts[0]!;
  }

  async updateContact(
    contactId: string,
    input: {
      name: string;
      email?: string | null;
      phone?: string | null;
    },
  ): Promise<XeroContactRecord> {
    const payload = await this.apiRequest('POST', '/Contacts', {
      Contacts: [
        {
          ContactID: contactId,
          Name: input.name,
          EmailAddress: input.email ?? undefined,
          Phones: input.phone
            ? [{ PhoneType: 'DEFAULT', PhoneNumber: input.phone }]
            : undefined,
        },
      ],
    });

    const contacts = extractContacts(payload);

    if (contacts.length === 0) {
      throw new XeroError('API_ERROR', 'Xero did not return an updated contact');
    }

    return contacts[0]!;
  }

  async createQuote(input: {
    contactId: string;
    quoteNumber: string;
    title: string;
    amountCents: number;
    currency: string;
    expiryDate?: string | null;
  }): Promise<XeroQuoteRecord> {
    const accountCode = await this.getDefaultSalesAccountCode();
    const payload = await this.apiRequest('POST', '/Quotes', {
      Quotes: [
        {
          Contact: { ContactID: input.contactId },
          QuoteNumber: input.quoteNumber,
          Title: input.title,
          Date: formatXeroDate(new Date()),
          ExpiryDate: input.expiryDate ?? undefined,
          CurrencyCode: input.currency,
          LineItems: [
            {
              Description: input.title,
              Quantity: 1,
              UnitAmount: centsToAmount(input.amountCents),
              AccountCode: accountCode,
            },
          ],
          Status: 'DRAFT',
        },
      ],
    });

    const quotes = extractQuotes(payload);

    if (quotes.length === 0) {
      throw new XeroError('API_ERROR', 'Xero did not return a created quote');
    }

    return quotes[0]!;
  }

  async createInvoice(input: {
    contactId: string;
    invoiceNumber: string;
    title: string;
    amountCents: number;
    currency: string;
    dueDate?: string | null;
    issueDate?: string | null;
  }): Promise<XeroInvoiceRecord> {
    const accountCode = await this.getDefaultSalesAccountCode();
    const payload = await this.apiRequest('POST', '/Invoices', {
      Invoices: [
        {
          Type: 'ACCREC',
          Contact: { ContactID: input.contactId },
          InvoiceNumber: input.invoiceNumber,
          Reference: input.title,
          Date: input.issueDate ?? formatXeroDate(new Date()),
          DueDate: input.dueDate ?? undefined,
          CurrencyCode: input.currency,
          LineItems: [
            {
              Description: input.title,
              Quantity: 1,
              UnitAmount: centsToAmount(input.amountCents),
              AccountCode: accountCode,
            },
          ],
          Status: 'AUTHORISED',
        },
      ],
    });

    const invoices = extractInvoices(payload);

    if (invoices.length === 0) {
      throw new XeroError('API_ERROR', 'Xero did not return a created invoice');
    }

    return invoices[0]!;
  }

  async fetchInvoice(invoiceId: string): Promise<XeroInvoiceRecord> {
    const payload = await this.apiRequest('GET', `/Invoices/${invoiceId}`);
    const invoices = extractInvoices(payload);

    if (invoices.length === 0) {
      throw new XeroError('NOT_FOUND', 'Xero invoice not found');
    }

    return invoices[0]!;
  }

  async listPayments(): Promise<XeroPaymentRecord[]> {
    const payload = await this.apiRequest('GET', '/Payments');
    return extractPayments(payload);
  }

  private async getDefaultSalesAccountCode(): Promise<string> {
    if (this.cachedSalesAccountCode) {
      return this.cachedSalesAccountCode;
    }

    const payload = await this.apiRequest('GET', '/Accounts?where=Type=="REVENUE"');
    const accounts = extractAccounts(payload);
    const accountCode = accounts[0]?.code ?? '200';
    this.cachedSalesAccountCode = accountCode;
    return accountCode;
  }

  private async fetchAccessToken(): Promise<string> {
    if (this.cachedAccessToken) {
      return this.cachedAccessToken;
    }

    const accessToken = await this.getAccessToken();
    this.cachedAccessToken = accessToken;
    return accessToken;
  }

  private async apiRequest(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const accessToken = await this.fetchAccessToken();
    const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'xero-tenant-id': this.tenantId,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw new XeroError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unable to reach Xero API',
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new XeroError(
        'AUTH_FAILED',
        'Xero rejected the request. Verify the tenant ID and granted scopes.',
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new XeroError(
        'API_ERROR',
        `Xero API returned ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
      );
    }

    if (response.status === 204) {
      return {};
    }

    return response.json();
  }
}

function extractOrganisations(payload: unknown): XeroOrganisationRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const rows = Array.isArray(record.Organisations) ? record.Organisations : [];

  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }

      const organisation = row as Record<string, unknown>;
      const organisationId = pickString(organisation, ['OrganisationID', 'organisationID', 'organisationId']);
      const name = pickString(organisation, ['Name', 'name']);

      if (!organisationId || !name) {
        return null;
      }

      return {
        organisationId,
        name,
        baseCurrency: pickString(organisation, ['BaseCurrency', 'baseCurrency']),
        raw: organisation,
      } satisfies XeroOrganisationRecord;
    })
    .filter((row): row is XeroOrganisationRecord => row !== null);
}

function extractContacts(payload: unknown): XeroContactRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const rows = Array.isArray(record.Contacts) ? record.Contacts : [];

  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }

      const contact = row as Record<string, unknown>;
      const contactId = pickString(contact, ['ContactID', 'contactID', 'contactId']);
      const name = pickString(contact, ['Name', 'name']);

      if (!contactId || !name) {
        return null;
      }

      return {
        contactId,
        name,
        email: pickString(contact, ['EmailAddress', 'emailAddress']),
        raw: contact,
      } satisfies XeroContactRecord;
    })
    .filter((row): row is XeroContactRecord => row !== null);
}

function extractQuotes(payload: unknown): XeroQuoteRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const rows = Array.isArray(record.Quotes) ? record.Quotes : [];

  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }

      const quote = row as Record<string, unknown>;
      const quoteId = pickString(quote, ['QuoteID', 'quoteID', 'quoteId']);

      if (!quoteId) {
        return null;
      }

      return {
        quoteId,
        quoteNumber: pickString(quote, ['QuoteNumber', 'quoteNumber']),
        status: pickString(quote, ['Status', 'status']),
        raw: quote,
      } satisfies XeroQuoteRecord;
    })
    .filter((row): row is XeroQuoteRecord => row !== null);
}

function extractInvoices(payload: unknown): XeroInvoiceRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const rows = Array.isArray(record.Invoices) ? record.Invoices : [];

  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }

      const invoice = row as Record<string, unknown>;
      const invoiceId = pickString(invoice, ['InvoiceID', 'invoiceID', 'invoiceId']);

      if (!invoiceId) {
        return null;
      }

      return {
        invoiceId,
        invoiceNumber: pickString(invoice, ['InvoiceNumber', 'invoiceNumber']),
        status: pickString(invoice, ['Status', 'status']),
        amountDue: pickNumber(invoice, ['AmountDue', 'amountDue']) ?? 0,
        amountPaid: pickNumber(invoice, ['AmountPaid', 'amountPaid']) ?? 0,
        total: pickNumber(invoice, ['Total', 'total']) ?? 0,
        currencyCode: pickString(invoice, ['CurrencyCode', 'currencyCode']),
        raw: invoice,
      } satisfies XeroInvoiceRecord;
    })
    .filter((row): row is XeroInvoiceRecord => row !== null);
}

function extractPayments(payload: unknown): XeroPaymentRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const rows = Array.isArray(record.Payments) ? record.Payments : [];

  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }

      const payment = row as Record<string, unknown>;
      const paymentId = pickString(payment, ['PaymentID', 'paymentID', 'paymentId']);

      if (!paymentId) {
        return null;
      }

      const invoice = payment.Invoice && typeof payment.Invoice === 'object'
        ? (payment.Invoice as Record<string, unknown>)
        : null;

      return {
        paymentId,
        invoiceId: invoice ? pickString(invoice, ['InvoiceID', 'invoiceID', 'invoiceId']) : null,
        amount: pickNumber(payment, ['Amount', 'amount']) ?? 0,
        currencyCode: pickString(payment, ['CurrencyCode', 'currencyCode']),
        date: pickString(payment, ['Date', 'date']),
        raw: payment,
      } satisfies XeroPaymentRecord;
    })
    .filter((row): row is XeroPaymentRecord => row !== null);
}

function extractAccounts(payload: unknown): Array<{ code: string }> {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const rows = Array.isArray(record.Accounts) ? record.Accounts : [];

  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }

      const account = row as Record<string, unknown>;
      const code = pickString(account, ['Code', 'code']);

      return code ? { code } : null;
    })
    .filter((row): row is { code: string } => row !== null);
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseFloat(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function centsToAmount(amountCents: number): number {
  return Math.round(amountCents) / 100;
}

function formatXeroDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function mapXeroInvoiceStatus(input: {
  xeroStatus: string | null;
  amountDue: number;
  amountPaid: number;
  total: number;
}): 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled' {
  const status = (input.xeroStatus ?? '').toUpperCase();

  if (status === 'VOIDED' || status === 'DELETED') {
    return 'cancelled';
  }

  if (status === 'DRAFT') {
    return 'draft';
  }

  if (input.amountDue <= 0 && input.amountPaid > 0) {
    return 'paid';
  }

  if (input.amountPaid > 0 && input.amountDue > 0) {
    return 'partial';
  }

  return 'sent';
}

export function amountToCents(amount: number): number {
  return Math.round(amount * 100);
}
