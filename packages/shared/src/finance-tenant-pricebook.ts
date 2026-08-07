import type { FinanceCatalogueItemSearchResult } from './finance-catalogue.js';

/** Staging/production Young Guns company id — override with YOUNG_GUNS_COMPANY_ID env. */
export const YOUNG_GUNS_REFERENCE_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

/**
 * True when the tenant may receive bundled Young Guns labour/service pricebook rows.
 * Non-YG tenants never see approved constants — inventory + manual lines only.
 */
export function isYoungGunsFinanceTenant(
  companyId: string,
  company?: { slug?: string | null; name?: string | null } | null,
): boolean {
  const configured = typeof process !== 'undefined' ? process.env.YOUNG_GUNS_COMPANY_ID?.trim() : '';
  if (configured) return companyId === configured;
  if (companyId === YOUNG_GUNS_REFERENCE_COMPANY_ID) return true;
  const slug = company?.slug?.trim().toLowerCase() ?? '';
  const name = company?.name?.trim().toLowerCase() ?? '';
  return slug.includes('young-guns') || name.includes('young guns');
}

/** Owner-approved labour/service rows — only merged for verified Young Guns tenants. */
export const YOUNG_GUNS_APPROVED_FINANCE_PRICEBOOK: readonly FinanceCatalogueItemSearchResult[] = [
  {
    sourceKey: 'pricebook:LAB-CALLOUT',
    sourceType: 'labour',
    itemCode: 'LAB-CALLOUT',
    name: 'Call-out fee',
    shortDescription: 'Standard site attendance / call-out labour',
    sellPriceCents: 45000,
    unitCostCents: null,
    unit: 'each',
    category: 'travel',
  },
  {
    sourceKey: 'pricebook:LAB-HOURLY',
    sourceType: 'labour',
    itemCode: 'LAB-HOURLY',
    name: 'Standard labour — hourly',
    shortDescription: 'Qualified plumber labour per hour',
    sellPriceCents: 65000,
    unitCostCents: null,
    unit: 'hour',
    category: 'labour',
  },
  {
    sourceKey: 'pricebook:LAB-AFTERHOURS',
    sourceType: 'labour',
    itemCode: 'LAB-AFTERHOURS',
    name: 'After-hours labour — hourly',
    shortDescription: 'After-hours / emergency labour rate',
    sellPriceCents: 95000,
    unitCostCents: null,
    unit: 'hour',
    category: 'labour',
  },
  {
    sourceKey: 'pricebook:SRV-GEYSER-INSTALL',
    sourceType: 'service',
    itemCode: 'SRV-GEYSER-INSTALL',
    name: 'Geyser installation',
    shortDescription: 'Supply and install geyser (labour component)',
    sellPriceCents: 250000,
    unitCostCents: null,
    unit: 'each',
    category: 'scope',
  },
  {
    sourceKey: 'pricebook:SRV-LEAK-REPAIR',
    sourceType: 'service',
    itemCode: 'SRV-LEAK-REPAIR',
    name: 'Leak detection & repair',
    shortDescription: 'Diagnose and repair water leak',
    sellPriceCents: 85000,
    unitCostCents: null,
    unit: 'each',
    category: 'scope',
  },
  {
    sourceKey: 'pricebook:SRV-DRAIN-CLEAR',
    sourceType: 'service',
    itemCode: 'SRV-DRAIN-CLEAR',
    name: 'Drain clearing',
    shortDescription: 'Clear blocked drain line',
    sellPriceCents: 75000,
    unitCostCents: null,
    unit: 'each',
    category: 'scope',
  },
  {
    sourceKey: 'pricebook:SRV-COC',
    sourceType: 'service',
    itemCode: 'SRV-COC',
    name: 'Certificate of Compliance (CoC)',
    shortDescription: 'Plumbing CoC inspection and issue',
    sellPriceCents: 120000,
    unitCostCents: null,
    unit: 'each',
    category: 'scope',
  },
];

export function resolveYoungGunsPricebookForTenant(
  companyId: string,
  company?: { slug?: string | null; name?: string | null } | null,
): FinanceCatalogueItemSearchResult[] {
  if (!isYoungGunsFinanceTenant(companyId, company)) return [];
  return YOUNG_GUNS_APPROVED_FINANCE_PRICEBOOK.map((item) => ({ ...item }));
}

export function filterFinanceCatalogueCostFields(
  items: readonly FinanceCatalogueItemSearchResult[],
  includeCost: boolean,
): FinanceCatalogueItemSearchResult[] {
  if (includeCost) return items.map((item) => ({ ...item }));
  return items.map((item) => ({ ...item, unitCostCents: null }));
}

/** Shared RBAC for finance profit/cost visibility — used by API and web. */
export function canViewFinanceProfit(
  permissions: readonly string[],
  roleName?: string | null,
): boolean {
  // SEC-001: Technician/Client never see company profit — even if permissions were mis-elevated.
  if (roleName === 'Technician' || roleName === 'Client') return false;
  if (permissions.includes('*') || permissions.includes('finance:write')) return true;
  return ['Company Owner', 'Owner', 'Accountant', 'Manager'].includes(roleName ?? '');
}

type FinanceLineCostField = { unitCostCents?: number | null | undefined };

/** Strip internal unit costs from finance line payloads when the caller lacks profit visibility. */
export function stripUnauthorizedFinanceLineCosts<T extends FinanceLineCostField>(
  lineItems: readonly T[] | undefined | null,
  includeCost: boolean,
): T[] | undefined {
  if (!lineItems) return undefined;
  if (includeCost) return lineItems.map((line) => ({ ...line }));
  return lineItems.map((line) => ({ ...line, unitCostCents: undefined }));
}

/** Sanitize a finance document write request — never trust client-supplied cost fields. */
export function sanitizeFinanceDocumentWriteRequest<
  T extends { lineItems?: readonly FinanceLineCostField[] | null | undefined },
>(input: T, includeCost: boolean): T {
  if (!input.lineItems || includeCost) return input;
  return {
    ...input,
    lineItems: stripUnauthorizedFinanceLineCosts(input.lineItems, false),
  };
}
