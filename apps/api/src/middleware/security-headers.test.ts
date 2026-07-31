import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import { securityHeadersMiddleware } from './security-headers.js';

describe('securityHeadersMiddleware', () => {
  it('uses Cross-Origin-Resource-Policy cross-origin for split web/API hosts', () => {
    const headers = new Map<string, string>();
    const res = {
      setHeader: (key: string, value: string) => {
        headers.set(key.toLowerCase(), value);
      },
      removeHeader: () => undefined,
    } as unknown as Response;

    let nextCalled = false;
    securityHeadersMiddleware()({} as Request, res, () => {
      nextCalled = true;
    });

    assert.equal(headers.get('cross-origin-resource-policy'), 'cross-origin');
    assert.equal(nextCalled, true);
  });
});
