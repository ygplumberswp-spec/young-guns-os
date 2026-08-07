import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

export type AccessTokenPayload = {
  sub: string;
  companyId: string;
  roleId: string;
  roleName: string;
  sessionId: string;
  permissions: string[];
};

/** Default access token lifetime (~15 minutes). Override via TITAN_ACCESS_TOKEN_TTL_SECONDS. */
export const ACCESS_TOKEN_TTL_SECONDS = resolveAccessTokenTtlSeconds();
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Trusted-device refresh window (up to 30 days). */
export const TRUSTED_DEVICE_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Step-up re-auth window for sensitive actions (5 minutes). */
export const STEP_UP_TOKEN_TTL_SECONDS = 5 * 60;

function resolveAccessTokenTtlSeconds(): number {
  const raw = process.env.TITAN_ACCESS_TOKEN_TTL_SECONDS;
  if (!raw) {
    return 15 * 60;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 60 || parsed > 3600) {
    return 15 * 60;
  }
  return parsed;
}

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

  const { sub, companyId, roleId, roleName, sessionId, permissions } =
    decoded as AccessTokenPayload;

  if (!sub || !companyId || !roleId || !sessionId || !Array.isArray(permissions)) {
    throw new Error('Invalid access token payload');
  }

  return {
    sub,
    companyId,
    roleId,
    roleName: typeof roleName === 'string' ? roleName : 'Member',
    sessionId,
    permissions,
  };
}

export type MfaLoginChallengePayload = {
  purpose: 'mfa_login';
  sub: string;
  companyId: string;
};

const MFA_LOGIN_CHALLENGE_TTL_SECONDS = 5 * 60;

export function createMfaLoginChallengeToken(
  userId: string,
  companyId: string,
  secret: string,
): { token: string; expiresIn: number } {
  const token = jwt.sign(
    { purpose: 'mfa_login', sub: userId, companyId } satisfies MfaLoginChallengePayload,
    secret,
    { expiresIn: MFA_LOGIN_CHALLENGE_TTL_SECONDS },
  );

  return { token, expiresIn: MFA_LOGIN_CHALLENGE_TTL_SECONDS };
}

export function verifyMfaLoginChallengeToken(
  token: string,
  secret: string,
): { userId: string; companyId: string } {
  const decoded = jwt.verify(token, secret);

  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid MFA challenge token');
  }

  const payload = decoded as Partial<MfaLoginChallengePayload>;

  if (payload.purpose !== 'mfa_login' || !payload.sub || !payload.companyId) {
    throw new Error('Invalid MFA challenge token payload');
  }

  return { userId: payload.sub, companyId: payload.companyId };
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}

export type StepUpTokenPayload = {
  purpose: 'step_up';
  sub: string;
  companyId: string;
  sessionId: string;
};

export function createStepUpToken(
  userId: string,
  companyId: string,
  sessionId: string,
  secret: string,
): { token: string; expiresIn: number } {
  const token = jwt.sign(
    { purpose: 'step_up', sub: userId, companyId, sessionId } satisfies StepUpTokenPayload,
    secret,
    { expiresIn: STEP_UP_TOKEN_TTL_SECONDS },
  );
  return { token, expiresIn: STEP_UP_TOKEN_TTL_SECONDS };
}

export function verifyStepUpToken(
  token: string,
  secret: string,
  expected: { userId: string; companyId: string; sessionId: string },
): boolean {
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded !== 'object' || decoded === null) {
      return false;
    }
    const payload = decoded as Partial<StepUpTokenPayload>;
    return (
      payload.purpose === 'step_up' &&
      payload.sub === expected.userId &&
      payload.companyId === expected.companyId &&
      payload.sessionId === expected.sessionId
    );
  } catch {
    return false;
  }
}
