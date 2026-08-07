import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPersonalWaDraftReply,
  buildPersonalWaNextAction,
  classifyPersonalWaIntelligence,
  extractBusinessFields,
  isBusinessIntelClassification,
  mapPciToIntelClassification,
  PERSONAL_WA_INTEL_PRODUCT_COPY,
} from './personal-whatsapp-intelligence.js';

describe('personal whatsapp intelligence classification', () => {
  it('defaults unknown threads to private_personal', () => {
    const result = classifyPersonalWaIntelligence({ preview: 'hey' });
    assert.equal(result.classification, 'private_personal');
    assert.equal(result.isBusiness, false);
    assert.equal(result.excludedFromBusinessSearch, true);
  });

  it('classifies supplier / employee / customer / opportunity', () => {
    assert.equal(
      classifyPersonalWaIntelligence({ preview: 'Please send purchase order and delivery note' })
        .classification,
      'supplier',
    );
    assert.equal(
      classifyPersonalWaIntelligence({ preview: 'I will clock in for my shift now' }).classification,
      'employee',
    );
    assert.equal(
      classifyPersonalWaIntelligence({
        preview: 'Need a quote for a geyser leak tomorrow',
      }).classification,
      'business_opportunity',
    );
    assert.equal(
      classifyPersonalWaIntelligence({ preview: 'hello', knownCustomer: true }).classification,
      'customer',
    );
  });

  it('maps PCI classifications onto the five-way taxonomy', () => {
    assert.equal(mapPciToIntelClassification('new_lead'), 'business_opportunity');
    assert.equal(mapPciToIntelClassification('existing_customer'), 'customer');
    assert.equal(mapPciToIntelClassification('family'), 'private_personal');
    assert.equal(mapPciToIntelClassification('supplier'), 'supplier');
    assert.equal(mapPciToIntelClassification('employee'), 'employee');
  });

  it('extracts business fields without inventing content', () => {
    const extraction = extractBusinessFields({
      contactName: 'Thabo',
      contactPhone: '+27821234567',
      preview: 'Urgent burst pipe at 12 Main Street. Please call me back.',
      attachmentCount: 1,
    });
    assert.equal(extraction.customerName, 'Thabo');
    assert.equal(extraction.phone, '+27821234567');
    assert.ok(extraction.address?.toLowerCase().includes('main'));
    assert.equal(extraction.urgency, 'emergency');
    assert.equal(extraction.hasPhotosOrDocs, true);
    assert.equal(extraction.followUpNeeded, true);
  });

  it('never marks private as business and drafts never imply auto-send', () => {
    assert.equal(isBusinessIntelClassification('private_personal'), false);
    const draft = buildPersonalWaDraftReply({
      classification: 'business_opportunity',
      contactName: 'Amy',
      extraction: extractBusinessFields({ preview: 'Need a quote for blocked drain' }),
    });
    assert.match(draft.body, /Owner approval only/);
    assert.match(draft.body, /nothing was sent/i);
    const next = buildPersonalWaNextAction({
      classification: 'customer',
      contactName: 'Amy',
    });
    assert.match(next.body, /Owner approval/);
  });

  it('clarifies PCI vs Personal Assistant vs this workflow in product copy', () => {
    assert.match(
      PERSONAL_WA_INTEL_PRODUCT_COPY.personalCommunicationsIntelligence,
      /Business WhatsApp/,
    );
    assert.match(
      PERSONAL_WA_INTEL_PRODUCT_COPY.personalWhatsappAssistant,
      /personal_whatsapp/,
    );
    assert.match(PERSONAL_WA_INTEL_PRODUCT_COPY.thisWorkflow, /Owner approval/);
  });
});
