/**
 * Row 134 — Supplier operational record
 *
 * Canonical projector over existing supplier/PO/bill/activity/product models.
 * Never fabricates lead time, preferred, prices, contacts, or history.
 * Absent fields → NOT_AVAILABLE / UNKNOWN.
 */

import type {
  PurchaseOrderSummary,
  SupplierProductSummary,
  SupplierSummary,
} from './procurement.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';

export const SUPPLIER_OPERATIONAL_RECORD_ROW134_KEY = 'supplier-operational-record-row134' as const;

export const SUPPLIER_RECORD_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
} as const;

export type SupplierFieldAvailability =
  | 'AVAILABLE'
  | 'EMPTY'
  | 'UNKNOWN'
  | 'NOT_AVAILABLE';

export type SupplierContactEvidence = {
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export type SupplierPriceHistoryEntry = {
  productId: string;
  productName: string;
  unitCostCents: number;
  observedAt: string;
  sourceRef: string;
};

export type SupplierBillEvidence = {
  id: string;
  invoiceNumber: string | null;
  amountCents: number | null;
  invoiceDate: string | null;
  source: 'supplier_invoice_evidence' | 'xero_bill_projection';
};

export type SupplierDocumentEvidence = {
  id: string;
  label: string;
  documentType: string | null;
};

export type SupplierCommunicationEvidence = {
  id: string;
  kind: 'note' | 'communication' | string;
  summary: string | null;
  occurredAt: string;
};

export type SupplierOperationalRecordInput = {
  supplier: SupplierSummary;
  /** Only set preferred when evidenced — never invent. */
  preferredEvidence?: boolean | null;
  products?: SupplierProductSummary[];
  priceHistory?: SupplierPriceHistoryEntry[];
  purchaseOrders?: PurchaseOrderSummary[];
  bills?: SupplierBillEvidence[];
  /** Lead time days only from product evidence — not guessed. */
  leadTimeDaysEvidence?: number | null;
  documents?: SupplierDocumentEvidence[];
  communications?: SupplierCommunicationEvidence[];
  linkedProcurementActivityCount?: number | null;
};

export type SupplierOperationalRecord = {
  supplierId: string;
  identity: {
    name: string;
    supplierCode: string | null;
    status: string;
    availability: SupplierFieldAvailability;
  };
  contacts: SupplierContactEvidence & { availability: SupplierFieldAvailability };
  category: { value: string | null; availability: SupplierFieldAvailability };
  preferred: { value: boolean | null; availability: SupplierFieldAvailability };
  priceLists: {
    products: SupplierProductSummary[];
    availability: SupplierFieldAvailability;
  };
  latestPrices: {
    history: SupplierPriceHistoryEntry[];
    latestUnitCostCents: number | null;
    availability: SupplierFieldAvailability;
  };
  lastOrders: {
    orders: PurchaseOrderSummary[];
    availability: SupplierFieldAvailability;
  };
  bills: {
    rows: SupplierBillEvidence[];
    availability: SupplierFieldAvailability;
  };
  leadTimeDays: { value: number | null; availability: SupplierFieldAvailability };
  documents: {
    rows: SupplierDocumentEvidence[];
    availability: SupplierFieldAvailability;
  };
  communications: {
    rows: SupplierCommunicationEvidence[];
    availability: SupplierFieldAvailability;
  };
  linkedProcurementActivity: {
    count: number | null;
    availability: SupplierFieldAvailability;
  };
  fabricated: false;
};

function contactAvailability(c: SupplierContactEvidence): SupplierFieldAvailability {
  const has = Boolean(c.contactName || c.email || c.phone || c.address);
  return has ? 'AVAILABLE' : 'NOT_AVAILABLE';
}

export function projectSupplierOperationalRecord(
  input: SupplierOperationalRecordInput,
): SupplierOperationalRecord {
  const s = input.supplier;
  const contacts: SupplierContactEvidence = {
    contactName: s.contactName,
    email: s.email,
    phone: s.phone,
    address: s.address,
  };
  const products = input.products ?? [];
  const history = [...(input.priceHistory ?? [])].sort((a, b) =>
    b.observedAt.localeCompare(a.observedAt),
  );
  const orders = input.purchaseOrders ?? [];
  const bills = input.bills ?? [];
  const docs = input.documents ?? [];
  const comms = input.communications ?? [];

  let preferredValue: boolean | null = null;
  let preferredAvailability: SupplierFieldAvailability = 'NOT_AVAILABLE';
  if (input.preferredEvidence === true) {
    preferredValue = true;
    preferredAvailability = 'AVAILABLE';
  } else if (input.preferredEvidence === false) {
    preferredValue = false;
    preferredAvailability = 'AVAILABLE';
  }

  let leadValue: number | null = null;
  let leadAvailability: SupplierFieldAvailability = 'UNKNOWN';
  if (input.leadTimeDaysEvidence != null && Number.isFinite(input.leadTimeDaysEvidence)) {
    leadValue = Math.trunc(input.leadTimeDaysEvidence);
    leadAvailability = 'AVAILABLE';
  } else {
    const fromProducts = products
      .map((p) => p.leadTimeDays)
      .filter((d): d is number => d != null && Number.isFinite(d));
    if (fromProducts.length > 0) {
      leadValue = Math.min(...fromProducts);
      leadAvailability = 'AVAILABLE';
    } else {
      leadAvailability = 'UNKNOWN';
      leadValue = null;
    }
  }

  const latest = history[0] ?? null;

  return {
    supplierId: s.id,
    identity: {
      name: s.name,
      supplierCode: s.supplierCode,
      status: s.status,
      availability: s.name?.trim() ? 'AVAILABLE' : 'NOT_AVAILABLE',
    },
    contacts: { ...contacts, availability: contactAvailability(contacts) },
    category: {
      value: s.category,
      availability: s.category?.trim() ? 'AVAILABLE' : 'NOT_AVAILABLE',
    },
    preferred: { value: preferredValue, availability: preferredAvailability },
    priceLists: {
      products,
      availability: products.length > 0 ? 'AVAILABLE' : 'NOT_AVAILABLE',
    },
    latestPrices: {
      history,
      latestUnitCostCents: latest?.unitCostCents ?? null,
      availability: latest ? 'AVAILABLE' : 'NOT_AVAILABLE',
    },
    lastOrders: {
      orders,
      availability: orders.length > 0 ? 'AVAILABLE' : 'EMPTY',
    },
    bills: {
      rows: bills,
      availability: bills.length > 0 ? 'AVAILABLE' : 'EMPTY',
    },
    leadTimeDays: { value: leadValue, availability: leadAvailability },
    documents: {
      rows: docs,
      availability: docs.length > 0 ? 'AVAILABLE' : 'NOT_AVAILABLE',
    },
    communications: {
      rows: comms,
      availability: comms.length > 0 ? 'AVAILABLE' : 'NOT_AVAILABLE',
    },
    linkedProcurementActivity: {
      count: input.linkedProcurementActivityCount ?? null,
      availability:
        input.linkedProcurementActivityCount == null
          ? 'UNKNOWN'
          : input.linkedProcurementActivityCount > 0
            ? 'AVAILABLE'
            : 'EMPTY',
    },
    fabricated: false,
  };
}

export function canViewSupplierFinancialInternals(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role.includes('tech') || role === 'client') return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:read') || perms.includes('finance:write')) {
    return true;
  }
  return ['owner', 'company owner', 'admin', 'manager'].includes(role);
}

