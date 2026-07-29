import jwt from 'jsonwebtoken';

export type PortalAccessTokenPayload = {
  sub: string;
  companyId: string;
  customerId: string;
  sessionId: string;
  permissions: string[];
  tokenType: 'portal';
};

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export function createPortalAccessToken(
  payload: Omit<PortalAccessTokenPayload, 'tokenType'>,
  secret: string,
): { token: string; expiresIn: number } {
  const token = jwt.sign({ ...payload, tokenType: 'portal' }, secret, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });

  return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export function verifyPortalAccessToken(token: string, secret: string): PortalAccessTokenPayload {
  const decoded = jwt.verify(token, secret);

  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid portal access token');
  }

  const { sub, companyId, customerId, sessionId, permissions, tokenType } =
    decoded as PortalAccessTokenPayload;

  if (
    !sub ||
    !companyId ||
    !customerId ||
    !sessionId ||
    !Array.isArray(permissions) ||
    tokenType !== 'portal'
  ) {
    throw new Error('Invalid portal access token payload');
  }

  return { sub, companyId, customerId, sessionId, permissions, tokenType: 'portal' };
}
