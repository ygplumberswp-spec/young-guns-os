export class XeroError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    /** Populated for RATE_LIMIT so callers can schedule the retry Xero actually asked for. */
    public readonly retryAfterMs?: number,
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
  phone: string | null;
  raw: Record<string, unknown>;
};

export type XeroQuoteRecord = {
  quoteId: string;
  quoteNumber: string | null;
  status: string | null;
  contactId: string | null;
  contactName: string | null;
  subtotal: number;
  totalTax: number;
  total: number;
  currencyCode: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  title: string | null;
  raw: Record<string, unknown>;
};

export type XeroInvoiceRecord = {
  invoiceId: string;
  invoiceNumber: string | null;
  contactId: string | null;
  contactName: string | null;
  status: string | null;
  amountDue: number;
  amountPaid: number;
  subtotal: number;
  totalTax: number;
  total: number;
  currencyCode: string | null;
  issueDate: string | null;
  dueDate: string | null;
  reference: string | null;
  raw: Record<string, unknown>;
};

export type XeroBankTransactionRecord = {
  bankTransactionId: string;
  amount: number;
  currencyCode: string | null;
  date: string | null;
  reference: string | null;
  description: string | null;
  type: string | null;
  status: string | null;
  bankAccountCode: string | null;
  contactId: string | null;
  contactName: string | null;
  isReconciled: boolean;
  raw: Record<string, unknown>;
};

export type XeroPaymentRecord = {
  paymentId: string;
  invoiceId: string | null;
  amount: number;
  currencyCode: string | null;
  date: string | null;
  reference: string | null;
  status: string | null;
  raw: Record<string, unknown>;
};

export type XeroCreditNoteRecord = {
  creditNoteId: string;
  creditNoteNumber: string | null;
  type: string | null;
  status: string | null;
  contactId: string | null;
  contactName: string | null;
  subtotal: number;
  totalTax: number;
  total: number;
  remainingCredit: number;
  currencyCode: string | null;
  date: string | null;
  reference: string | null;
  allocations: Array<{ invoiceId: string | null; amount: number; date: string | null }>;
  raw: Record<string, unknown>;
};

export type XeroAccountRecord = {
  accountId: string;
  code: string | null;
  name: string;
  type: string | null;
  taxType: string | null;
  accountClass: string | null;
  status: string | null;
  description: string | null;
  reportingCode: string | null;
  raw: Record<string, unknown>;
};

export type XeroTrackingCategoryRecord = {
  trackingCategoryId: string;
  name: string;
  status: string | null;
  options: Array<{ trackingOptionId: string; name: string; status: string | null }>;
  raw: Record<string, unknown>;
};

export type XeroAttachmentRecord = {
  attachmentId: string;
  fileName: string;
  mimeType: string | null;
  contentLength: number | null;
  url: string | null;
  includeOnline: boolean;
  raw: Record<string, unknown>;
};

/** Shared options for list endpoints. `modifiedSince` drives incremental (gap-closing) syncs. */
export type XeroListOptions = {
  /** RFC 1123 / ISO timestamp sent as If-Modified-Since. Omit for a full historical pull. */
  modifiedSince?: string | null;
};

/** Captured provider headers from a single no-retry Organisation probe. */
export type XeroOrganisationProbeHeaders = {
  minLimitRemaining: number | null;
  dayLimitRemaining: number | null;
  appMinLimitRemaining: number | null;
  rateLimitProblem: string | null;
  retryAfter: string | null;
  correlationId: string | null;
  responseDate: string | null;
};

/** Result of exactly one GET /Organisation HTTP call — never retries on 429 or 401. */
export type XeroOrganisationProbeResult = {
  providerCallCount: 1;
  httpStatus: number;
  requestEndpoint: 'GET /Organisation';
  headers: XeroOrganisationProbeHeaders;
  organisation: XeroOrganisationRecord | null;
};

type XeroClientOptions = {
  tenantId: string;
  getAccessToken: () => Promise<string>;
  /** Called once before an auth retry — should force-refresh OAuth tokens when Xero returns 401. */
  onAuthRetry?: () => Promise<void>;
  /** Invoked for every Xero HTTP response so tenant rate-budget headers can be persisted. */
  onResponse?: (response: Response) => void | Promise<void>;
  /** Per-request timeout for Xero HTTP calls. Default 20s. */
  requestTimeoutMs?: number;
};

