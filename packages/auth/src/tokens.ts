import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

export type AccessTokenPayload = {
  sub: string;
  companyId: string;
  roleId: string;
  sessionId: string;
  permissions: string[];
};

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createAccessToken(
  payload: AccessTokenPayload,
  secret: string,
): { token: string; expiresIn: number } {
  const token = jwt.sign(payload, secret, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });

  return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  const decoded = jwt.verify(token, secret);

  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid access token');
  }

  const { sub, companyId, roleId, sessionId, permissions } = decoded as AccessTokenPayload;

  if (!sub || !companyId || !roleId || !sessionId || !Array.isArray(permissions)) {
    throw new Error('Invalid access token payload');
  }

  return { sub, companyId, roleId, sessionId, permissions };
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}
