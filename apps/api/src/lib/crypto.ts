import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(plaintext: string, encryptionKey: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(encryptionKey), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload: string, encryptionKey: string): string {
  const [ivPart, tagPart, encryptedPart] = payload.split('.');

  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error('Invalid encrypted payload format');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    deriveKey(encryptionKey),
    Buffer.from(ivPart, 'base64url'),
  );

  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64url')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export type CartrackStoredCredentials = {
  username: string;
  password: string;
};

export function encryptCartrackCredentials(
  credentials: CartrackStoredCredentials,
  encryptionKey: string,
): string {
  return encryptSecret(JSON.stringify(credentials), encryptionKey);
}

export function decryptCartrackCredentials(
  payload: string,
  encryptionKey: string,
): CartrackStoredCredentials {
  const parsed = JSON.parse(decryptSecret(payload, encryptionKey)) as CartrackStoredCredentials;

  if (!parsed.username || !parsed.password) {
    throw new Error('Invalid stored Cartrack credentials');
  }

  return parsed;
}

export function hashWebhookSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function generateWebhookSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateDeveloperApiKey(): string {
  return `titan_sk_${randomBytes(32).toString('base64url')}`;
}

export type XeroOAuthStoredCredentials = {
  version: 2;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
};

export type XeroLegacyStoredCredentials = {
  clientId: string;
  clientSecret: string;
};

export type XeroStoredCredentials = XeroOAuthStoredCredentials | XeroLegacyStoredCredentials;

export function isXeroOAuthCredentials(
  credentials: XeroStoredCredentials,
): credentials is XeroOAuthStoredCredentials {
  return 'version' in credentials && credentials.version === 2;
}

export type EmailStoredCredentials = {
  username: string;
  password: string;
};

export type YocoStoredCredentials = {
  secretKey: string;
};

function encryptJsonCredentials<T extends object>(credentials: T, encryptionKey: string): string {
  return encryptSecret(JSON.stringify(credentials), encryptionKey);
}

function decryptJsonCredentials<T extends object>(payload: string, encryptionKey: string): T {
  return JSON.parse(decryptSecret(payload, encryptionKey)) as T;
}

export function encryptXeroOAuthCredentials(
  credentials: XeroOAuthStoredCredentials,
  encryptionKey: string,
): string {
  return encryptJsonCredentials(credentials, encryptionKey);
}

export function encryptXeroCredentials(
  credentials: XeroStoredCredentials,
  encryptionKey: string,
): string {
  return encryptJsonCredentials(credentials, encryptionKey);
}

export function decryptXeroCredentials(
  payload: string,
  encryptionKey: string,
): XeroStoredCredentials {
  const parsed = decryptJsonCredentials<XeroStoredCredentials>(payload, encryptionKey);

  if (isXeroOAuthCredentials(parsed)) {
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt) {
      throw new Error('Invalid stored Xero OAuth credentials');
    }

    return parsed;
  }

  if (!parsed.clientId || !parsed.clientSecret) {
    throw new Error('Invalid stored Xero credentials');
  }

  return parsed;
}

export function encryptEmailCredentials(
  credentials: EmailStoredCredentials,
  encryptionKey: string,
): string {
  return encryptJsonCredentials(credentials, encryptionKey);
}

export function decryptEmailCredentials(
  payload: string,
  encryptionKey: string,
): EmailStoredCredentials {
  const parsed = decryptJsonCredentials<EmailStoredCredentials>(payload, encryptionKey);

  if (!parsed.username || !parsed.password) {
    throw new Error('Invalid stored email credentials');
  }

  return parsed;
}

export function encryptYocoCredentials(
  credentials: YocoStoredCredentials,
  encryptionKey: string,
): string {
  return encryptJsonCredentials(credentials, encryptionKey);
}

export function decryptYocoCredentials(
  payload: string,
  encryptionKey: string,
): YocoStoredCredentials {
  const parsed = decryptJsonCredentials<YocoStoredCredentials>(payload, encryptionKey);

  if (!parsed.secretKey) {
    throw new Error('Invalid stored Yoco credentials');
  }

  return parsed;
}

export type WhatsappStoredCredentials = {
  accessToken: string;
};

export function encryptWhatsappCredentials(
  credentials: WhatsappStoredCredentials,
  encryptionKey: string,
): string {
  return encryptJsonCredentials(credentials, encryptionKey);
}

export function decryptWhatsappCredentials(
  payload: string,
  encryptionKey: string,
): WhatsappStoredCredentials {
  const parsed = decryptJsonCredentials<WhatsappStoredCredentials>(payload, encryptionKey);

  if (!parsed.accessToken) {
    throw new Error('Invalid stored WhatsApp credentials');
  }

  return parsed;
}

export function hashOAuthState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

export type N8nStoredCredentials = {
  apiKey: string;
  webhookSecret: string;
};

export function encryptN8nCredentials(
  credentials: N8nStoredCredentials,
  encryptionKey: string,
): string {
  return encryptJsonCredentials(credentials, encryptionKey);
}

export function decryptN8nCredentials(
  payload: string,
  encryptionKey: string,
): N8nStoredCredentials {
  const parsed = decryptJsonCredentials<N8nStoredCredentials>(payload, encryptionKey);
  if (!parsed.apiKey || !parsed.webhookSecret) {
    throw new Error('Invalid stored n8n credentials');
  }
  return parsed;
}

export type GoogleMapsStoredCredentials = {
  /** Server key for Places / Geocoding / Directions / Distance Matrix. Never returned to browser. */
  apiKey: string;
  /** Optional HTTP-referrer-restricted key for Maps JavaScript API. */
  browserApiKey?: string;
};

export function encryptGoogleMapsCredentials(
  credentials: GoogleMapsStoredCredentials,
  encryptionKey: string,
): string {
  return encryptJsonCredentials(credentials, encryptionKey);
}

export function decryptGoogleMapsCredentials(
  payload: string,
  encryptionKey: string,
): GoogleMapsStoredCredentials {
  const parsed = decryptJsonCredentials<GoogleMapsStoredCredentials>(payload, encryptionKey);
  if (!parsed.apiKey?.trim()) {
    throw new Error('Invalid stored Google Maps credentials');
  }
  return {
    apiKey: parsed.apiKey.trim(),
    browserApiKey: parsed.browserApiKey?.trim() || undefined,
  };
}

/** Gmail OAuth tokens — encrypted with INTEGRATIONS_ENCRYPTION_KEY. */
export type GmailOAuthStoredCredentials = {
  version: 1;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  emailAddress?: string;
  scope?: string;
};

export function encryptGmailCredentials(
  credentials: GmailOAuthStoredCredentials,
  encryptionKey: string,
): string {
  return encryptJsonCredentials(credentials, encryptionKey);
}

export function decryptGmailCredentials(
  payload: string,
  encryptionKey: string,
): GmailOAuthStoredCredentials {
  const parsed = decryptJsonCredentials<GmailOAuthStoredCredentials>(payload, encryptionKey);
  if (!parsed.accessToken?.trim() && !parsed.refreshToken?.trim()) {
    throw new Error('Invalid stored Gmail credentials');
  }
  return {
    version: 1,
    accessToken: parsed.accessToken?.trim() ?? '',
    refreshToken: parsed.refreshToken?.trim() || undefined,
    expiresAt: parsed.expiresAt,
    emailAddress: parsed.emailAddress?.trim() || undefined,
    scope: parsed.scope,
  };
}