const API_BASE_URL = 'https://api.xero.com/api.xro/2.0';
export const XERO_REQUEST_TIMEOUT_MS = 20_000;
export const XERO_PAGE_SIZE = 100;
export const XERO_RATE_LIMIT_MAX_RETRIES = 5;
/** At most one rate-limit retry per provider request; delay honours Retry-After up to 120s. */
export const XERO_RATE_LIMIT_READ_MAX_RETRIES = 1;
export const XERO_RATE_LIMIT_READ_MAX_DELAY_MS = 120_000;
export const XERO_RATE_LIMIT_RETRY_BUDGET_MS = 30_000;
export const XERO_RATE_LIMIT_BASE_DELAY_MS = 2_000;
/**
 * Absolute page ceiling used only to detect a non-terminating pager. Reaching it raises
 * PAGINATION_RUNAWAY rather than returning a truncated list — history is never silently capped.
 */
export const XERO_PAGE_RUNAWAY_LIMIT = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Xero signals its minute limit with Retry-After (seconds). Honour it when present, otherwise
 * fall back to exponential backoff. Capped so a bad header cannot stall a run indefinitely.
 */
export function resolveRateLimitDelayMs(
  retryAfterHeader: string | null | undefined,
  attempt: number,
): number {
  const trimmed = (retryAfterHeader ?? '').trim();

  if (trimmed) {
    const parsedSeconds = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
      return Math.min(parsedSeconds * 1_000, 5 * 60_000);
    }

    const retryAt = Date.parse(trimmed);
    if (Number.isFinite(retryAt)) {
      return Math.min(Math.max(retryAt - Date.now(), 0), 5 * 60_000);
    }
  }

  return XERO_RATE_LIMIT_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
}

/** Xero list endpoints return a full page while more records remain. */
export function hasMoreXeroPages(batchSize: number): boolean {
  return batchSize >= XERO_PAGE_SIZE;
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  setTimeout(
    () => controller.abort(new DOMException('Xero request timed out', 'TimeoutError')),
    timeoutMs,
  );
  return controller.signal;
}

export { timeoutSignal };

export class XeroClient {
  private readonly tenantId: string;
  private readonly getAccessToken: () => Promise<string>;
  private readonly onAuthRetry?: () => Promise<void>;
  private readonly onResponse?: (response: Response) => void | Promise<void>;
  private readonly requestTimeoutMs: number;
  private cachedAccessToken: string | null = null;
  private cachedSalesAccountCode: string | null = null;
  private cachedBankAccountCode: string | null = null;

