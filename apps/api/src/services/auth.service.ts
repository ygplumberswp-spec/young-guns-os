import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import {
  createAccessToken,
  DEFAULT_TEAM_ROLES,
  generateRefreshToken,
  hashInviteToken,
  hashPassword,
  hashRefreshToken,
  COMPANY_OWNER_ROLE_NAME,
  OWNER_ROLE_NAME,
  REFRESH_TOKEN_TTL_MS,
  TRUSTED_DEVICE_REFRESH_TTL_MS,
  slugifyCompanyName,
  verifyPassword,
  withUniqueSuffix,
} from '@titan/auth';
import type { AuthSession, AuthUser, InvitePreview, StaffSessionSummary } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { companies, roles, sessions, userInvites, users } from '@titan/db';

export type AuthServiceConfig = {
  jwtSecret: string;
};

export type SignupInput = {
  companyName: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  userAgent?: string;
  ipAddress?: string;
};

export type LoginInput = {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
};

export type AcceptInviteInput = {
  token: string;
  firstName: string;
  lastName: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
};

export type AuthResult = {
  user: AuthUser;
  session: AuthSession;
  refreshToken: string;
};

export type RefreshInput = {
  refreshToken: string;
  userAgent?: string;
  ipAddress?: string;
  trustedDevice?: boolean;
};

