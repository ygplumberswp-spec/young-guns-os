import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  groupBusinessWhatsappIndexRows,
  groupBusinessWhatsappMessagesByCustomer,
} from './whatsapp-business-chats.js';

describe('groupBusinessWhatsappIndexRows', () => {
  it('groups by phone thread and keeps the latest preview row', () => {
    const older = new Date('2026-08-01T10:00:00Z');
    const newer = new Date('2026-08-01T12:00:00Z');
    const grouped = groupBusinessWhatsappIndexRows([
      {
        id: '1',
        externalThreadId: '27821111111',
        occurredAt: older,
        metadata: { contactPhone: '27821111111' },
      },
      {
        id: '2',
        externalThreadId: '27821111111',
        occurredAt: newer,
        metadata: { contactPhone: '27821111111' },
      },
      {
        id: '3',
        externalThreadId: '27822222222',
        occurredAt: older,
        metadata: { contactPhone: '27822222222' },
      },
    ]);

    assert.equal(grouped.length, 2);
    assert.equal(grouped[0]?.id, '2');
    assert.equal(grouped[1]?.id, '3');
  });
});

describe('groupBusinessWhatsappMessagesByCustomer', () => {
  it('groups customer-linked messages and leaves unmatched as singletons', () => {
    const at = new Date('2026-08-01T10:00:00Z');
    const grouped = groupBusinessWhatsappMessagesByCustomer([
      { id: 'a', customerId: 'cust-1', createdAt: at },
      { id: 'b', customerId: 'cust-1', createdAt: at },
      { id: 'c', customerId: null, createdAt: at },
      { id: 'd', customerId: null, createdAt: at },
    ]);

    assert.equal(grouped.length, 3);
    assert.equal(grouped.filter((g) => g.key.startsWith('customer:')).length, 1);
    assert.equal(grouped.filter((g) => g.key.startsWith('msg:')).length, 2);
  });
});