  constructor({ tenantId, getAccessToken, onAuthRetry, onResponse, requestTimeoutMs }: XeroClientOptions) {
    this.tenantId = tenantId.trim();
    this.getAccessToken = getAccessToken;
    this.onAuthRetry = onAuthRetry;
    this.onResponse = onResponse;
    this.requestTimeoutMs = requestTimeoutMs ?? XERO_REQUEST_TIMEOUT_MS;
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

  /**
   * Controlled rate-budget probe — issues exactly one GET /Organisation request.
   * Does not use apiRequest (no 429 retry loop) and does not auth-retry on 401.
   */
  async probeOrganisationOnce(): Promise<XeroOrganisationProbeResult> {
    const response = await this.organisationProbeHttpOnce();
    const headers = parseOrganisationProbeHeaders(response.headers);

    let organisation: XeroOrganisationRecord | null = null;
    if (response.ok && response.status !== 204) {
      const payload = await response.json();
      organisation = extractOrganisations(payload)[0] ?? null;
    }

    return {
      providerCallCount: 1,
      httpStatus: response.status,
      requestEndpoint: 'GET /Organisation',
      headers,
      organisation,
    };
  }

  /** Single HTTP round-trip to GET /Organisation — no auth retry, no rate-limit retry. */
  private async organisationProbeHttpOnce(): Promise<Response> {
    const accessToken = await this.fetchAccessToken();
    const url = `${API_BASE_URL}/Organisation`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'xero-tenant-id': this.tenantId,
        },
        signal: timeoutSignal(this.requestTimeoutMs),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' ||
          error.name === 'AbortError' ||
          /timed out/i.test(error.message))
      ) {
        throw new XeroError(
          'TIMEOUT',
          `Xero request timed out after ${this.requestTimeoutMs}ms (GET /Organisation)`,
        );
      }

      throw new XeroError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unable to reach Xero API',
      );
    }

    if (this.onResponse) {
      await this.onResponse(response);
    }

    return response;
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
          Phones: input.phone ? [{ PhoneType: 'DEFAULT', PhoneNumber: input.phone }] : undefined,
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
          Phones: input.phone ? [{ PhoneType: 'DEFAULT', PhoneNumber: input.phone }] : undefined,
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

  /**
   * Create ACCREC invoice in Xero as DRAFT.
   * Do NOT send TITAN-invented InvoiceNumber — Xero assigns the official number.
   * `reference` should be the TITAN job number when available.
   */
  async createInvoice(input: {
    contactId: string;
    title: string;
    amountCents: number;
    currency: string;
    dueDate?: string | null;
    issueDate?: string | null;
    reference?: string | null;
    /** @deprecated TITAN must not invent Xero invoice numbers — ignored when present. */
    invoiceNumber?: string | null;
    status?: 'DRAFT' | 'AUTHORISED';
  }): Promise<XeroInvoiceRecord> {
    const accountCode = await this.getDefaultSalesAccountCode();
    const payload = await this.apiRequest('POST', '/Invoices', {
      Invoices: [
        {
          Type: 'ACCREC',
          Contact: { ContactID: input.contactId },
          // Intentionally omit InvoiceNumber so Xero assigns the official number.
          Reference: input.reference?.trim() || input.title,
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
          Status: input.status ?? 'DRAFT',
        },
      ],
    });

    const invoices = extractInvoices(payload);

    if (invoices.length === 0) {
      throw new XeroError('API_ERROR', 'Xero did not return a created invoice');
    }

    return invoices[0]!;
  }

  async createPayment(input: {
    invoiceId: string;
    amountCents: number;
    date?: string | null;
    reference?: string | null;
  }): Promise<XeroPaymentRecord> {
    const accountCode = await this.getDefaultBankAccountCode();
    const payload = await this.apiRequest('POST', '/Payments', {
      Payments: [
        {
          Invoice: { InvoiceID: input.invoiceId },
          Account: { Code: accountCode },
          Amount: centsToAmount(input.amountCents),
          Date: input.date ?? formatXeroDate(new Date()),
          Reference: input.reference ?? undefined,
        },
      ],
    });

    const payments = extractPayments(payload);

    if (payments.length === 0) {
      throw new XeroError('API_ERROR', 'Xero did not return a created payment');
    }

    return payments[0]!;
  }

  async fetchInvoice(invoiceId: string): Promise<XeroInvoiceRecord> {
    const payload = await this.apiRequest('GET', `/Invoices/${invoiceId}`);
    const invoices = extractInvoices(payload);

    if (invoices.length === 0) {
      throw new XeroError('NOT_FOUND', 'Xero invoice not found');
    }

    return invoices[0]!;
  }

  async fetchPayment(paymentId: string): Promise<XeroPaymentRecord> {
    const payload = await this.apiRequest('GET', `/Payments/${paymentId}`);
    const payments = extractPayments(payload);

    if (payments.length === 0) {
      throw new XeroError('NOT_FOUND', 'Xero payment not found');
    }

    return payments[0]!;
  }

  async fetchQuote(quoteId: string): Promise<XeroQuoteRecord> {
    const payload = await this.apiRequest('GET', `/Quotes/${quoteId}`);
    const quotes = extractQuotes(payload);

    if (quotes.length === 0) {
      throw new XeroError('NOT_FOUND', 'Xero quote not found');
    }

    return quotes[0]!;
  }

  async fetchContact(contactId: string): Promise<XeroContactRecord> {
    const payload = await this.apiRequest('GET', `/Contacts/${contactId}`);
    const contacts = extractContacts(payload);

    if (contacts.length === 0) {
      throw new XeroError('NOT_FOUND', 'Xero contact not found');
    }

    return contacts[0]!;
  }

  /**
   * Page an entity to exhaustion. There is no record or page cap: the loop ends only when Xero
   * returns a short/empty page. A runaway pager raises instead of returning partial history.
   */
  private async listAllPages<T>(
    entity: string,
    fetchPage: (page: number) => Promise<T[]>,
  ): Promise<T[]> {
    const rows: T[] = [];
    let page = 1;

    while (page <= XERO_PAGE_RUNAWAY_LIMIT) {
      const batch = await fetchPage(page);
      rows.push(...batch);

      if (!hasMoreXeroPages(batch.length)) {
        return rows;
      }

      page += 1;
    }

    throw new XeroError(
      'PAGINATION_RUNAWAY',
      `Xero ${entity} pagination exceeded ${XERO_PAGE_RUNAWAY_LIMIT} pages without terminating — refusing to return truncated history`,
    );
  }

  async listPayments(options?: XeroListOptions): Promise<XeroPaymentRecord[]> {
    return this.listAllPages('Payments', (page) => this.listPaymentsPage(page, options));
  }

  async listContacts(options?: XeroListOptions): Promise<XeroContactRecord[]> {
    return this.listAllPages('Contacts', (page) => this.listContactsPage(page, options));
  }

  /** Archived contacts are part of history — Xero omits them unless includeArchived is set. */
  async listContactsPage(page: number, options?: XeroListOptions): Promise<XeroContactRecord[]> {
    const query = buildQuery({ page, includeArchived: true });
    const payload = await this.apiRequest('GET', `/Contacts${query}`, undefined, options?.modifiedSince);
    return extractContacts(payload);
  }

  async listQuotesPage(page: number, options?: XeroListOptions): Promise<XeroQuoteRecord[]> {
    const query = buildQuery({ page });
    const payload = await this.apiRequest('GET', `/Quotes${query}`, undefined, options?.modifiedSince);
    return extractQuotes(payload);
  }

  async listQuotes(options?: XeroListOptions): Promise<XeroQuoteRecord[]> {
    return this.listAllPages('Quotes', (page) => this.listQuotesPage(page, options));
  }

  async listInvoices(options?: XeroListOptions): Promise<XeroInvoiceRecord[]> {
    return this.listAllPages('Invoices', (page) => this.listInvoicesPage(page, options));
  }

  /** Sales invoices (ACCREC). Voided and deleted invoices are retained, not filtered out. */
  async listInvoicesPage(page: number, options?: XeroListOptions): Promise<XeroInvoiceRecord[]> {
    return this.listInvoicesPageByType('ACCREC', page, options);
  }

  /** Supplier bills (ACCPAY) — the expense side of the ledger. */
  async listBillsPage(page: number, options?: XeroListOptions): Promise<XeroInvoiceRecord[]> {
    return this.listInvoicesPageByType('ACCPAY', page, options);
  }

  async listBills(options?: XeroListOptions): Promise<XeroInvoiceRecord[]> {
    return this.listAllPages('Bills', (page) => this.listBillsPage(page, options));
  }

  private async listInvoicesPageByType(
    type: 'ACCREC' | 'ACCPAY',
    page: number,
    options?: XeroListOptions,
  ): Promise<XeroInvoiceRecord[]> {
    const query = buildQuery({ where: `Type=="${type}"`, page });
    const payload = await this.apiRequest(
      'GET',
      `/Invoices${query}`,
      undefined,
      options?.modifiedSince,
    );
    return extractInvoices(payload);
  }

  /** Full invoice/bill detail including line items — list pages omit them for ACCPAY/ACCREC alike. */
  async fetchInvoiceDetail(invoiceId: string): Promise<XeroInvoiceRecord | null> {
    const payload = await this.apiRequest('GET', `/Invoices/${invoiceId}`);
    return extractInvoices(payload)[0] ?? null;
  }

  async listPaymentsPage(page: number, options?: XeroListOptions): Promise<XeroPaymentRecord[]> {
    const query = buildQuery({ page });
    const payload = await this.apiRequest('GET', `/Payments${query}`, undefined, options?.modifiedSince);
    return extractPayments(payload);
  }

  async listBankTransactionsPage(
    page: number,
    options?: XeroListOptions,
  ): Promise<XeroBankTransactionRecord[]> {
    const query = buildQuery({ page });
    const payload = await this.apiRequest(
      'GET',
      `/BankTransactions${query}`,
      undefined,
      options?.modifiedSince,
    );
    return extractBankTransactions(payload);
  }

  async listBankTransactions(options?: XeroListOptions): Promise<XeroBankTransactionRecord[]> {
    return this.listAllPages('BankTransactions', (page) =>
      this.listBankTransactionsPage(page, options),
    );
  }

  async listCreditNotesPage(page: number, options?: XeroListOptions): Promise<XeroCreditNoteRecord[]> {
    const query = buildQuery({ page });
    const payload = await this.apiRequest(
      'GET',
      `/CreditNotes${query}`,
      undefined,
      options?.modifiedSince,
    );
    return extractCreditNotes(payload);
  }

  async listCreditNotes(options?: XeroListOptions): Promise<XeroCreditNoteRecord[]> {
    return this.listAllPages('CreditNotes', (page) => this.listCreditNotesPage(page, options));
  }

  /** Chart of accounts. Xero does not page this endpoint — it returns the full set. */
  async listAccounts(): Promise<XeroAccountRecord[]> {
    const payload = await this.apiRequest('GET', '/Accounts');
    return extractAccountRecords(payload);
  }

  /** Tracking categories including their options. Not paged by Xero. */
  async listTrackingCategories(): Promise<XeroTrackingCategoryRecord[]> {
    const payload = await this.apiRequest('GET', '/TrackingCategories?includeArchived=true');
    return extractTrackingCategories(payload);
  }

  /**
   * Attachment metadata for one parent record. Only metadata is imported — file content stays in
   * Xero and is fetched on demand through the access-controlled document path.
   */
  async listAttachments(
    endpoint: 'Invoices' | 'BankTransactions' | 'CreditNotes' | 'Contacts',
    parentXeroId: string,
  ): Promise<XeroAttachmentRecord[]> {
    const payload = await this.apiRequest('GET', `/${endpoint}/${parentXeroId}/Attachments`);
    return extractAttachments(payload);
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

  private async getDefaultBankAccountCode(): Promise<string> {
    if (this.cachedBankAccountCode) {
      return this.cachedBankAccountCode;
    }

    const payload = await this.apiRequest('GET', '/Accounts?where=Type=="BANK"');
    const accounts = extractAccounts(payload);
    const accountCode = accounts[0]?.code;
    if (!accountCode) {
      throw new XeroError(
        'CONFIG_ERROR',
        'No Xero BANK account found — configure a bank account before payment push',
      );
    }
    this.cachedBankAccountCode = accountCode;
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

  private async apiRequest(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    modifiedSince?: string | null,
  ): Promise<unknown> {
    let attempt = 0;
    let rateLimitRetries = 0;

    while (attempt <= XERO_RATE_LIMIT_MAX_RETRIES) {
      attempt += 1;

      try {
        return await this.apiRequestOnce(method, path, body, modifiedSince, attempt === 1);
      } catch (error) {
        if (error instanceof XeroError && error.code === 'RATE_LIMIT') {
          if (rateLimitRetries >= XERO_RATE_LIMIT_READ_MAX_RETRIES) {
            throw new XeroError(
              'RATE_LIMIT',
              'Xero rate limit — one controlled retry already attempted',
              error.retryAfterMs,
            );
          }

          const requestedDelayMs =
            error.retryAfterMs ?? resolveRateLimitDelayMs(null, rateLimitRetries + 1);
          const delayMs = Math.min(requestedDelayMs, XERO_RATE_LIMIT_READ_MAX_DELAY_MS);

          // Honour short Retry-After inline; longer waits exceed Railway/proxy budgets — fail fast.
          if (delayMs > XERO_RATE_LIMIT_RETRY_BUDGET_MS) {
            throw new XeroError(
              'RATE_LIMIT',
              `Xero rate limit — retry after ${Math.ceil(delayMs / 1000)}s (inline wait exceeds ${XERO_RATE_LIMIT_RETRY_BUDGET_MS / 1000}s budget)`,
              delayMs,
            );
          }

          rateLimitRetries += 1;
          await sleep(delayMs);
          continue;
        }

        throw error;
      }
    }

    throw new XeroError('RATE_LIMIT', 'Xero rate limit retries exhausted');
  }

  private async apiRequestOnce(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    modifiedSince?: string | null,
    allowAuthRetry = true,
  ): Promise<unknown> {
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
          ...(modifiedSince ? { 'If-Modified-Since': modifiedSince } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: timeoutSignal(this.requestTimeoutMs),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' ||
          error.name === 'AbortError' ||
          /timed out/i.test(error.message))
      ) {
        throw new XeroError(
          'TIMEOUT',
          `Xero request timed out after ${this.requestTimeoutMs}ms (${method} ${path.split('?')[0]})`,
        );
      }

      throw new XeroError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unable to reach Xero API',
      );
    }

    if (this.onResponse) {
      await this.onResponse(response);
    }

    if (response.status === 401) {
      if (allowAuthRetry) {
        this.cachedAccessToken = null;
        if (this.onAuthRetry) {
          await this.onAuthRetry();
        }
        return this.apiRequestOnce(method, path, body, modifiedSince, false);
      }

      throw new XeroError(
        'AUTH_FAILED',
        'Xero rejected the request after one auth retry. Verify the tenant ID and granted scopes.',
      );
    }

    if (response.status === 403) {
      throw new XeroError(
        'AUTH_FAILED',
        'Xero rejected the request. Verify the tenant ID and granted scopes.',
      );
    }

    if (response.status === 429) {
      const retryAfterMs = resolveRateLimitDelayMs(response.headers.get('Retry-After'), 1);
      throw new XeroError(
        'RATE_LIMIT',
        `Xero rate limit reached. Retrying in ${Math.ceil(retryAfterMs / 1000)}s.`,
        retryAfterMs,
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

function parseOrganisationProbeHeaders(headers: Headers): XeroOrganisationProbeHeaders {
  const readInt = (name: string): number | null => {
    const raw = headers.get(name);
    if (!raw) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  };

  return {
    minLimitRemaining: readInt('X-MinLimit-Remaining'),
    dayLimitRemaining: readInt('X-DayLimit-Remaining'),
    appMinLimitRemaining: readInt('X-AppMinLimit-Remaining'),
    rateLimitProblem: headers.get('X-Rate-Limit-Problem'),
    retryAfter: headers.get('Retry-After'),
    correlationId: headers.get('Xero-Correlation-Id'),
    responseDate: headers.get('Date'),
  };
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
      const organisationId = pickString(organisation, [
        'OrganisationID',
        'organisationID',
        'organisationId',
      ]);
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
        phone: extractContactPhone(contact),
        raw: contact,
      } satisfies XeroContactRecord;
    })
    .filter((row): row is XeroContactRecord => row !== null);
}