export class AuthService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly config: AuthServiceConfig,
  ) {}

  async signup(input: SignupInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      throw new AuthError('EMAIL_IN_USE', 'Account already exists');
    }

    const passwordHash = await hashPassword(input.password);
    const baseSlug = slugifyCompanyName(input.companyName);
    const slug = withUniqueSuffix(baseSlug, randomBytes(3).toString('hex'));

    const userId = await this.db.transaction(async (tx) => {
      const [company] = await tx
        .insert(companies)
        .values({
          name: input.companyName.trim(),
          slug,
          preferences: {
            timezone: 'Africa/Johannesburg',
            currency: 'ZAR',
            locale: 'en-ZA',
          },
        })
        .returning();

      if (!company) {
        throw new AuthError('SIGNUP_FAILED', 'Unable to create company');
      }

      const createdRoles = await tx
        .insert(roles)
        .values(
          DEFAULT_TEAM_ROLES.map((role) => ({
            companyId: company.id,
            name: role.name,
            permissions: [...role.permissions],
            isSystem: role.isSystem,
          })),
        )
        .returning();

      const ownerRole =
        createdRoles.find((role) => role.name === COMPANY_OWNER_ROLE_NAME) ??
        createdRoles.find((role) => role.name === OWNER_ROLE_NAME);

      if (!ownerRole) {
        throw new AuthError('SIGNUP_FAILED', 'Unable to create company owner role');
      }

      const [user] = await tx
        .insert(users)
        .values({
          companyId: company.id,
          roleId: ownerRole.id,
          email,
          passwordHash,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
        })
        .returning();

      if (!user) {
        throw new AuthError('SIGNUP_FAILED', 'Unable to create admin user');
      }

      return user.id;
    });

    return this.createSessionForUser(this.db, userId, {
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const credentials = await this.verifyLoginCredentials(input);
    return this.issueSessionForUser(
      credentials.userId,
      input.userAgent,
      input.ipAddress,
    );
  }

  async verifyLoginCredentials(
    input: LoginInput,
  ): Promise<{ userId: string; companyId: string }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user || !user.isActive) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const passwordValid = await verifyPassword(input.password, user.passwordHash);

    if (!passwordValid) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    return { userId: user.id, companyId: user.companyId };
  }

  async issueSessionForUser(
    userId: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthResult> {
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));

    return this.createSessionForUser(this.db, userId, { userAgent, ipAddress });
  }

  async logout(refreshToken: string): Promise<void> {
    const refreshTokenHash = hashRefreshToken(refreshToken);
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: 'logout' })
      .where(and(eq(sessions.refreshTokenHash, refreshTokenHash), isNull(sessions.revokedAt)));
  }

  async refresh(input: RefreshInput | string): Promise<AuthResult> {
    const normalized =
      typeof input === 'string'
        ? { refreshToken: input }
        : input;
    const refreshTokenHash = hashRefreshToken(normalized.refreshToken);
    const now = new Date();

    const activeSession = await this.db.query.sessions.findFirst({
      where: and(eq(sessions.refreshTokenHash, refreshTokenHash), isNull(sessions.revokedAt)),
    });

    if (activeSession) {
      if (activeSession.expiresAt < now) {
        await this.db
          .update(sessions)
          .set({ revokedAt: now, revokedReason: 'expired' })
          .where(eq(sessions.id, activeSession.id));
        throw new AuthError('SESSION_EXPIRED', 'Session expired. Please sign in again.');
      }

      await this.db
        .update(sessions)
        .set({ revokedAt: now, revokedReason: 'rotated' })
        .where(eq(sessions.id, activeSession.id));

      return this.createSessionForUser(this.db, activeSession.userId, {
        userAgent: normalized.userAgent ?? activeSession.userAgent ?? undefined,
        ipAddress: normalized.ipAddress ?? activeSession.ipAddress ?? undefined,
        trustedDevice: normalized.trustedDevice ?? activeSession.isTrustedDevice,
      });
    }

    const revokedSession = await this.db.query.sessions.findFirst({
      where: and(eq(sessions.refreshTokenHash, refreshTokenHash), isNotNull(sessions.revokedAt)),
    });

    if (revokedSession) {
      await this.revokeAllUserSessions(revokedSession.userId, 'refresh_token_reuse');
      throw new AuthError(
        'SESSION_REUSE_DETECTED',
        'Session invalidated for security. Please sign in again.',
      );
    }

    throw new AuthError('SESSION_INVALID', 'Session invalid. Please sign in again.');
  }

  async verifyPasswordForStepUp(userId: string, password: string): Promise<boolean> {
    const user = await this.db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.isActive, true)),
    });

    if (!user) {
      return false;
    }

    return verifyPassword(password, user.passwordHash);
  }

  async listMySessions(userId: string, currentSessionId?: string): Promise<StaffSessionSummary[]> {
    const rows = await this.db.query.sessions.findMany({
      where: and(eq(sessions.userId, userId), isNull(sessions.revokedAt)),
      orderBy: [desc(sessions.createdAt)],
      with: { user: true },
    });

    const now = Date.now();
    return rows
      .filter((row) => row.expiresAt.getTime() >= now)
      .map((row) => toStaffSessionSummary(row, currentSessionId));
  }

  async revokeMySession(userId: string, sessionId: string): Promise<void> {
    const session = await this.db.query.sessions.findFirst({
      where: and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)),
    });

    if (!session) {
      throw new AuthError('SESSION_NOT_FOUND', 'Session not found');
    }

    await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: 'user_revoked' })
      .where(eq(sessions.id, sessionId));
  }

  async revokeAllOtherMySessions(userId: string, currentSessionId: string): Promise<number> {
    const active = await this.listMySessions(userId, currentSessionId);
    const toRevoke = active.filter((session) => !session.isCurrent);

    for (const session of toRevoke) {
      await this.revokeMySession(userId, session.id);
    }

    return toRevoke.length;
  }

  async revokeAllUserSessions(userId: string, reason: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  async touchSessionActivity(sessionId: string, userId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ lastActivityAt: new Date() })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  async getInvitePreview(token: string): Promise<InvitePreview> {
    const invite = await this.findActiveInvite(token);

    if (!invite.company || !invite.role) {
      throw new AuthError('INVITE_INVALID', 'Invite is invalid');
    }

    return {
      email: invite.email,
      companyName: invite.company.name,
      roleName: invite.role.name,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async acceptInvite(input: AcceptInviteInput): Promise<AuthResult> {
    const invite = await this.findActiveInvite(input.token);

    if (!invite.company || !invite.role) {
      throw new AuthError('INVITE_INVALID', 'Invite is invalid');
    }

    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.email, invite.email),
    });

    if (existingUser) {
      throw new AuthError('EMAIL_IN_USE', 'Account already exists');
    }

    const passwordHash = await hashPassword(input.password);

    const userId = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          companyId: invite.companyId,
          roleId: invite.roleId,
          email: invite.email,
          passwordHash,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
        })
        .returning();

      if (!user) {
        throw new AuthError('INVITE_FAILED', 'Unable to create user from invite');
      }

      await tx
        .update(userInvites)
        .set({ acceptedAt: new Date() })
        .where(eq(userInvites.id, invite.id));

      return user.id;
    });

    return this.createSessionForUser(this.db, userId, {
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });
  }

  async getUserById(userId: string): Promise<AuthUser | null> {
    const user = await this.db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.isActive, true)),
      with: {
        company: true,
        role: true,
      },
    });

    if (!user?.company || !user.role) {
      return null;
    }

    return toAuthUser(user, user.company.name, user.role.name, user.role.permissions);
  }

  async validateSession(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.db.query.sessions.findFirst({
      where: and(
        eq(sessions.id, sessionId),
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
      ),
    });

    return Boolean(session && session.expiresAt >= new Date());
  }

  private async findActiveInvite(token: string) {
    const tokenHash = hashInviteToken(token);
    const invite = await this.db.query.userInvites.findFirst({
      where: and(
        eq(userInvites.tokenHash, tokenHash),
        isNull(userInvites.acceptedAt),
        isNull(userInvites.revokedAt),
      ),
      with: {
        company: true,
        role: true,
      },
    });

    if (!invite || invite.expiresAt < new Date()) {
      throw new AuthError('INVITE_INVALID', 'Invite is invalid or expired');
    }

    return invite;
  }

  private async createSessionForUser(
    db: DatabaseClient,
    userId: string,
    options?: {
      userAgent?: string;
      ipAddress?: string;
      trustedDevice?: boolean;
    },
  ): Promise<AuthResult> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        company: true,
        role: true,
      },
    });

    if (!user?.company || !user.role) {
      throw new AuthError('USER_NOT_FOUND', 'User not found');
    }

    if (!user.isActive) {
      throw new AuthError('ACCOUNT_DISABLED', 'Account is disabled. Contact your administrator.');
    }

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const trustedDevice = options?.trustedDevice === true;
    const ttlMs = trustedDevice ? TRUSTED_DEVICE_REFRESH_TTL_MS : REFRESH_TOKEN_TTL_MS;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const [session] = await db
      .insert(sessions)
      .values({
        userId: user.id,
        companyId: user.companyId,
        refreshTokenHash,
        userAgent: options?.userAgent,
        ipAddress: options?.ipAddress,
        expiresAt,
        lastActivityAt: now,
        isTrustedDevice: trustedDevice,
      })
      .returning();

    if (!session) {
      throw new AuthError('SESSION_FAILED', 'Unable to create session');
    }

    const { token, expiresIn } = createAccessToken(
      {
        sub: user.id,
        companyId: user.companyId,
        roleId: user.roleId,
        roleName: user.role.name,
        sessionId: session.id,
        permissions: user.role.permissions,
      },
      this.config.jwtSecret,
    );

    return {
      user: toAuthUser(user, user.company.name, user.role.name, user.role.permissions),
      session: { accessToken: token, expiresIn },
      refreshToken,
    };
  }
}

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

function toAuthUser(
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    companyId: string;
    roleId: string;
  },
  companyName: string,
  roleName: string,
  permissions: string[],
): AuthUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    companyId: user.companyId,
    companyName,
    roleId: user.roleId,
    roleName,
    permissions,
  };
}

function toStaffSessionSummary(
  row: {
    id: string;
    userId: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
    expiresAt: Date;
    lastActivityAt: Date | null;
    isTrustedDevice: boolean;
    user?: { firstName: string; lastName: string } | null;
  },
  currentSessionId?: string,
): StaffSessionSummary {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user ? `${row.user.firstName} ${row.user.lastName}`.trim() : 'Unknown user',
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
    isTrustedDevice: row.isTrustedDevice,
    isCurrent: currentSessionId ? row.id === currentSessionId : false,
  };
}
