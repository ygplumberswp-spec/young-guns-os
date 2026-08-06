import { randomBytes } from 'node:crypto';
import type { FacebookPageDiscoverySessionPayload } from '@titan/shared';
import { decryptSecret, encryptSecret } from './crypto.js';

export function issueFacebookPageDiscoverySessionToken(input: {
  payload: Omit<FacebookPageDiscoverySessionPayload, 'sessionId' | 'version'>;
  encryptionKey: string;
}): { token: string; payload: FacebookPageDiscoverySessionPayload } {
  const payload: FacebookPageDiscoverySessionPayload = {
    version: 1,
    sessionId: randomBytes(16).toString('base64url'),
    ...input.payload,
  };
  const token = encryptSecret(JSON.stringify(payload), input.encryptionKey);
  return { token, payload };
}

export function parseFacebookPageDiscoverySessionToken(
  token: string,
  encryptionKey: string,
): FacebookPageDiscoverySessionPayload {
  const parsed = JSON.parse(decryptSecret(token, encryptionKey)) as FacebookPageDiscoverySessionPayload;
  if (parsed.version !== 1 || !parsed.sessionId || !parsed.companyId || !parsed.userId) {
    throw new Error('Invalid Facebook Page discovery session payload.');
  }
  if (!Array.isArray(parsed.rows)) {
    throw new Error('Invalid Facebook Page discovery session rows.');
  }
  return parsed;
}