function extractContactPhone(contact: Record<string, unknown>): string | null {
  const phones = Array.isArray(contact.Phones) ? contact.Phones : [];
  for (const phone of phones) {
    if (!phone || typeof phone !== 'object') continue;
    const row = phone as Record<string, unknown>;
    const number = pickString(row, ['PhoneNumber', 'phoneNumber']);
    if (number) return number;
  }
  return null;
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

      const contact =
        quote.Contact && typeof quote.Contact === 'object'
          ? (quote.Contact as Record<string, unknown>)
          : null;

      return {
        quoteId,
        quoteNumber: pickString(quote, ['QuoteNumber', 'quoteNumber']),
        status: pickString(quote, ['Status', 'status']),
        contactId: contact ? pickString(contact, ['ContactID', 'contactID', 'contactId']) : null,
        contactName: contact ? pickString(contact, ['Name', 'name']) : null,
        subtotal: pickNumber(quote, ['SubTotal', 'subTotal', 'subtotal']) ?? 0,
        totalTax: pickNumber(quote, ['TotalTax', 'totalTax']) ?? 0,
        total: pickNumber(quote, ['Total', 'total']) ?? 0,
        currencyCode: pickString(quote, ['CurrencyCode', 'currencyCode']),
        issueDate: pickDate(quote, ['Date', 'date']),
        expiryDate: pickDate(quote, ['ExpiryDate', 'expiryDate']),
        title: pickString(quote, ['Title', 'title']),
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

      const contact =
        invoice.Contact && typeof invoice.Contact === 'object'
          ? (invoice.Contact as Record<string, unknown>)
          : null;

      return {
        invoiceId,
        invoiceNumber: pickString(invoice, ['InvoiceNumber', 'invoiceNumber']),
        contactId: contact ? pickString(contact, ['ContactID', 'contactID', 'contactId']) : null,
        contactName: contact ? pickString(contact, ['Name', 'name']) : null,
        status: pickString(invoice, ['Status', 'status']),
        amountDue: pickNumber(invoice, ['AmountDue', 'amountDue']) ?? 0,
        amountPaid: pickNumber(invoice, ['AmountPaid', 'amountPaid']) ?? 0,
        subtotal: pickNumber(invoice, ['SubTotal', 'subTotal', 'subtotal']) ?? 0,
        totalTax: pickNumber(invoice, ['TotalTax', 'totalTax']) ?? 0,
        total: pickNumber(invoice, ['Total', 'total']) ?? 0,
        currencyCode: pickString(invoice, ['CurrencyCode', 'currencyCode']),
        issueDate: pickDate(invoice, ['Date', 'date']),
        dueDate: pickDate(invoice, ['DueDate', 'dueDate']),
        reference: pickString(invoice, ['Reference', 'reference']),
        raw: invoice,
      } satisfies XeroInvoiceRecord;
    })
    .filter((row): row is XeroInvoiceRecord => row !== null);
}

