import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDocIExpiryAlertDraft,
  buildDocIExpirySnapshot,
  buildDocILinkSnapshot,
  buildDocIMissingDocDraft,
  buildDocISearchSnapshot,
  buildDocIVersionSnapshot,
  canAccessDocumentIntelligence,
  canApproveDocumentIntelligenceDrafts,
  canManageDocumentIntelligenceSettings,
  canWriteDocumentIntelligence,
  docIDaysUntil,
  defaultDocISettings,
  DOCI_PRODUCT_COPY,
  isDocIDocumentType,
  listDocIAuraConnections,
} from './document-intelligence.js';

describe('document intelligence', () => {
  it('RBAC: Technician/Client denied; write needs documents:write; Owner approves', () => {
    assert.equal(
      canAccessDocumentIntelligence({
        roleName: 'Manager',
        permissions: ['documents:read'],
      }),
      true,
    );
    assert.equal(
      canAccessDocumentIntelligence({
        roleName: 'Technician',
        permissions: ['*', 'documents:write'],
      }),
      false,
    );
    assert.equal(
      canAccessDocumentIntelligence({
        roleName: 'Client',
        permissions: ['documents:read'],
      }),
      false,
    );
    assert.equal(
      canWriteDocumentIntelligence({
        roleName: 'Manager',
        permissions: ['documents:read'],
      }),
      false,
    );
    assert.equal(
      canWriteDocumentIntelligence({
        roleName: 'Manager',
        permissions: ['documents:write'],
      }),
      true,
    );
    assert.equal(
      canApproveDocumentIntelligenceDrafts({
        roleName: 'Company Owner',
        permissions: ['documents:write'],
      }),
      true,
    );
    assert.equal(
      canApproveDocumentIntelligenceDrafts({
        roleName: 'Manager',
        permissions: ['documents:write'],
      }),
      false,
    );
    assert.equal(
      canManageDocumentIntelligenceSettings({
        roleName: 'Company Owner',
        permissions: ['*'],
      }),
      true,
    );
  });

  it('search/expiry/versions stay unavailable without real documents — never invent', () => {
    const search = buildDocISearchSnapshot({
      resultCount: 0,
      query: null,
      totalDocuments: 0,
    });
    assert.equal(search.availability, 'unavailable');
    assert.ok(/not invented/i.test(search.rationale));

    const expiry = buildDocIExpirySnapshot({
      openReminderCount: 0,
      expiringSoonCount: 0,
      expiredCount: 0,
      profileWithExpiryCount: 0,
    });
    assert.equal(expiry.availability, 'unavailable');
    assert.ok(/not invented/i.test(expiry.rationale));

    const versions = buildDocIVersionSnapshot({
      versionedDocumentCount: 0,
      totalVersionRows: 0,
    });
    assert.equal(versions.availability, 'unavailable');
  });

  it('AURA expiry + missing-doc drafts are recommendations only', () => {
    const expiry = buildDocIExpiryAlertDraft({
      documentTitle: 'Gas COC Unit 4',
      documentType: 'coc',
      expiresAt: '2026-09-01T00:00:00.000Z',
      docIDaysUntilExpiry: 12,
    });
    assert.equal(expiry.kind, 'expiry_alert');
    assert.ok(/Draft only/i.test(expiry.body));
    assert.ok(/Does not auto-send/i.test(expiry.body));

    const missing = buildDocIMissingDocDraft({
      missingType: 'warranty',
      customerName: 'Acme',
      jobTitle: 'Boiler install',
    });
    assert.equal(missing.kind, 'missing_doc_suggestion');
    assert.ok(/Does not invent documents/i.test(missing.body));
    assert.ok(/Owner approval/i.test(missing.body));
  });

  it('link snapshot uses real FK honesty + settings invariants', () => {
    const links = buildDocILinkSnapshot({
      customerLinkedCount: 2,
      jobLinkedCount: 1,
      propertyLinkedCount: 1,
      unlinkedCount: 3,
    });
    assert.equal(links.propertyLinksAvailable, true);
    assert.ok(/cx_customer_properties/i.test(links.rationale));

    const settings = defaultDocISettings();
    assert.equal(settings.autoSendRemindersEnabled, false);
    assert.equal(settings.inventDocumentsEnabled, false);
    assert.ok(DOCI_PRODUCT_COPY.thisLayer.includes('Real documents only'));
    assert.equal(isDocIDocumentType('coc'), true);
    assert.equal(isDocIDocumentType('fake'), false);
    assert.ok(listDocIAuraConnections().some((c) => c.href === '/documents'));
    assert.ok(Number.isFinite(docIDaysUntil(new Date().toISOString())));
  });
});