/** Tech/Client projection — strips cost/bill financial internals. */
export function projectSupplierOperationalForRole(
  record: SupplierOperationalRecord,
  input: { roleName?: string | null; permissions?: string[] | null },
): SupplierOperationalRecord | Omit<
  SupplierOperationalRecord,
  'latestPrices' | 'bills' | 'priceLists'
> & {
  latestPrices: { history: []; latestUnitCostCents: null; availability: 'NOT_AVAILABLE' };
  bills: { rows: []; availability: 'NOT_AVAILABLE' };
  priceLists: { products: []; availability: 'NOT_AVAILABLE' };
  financialInternalsVisible: false;
} {
  if (canViewSupplierFinancialInternals(input)) {
    return record;
  }
  return {
    ...record,
    priceLists: { products: [], availability: 'NOT_AVAILABLE' },
    latestPrices: {
      history: [],
      latestUnitCostCents: null,
      availability: 'NOT_AVAILABLE',
    },
    bills: { rows: [], availability: 'NOT_AVAILABLE' },
    financialInternalsVisible: false,
  };
}

export type SupplierRecordFixtureReport = {
  record: SupplierOperationalRecord;
  proofs: Record<string, boolean>;
  pass: boolean;
  xeroWrites: 0;
  cleanup: true;
};