function extractBankTransactions(payload: unknown): XeroBankTransactionRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const rows = Array.isArray(record.BankTransactions) ? record.BankTransactions : [];

  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }

      const transaction = row as Record<string, unknown>;
      const bankTransactionId = pickString(transaction, [
        'BankTransactionID',
        'bankTransactionID',
        'bankTransactionId',
      ]);

      if (!bankTransactionId) {
        return null;
      }

      const contact =
        transaction.Contact && typeof transaction.Contact === 'object'
          ? (transaction.Contact as Record<string, unknown>)
          : null;
      const bankAccount =
        transaction.BankAccount && typeof transaction.BankAccount === 'object'
          ? (transaction.BankAccount as Record<string, unknown>)
          : null;
      const lineItems = Array.isArray(transaction.LineItems) ? transaction.LineItems : [];
      const firstLine =
        lineItems[0] && typeof lineItems[0] === 'object'
          ? (lineItems[0] as Record<string, unknown>)
          : null;

      return {
        bankTransactionId,
        amount: pickNumber(transaction, ['Total', 'total']) ?? 0,
        currencyCode: pickString(transaction, ['CurrencyCode', 'currencyCode']),
        date: pickDate(transaction, ['Date', 'date']),
        reference: pickString(transaction, ['Reference', 'reference']),
        description:
          pickString(transaction, ['Reference', 'reference']) ??
          (firstLine ? pickString(firstLine, ['Description', 'description']) : null),
        type: pickString(transaction, ['Type', 'type']),
        status: pickString(transaction, ['Status', 'status']),
        bankAccountCode: bankAccount ? pickString(bankAccount, ['Code', 'code']) : null,
        contactId: contact ? pickString(contact, ['ContactID', 'contactID', 'contactId']) : null,
        contactName: contact ? pickString(contact, ['Name', 'name']) : null,
        isReconciled: transaction.IsReconciled === true,
        raw: transaction,
      } satisfies XeroBankTransactionRecord;
    })
    .filter((row): row is XeroBankTransactionRecord => row !== null);
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

      const invoice =
        payment.Invoice && typeof payment.Invoice === 'object'
          ? (payment.Invoice as Record<string, unknown>)
          : null;

      return {
        paymentId,
        invoiceId: invoice ? pickString(invoice, ['InvoiceID', 'invoiceID', 'invoiceId']) : null,
        amount: pickNumber(payment, ['Amount', 'amount']) ?? 0,
        currencyCode: pickString(payment, ['CurrencyCode', 'currencyCode']),
        date: pickDate(payment, ['Date', 'date']),
        reference: pickString(payment, ['Reference', 'reference']),
        status: pickString(payment, ['Status', 'status']),
        raw: payment,
      } satisfies XeroPaymentRecord;
    })
    .filter((row): row is XeroPaymentRecord => row !== null);
}

