import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectAttachments,
  encodeRawMime,
  folderQuery,
  getHeader,
  type GmailMessage,
} from './gmail.client.js';

describe('Gmail client helpers', () => {
  it('maps folders to Gmail label queries', () => {
    assert.deepEqual(folderQuery('inbox'), { labelIds: ['INBOX'] });
    assert.deepEqual(folderQuery('sent'), { labelIds: ['SENT'] });
    assert.deepEqual(folderQuery('drafts'), { labelIds: ['DRAFT'] });
  });

  it('reads headers and attachment metadata without inventing content', () => {
    const message: GmailMessage = {
      id: 'm1',
      threadId: 't1',
      payload: {
        headers: [
          { name: 'From', value: 'Client <client@example.com>' },
          { name: 'Subject', value: 'Leak at unit 2' },
        ],
        parts: [
          {
            filename: 'photo.jpg',
            mimeType: 'image/jpeg',
            body: { attachmentId: 'att-1', size: 1200 },
          },
        ],
      },
    };
    assert.equal(getHeader(message, 'From'), 'Client <client@example.com>');
    assert.equal(getHeader(message, 'Subject'), 'Leak at unit 2');
    assert.deepEqual(collectAttachments(message.payload), [
      {
        attachmentId: 'att-1',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 1200,
      },
    ]);
  });

  it('encodes MIME for draft/send without auto-send side effects', () => {
    const raw = encodeRawMime({
      to: ['client@example.com'],
      subject: 'Re: Leak',
      bodyText: 'We will attend shortly.',
      inReplyTo: '<msg@mail.gmail.com>',
    });
    assert.ok(raw.length > 20);
    assert.equal(raw.includes('+'), false);
    assert.equal(raw.includes('/'), false);
  });
});
