export type FinanceDocumentAddressSnapshot = {
  billingAddress: string | null;
  siteAddress: string | null;
  postalAddress: string | null;
};

export type FinanceDocumentAddressInput = {
  billingAddress?: string | null;
  siteAddress?: string | null;
  postalAddress?: string | null;
};

export function normalizeOptionalDocumentText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeFinanceDocumentAddresses(
  input?: FinanceDocumentAddressInput | null,
): FinanceDocumentAddressSnapshot {
  return {
    billingAddress: normalizeOptionalDocumentText(input?.billingAddress),
    siteAddress: normalizeOptionalDocumentText(input?.siteAddress),
    postalAddress: normalizeOptionalDocumentText(input?.postalAddress),
  };
}

export function toFinanceDocumentAddressSnapshot(row: {
  billingAddress?: string | null;
  siteAddress?: string | null;
  postalAddress?: string | null;
}): FinanceDocumentAddressSnapshot {
  return {
    billingAddress: row.billingAddress ?? null,
    siteAddress: row.siteAddress ?? null,
    postalAddress: row.postalAddress ?? null,
  };
}

export function mergeFinanceDocumentAddresses(
  current: FinanceDocumentAddressSnapshot,
  input?: FinanceDocumentAddressInput | null,
): FinanceDocumentAddressSnapshot {
  if (input === undefined) return current;
  return normalizeFinanceDocumentAddresses(input);
}

export function resolveQuoteIssuedAtUpdate(
  _currentIssuedAt: Date | null,
  inputIssuedAt: string | null | undefined,
  isImmutable: boolean,
): Date | null | undefined {
  if (isImmutable || inputIssuedAt === undefined) return undefined;
  if (inputIssuedAt === null || !inputIssuedAt.trim()) return null;
  const parsed = new Date(inputIssuedAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid issuedAt date');
  }
  return parsed;
}

export function resolveInvoiceIssuedAtUpdate(
  _currentIssuedAt: Date | null,
  inputIssuedAt: string | null | undefined,
): Date | null | undefined {
  if (inputIssuedAt === undefined) return undefined;
  if (inputIssuedAt === null || !inputIssuedAt.trim()) return null;
  const parsed = new Date(inputIssuedAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid issuedAt date');
  }
  return parsed;
}

export function mapCustomerReferenceToStorage(value: string | null | undefined): string | null {
  return normalizeOptionalDocumentText(value);
}

export function mapCustomerReferenceFromStorage(value: string | null | undefined): string | null {
  return value ?? null;
}