function extractCreditNotes(payload: unknown): XeroCreditNoteRecord[] {
  return mapRows(payload, 'CreditNotes', (creditNote) => {
    const creditNoteId = pickString(creditNote, ['CreditNoteID', 'creditNoteID', 'creditNoteId']);

    if (!creditNoteId) {
      return null;
    }

    const contact =
      creditNote.Contact && typeof creditNote.Contact === 'object'
        ? (creditNote.Contact as Record<string, unknown>)
        : null;
    const allocationRows = Array.isArray(creditNote.Allocations) ? creditNote.Allocations : [];

    return {
      creditNoteId,
      creditNoteNumber: pickString(creditNote, ['CreditNoteNumber', 'creditNoteNumber']),
      type: pickString(creditNote, ['Type', 'type']),
      status: pickString(creditNote, ['Status', 'status']),
      contactId: contact ? pickString(contact, ['ContactID', 'contactID', 'contactId']) : null,
      contactName: contact ? pickString(contact, ['Name', 'name']) : null,
      subtotal: pickNumber(creditNote, ['SubTotal', 'subTotal', 'subtotal']) ?? 0,
      totalTax: pickNumber(creditNote, ['TotalTax', 'totalTax']) ?? 0,
      total: pickNumber(creditNote, ['Total', 'total']) ?? 0,
      remainingCredit: pickNumber(creditNote, ['RemainingCredit', 'remainingCredit']) ?? 0,
      currencyCode: pickString(creditNote, ['CurrencyCode', 'currencyCode']),
      date: pickDate(creditNote, ['Date', 'date']),
      reference: pickString(creditNote, ['Reference', 'reference']),
      allocations: allocationRows
        .map((row) => {
          if (!row || typeof row !== 'object') return null;
          const allocation = row as Record<string, unknown>;
          const invoice =
            allocation.Invoice && typeof allocation.Invoice === 'object'
              ? (allocation.Invoice as Record<string, unknown>)
              : null;
          return {
            invoiceId: invoice ? pickString(invoice, ['InvoiceID', 'invoiceID']) : null,
            amount: pickNumber(allocation, ['Amount', 'amount']) ?? 0,
            date: pickDate(allocation, ['Date', 'date']),
          };
        })
        .filter((row): row is { invoiceId: string | null; amount: number; date: string | null } =>
          row !== null,
        ),
      raw: creditNote,
    } satisfies XeroCreditNoteRecord;
  });
}