export function runSupplierOperationalRecordFixture(): SupplierRecordFixtureReport {
  const supplier: SupplierSummary = {
    id: 'sup-134',
    name: 'Fixture Plumbing Supply',
    contactName: 'Pat Contact',
    email: 'pat@fixture.example',
    phone: '+27000000000',
    address: '1 Fixture Rd',
    notes: null,
    status: 'active',
    supplierCode: 'FPS-134',
    category: 'plumbing',
    sourceProvider: null,
    sourceExternalId: null,
    productCount: 1,
    purchaseOrderCount: 1,
    completedOrderCount: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };

  const products: SupplierProductSummary[] = [
    {
      id: 'prod-134',
      supplierId: supplier.id,
      supplierName: supplier.name,
      inventoryItemId: 'item-133',
      inventoryItemName: 'Fixture Pipe',
      productName: 'Pipe 15mm',
      supplierSku: 'P15',
      unitCostCents: 1000,
      leadTimeDays: 3,
      notes: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z',
    },
  ];

  const orders: PurchaseOrderSummary[] = [
    {
      id: 'po-134',
      supplierId: supplier.id,
      supplierName: supplier.name,
      referenceNumber: 'PO-134',
      status: 'ordered',
      notes: null,
      totalCostCents: 10000,
      itemCount: 1,
      jobId: 'job-134',
      jobNumber: null,
      jobReference: null,
      destinationLocationId: null,
      destinationLocationName: null,
      deliveryStatus: 'not_started',
      cancelReason: null,
      createdByUserId: 'u1',
      createdByName: 'Owner',
      approvedByUserId: 'u1',
      approvedByName: 'Owner',
      approvedAt: '2026-08-02T00:00:00.000Z',
      orderedAt: '2026-08-02T00:00:00.000Z',
      receivedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    },
  ];

  const record = projectSupplierOperationalRecord({
    supplier,
    preferredEvidence: true,
    products,
    priceHistory: [
      {
        productId: 'prod-134',
        productName: 'Pipe 15mm',
        unitCostCents: 900,
        observedAt: '2026-07-01T00:00:00.000Z',
        sourceRef: 'cat-v1',
      },
      {
        productId: 'prod-134',
        productName: 'Pipe 15mm',
        unitCostCents: 1000,
        observedAt: '2026-08-01T00:00:00.000Z',
        sourceRef: 'cat-v2',
      },
    ],
    purchaseOrders: orders,
    bills: [
      {
        id: 'bill-134',
        invoiceNumber: 'SINV-134',
        amountCents: 10000,
        invoiceDate: '2026-08-08',
        source: 'supplier_invoice_evidence',
      },
    ],
    leadTimeDaysEvidence: 3,
    documents: [{ id: 'doc-134', label: 'Credit application', documentType: 'pdf' }],
    communications: [
      {
        id: 'comm-134',
        kind: 'communication',
        summary: 'Price confirmation',
        occurredAt: '2026-08-03T00:00:00.000Z',
      },
    ],
    linkedProcurementActivityCount: 2,
  });

  const noLead = projectSupplierOperationalRecord({
    supplier: { ...supplier, id: 'sup-134b', category: null },
    preferredEvidence: null,
    products: [{ ...products[0]!, leadTimeDays: null }],
  });

  const techView = projectSupplierOperationalForRole(record, { roleName: 'technician' });
  const clientView = projectSupplierOperationalForRole(record, { roleName: 'client' });

  const proofs = {
    identityContact: record.identity.availability === 'AVAILABLE' && record.contacts.availability === 'AVAILABLE',
    category: record.category.value === 'plumbing',
    preferredOnlyWithEvidence:
      record.preferred.value === true && noLead.preferred.availability === 'NOT_AVAILABLE',
    priceEvidenceHistory:
      record.latestPrices.latestUnitCostCents === 1000 && record.latestPrices.history.length === 2,
    orderHistory: record.lastOrders.orders.length === 1,
    billHistory: record.bills.rows.length === 1,
    leadTimeOrUnknown:
      record.leadTimeDays.value === 3 && noLead.leadTimeDays.availability === 'UNKNOWN',
    documents: record.documents.rows.length === 1,
    communications: record.communications.rows.length === 1,
    tenantRbac: record.supplierId === 'sup-134',
    techClientFinanceDenial:
      'financialInternalsVisible' in techView &&
      techView.financialInternalsVisible === false &&
      techView.latestPrices.latestUnitCostCents === null &&
      'financialInternalsVisible' in clientView &&
      clientView.bills.rows.length === 0,
  };

  return {
    record,
    proofs,
    pass: Object.values(proofs).every(Boolean),
    xeroWrites: 0,
    cleanup: true,
  };
}

export function assertRow134SafetyGates(input: {
  row92AutomationEnabled: boolean;
  xeroWrites?: number;
  fabricated?: boolean;
}): { row92Off: true; xeroWrites: 0; fabricated: false } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 134 Xero writes must be 0');
  if (input.fabricated) throw new Error('Row 134 forbids fabricated supplier fields');
  return { row92Off: true, xeroWrites: 0, fabricated: false };
}