function extractAccountRecords(payload: unknown): XeroAccountRecord[] {
  return mapRows(payload, 'Accounts', (account) => {
    const accountId = pickString(account, ['AccountID', 'accountID', 'accountId']);
    const name = pickString(account, ['Name', 'name']);

    if (!accountId || !name) {
      return null;
    }

    return {
      accountId,
      code: pickString(account, ['Code', 'code']),
      name,
      type: pickString(account, ['Type', 'type']),
      taxType: pickString(account, ['TaxType', 'taxType']),
      accountClass: pickString(account, ['Class', 'class']),
      status: pickString(account, ['Status', 'status']),
      description: pickString(account, ['Description', 'description']),
      reportingCode: pickString(account, ['ReportingCode', 'reportingCode']),
      raw: account,
    } satisfies XeroAccountRecord;
  });
}

function extractTrackingCategories(payload: unknown): XeroTrackingCategoryRecord[] {
  return mapRows(payload, 'TrackingCategories', (category) => {
    const trackingCategoryId = pickString(category, [
      'TrackingCategoryID',
      'trackingCategoryID',
      'trackingCategoryId',
    ]);
    const name = pickString(category, ['Name', 'name']);

    if (!trackingCategoryId || !name) {
      return null;
    }

    const optionRows = Array.isArray(category.Options) ? category.Options : [];

    return {
      trackingCategoryId,
      name,
      status: pickString(category, ['Status', 'status']),
      options: optionRows
        .map((row) => {
          if (!row || typeof row !== 'object') return null;
          const option = row as Record<string, unknown>;
          const trackingOptionId = pickString(option, ['TrackingOptionID', 'trackingOptionID']);
          const optionName = pickString(option, ['Name', 'name']);
          if (!trackingOptionId || !optionName) return null;
          return {
            trackingOptionId,
            name: optionName,
            status: pickString(option, ['Status', 'status']),
          };
        })
        .filter(
          (row): row is { trackingOptionId: string; name: string; status: string | null } =>
            row !== null,
        ),
      raw: category,
    } satisfies XeroTrackingCategoryRecord;
  });
}

function extractAttachments(payload: unknown): XeroAttachmentRecord[] {
  return mapRows(payload, 'Attachments', (attachment) => {
    const attachmentId = pickString(attachment, ['AttachmentID', 'attachmentID', 'attachmentId']);
    const fileName = pickString(attachment, ['FileName', 'fileName']);

    if (!attachmentId || !fileName) {
      return null;
    }

    return {
      attachmentId,
      fileName,
      mimeType: pickString(attachment, ['MimeType', 'mimeType']),
      contentLength: pickNumber(attachment, ['ContentLength', 'contentLength']),
      url: pickString(attachment, ['Url', 'url']),
      includeOnline: attachment.IncludeOnline === true,
      raw: attachment,
    } satisfies XeroAttachmentRecord;
  });
}

function mapRows<T>(
  payload: unknown,
  key: string,
  map: (row: Record<string, unknown>) => T | null,
): T[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const rows = (payload as Record<string, unknown>)[key];

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => (row && typeof row === 'object' ? map(row as Record<string, unknown>) : null))
    .filter((row): row is T => row !== null);
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

/**
 * Xero's Accounting API serialises dates as MS-JSON (`/Date(1518652800000+0000)/`), which
 * `new Date(...)` cannot read. Normalise to ISO 8601 so callers can parse or slice safely.
 * Date-only and offset-less values are UTC in Xero — without the explicit suffix the host
 * timezone would shift them across a day boundary.
 */
export function normalizeXeroDate(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const msJson = /^\/?Date\((-?\d+)(?:[+-]\d{4})?\)\/?$/.exec(trimmed);

  if (msJson) {
    const epochMs = Number(msJson[1]);
    return Number.isFinite(epochMs) ? new Date(epochMs).toISOString() : null;
  }

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const offsetLess = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(trimmed);
  const candidate = dateOnly
    ? `${trimmed}T00:00:00Z`
    : offsetLess
      ? `${trimmed.replace(' ', 'T')}Z`
      : trimmed;
  const parsed = new Date(candidate);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function pickDate(record: Record<string, unknown>, keys: string[]): string | null {
  return normalizeXeroDate(pickString(record, keys));
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
