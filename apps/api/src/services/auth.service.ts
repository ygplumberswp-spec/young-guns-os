import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
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
  slugifyCompanyName,
  verifyPassword,
  withUniqueSuffix,
} from '@titan/auth';
import type { AuthSession, AuthUser, InvitePreview } from '@titan/shared';
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

    return this.createSessionForUser(this.db, userId, input.userAgent, input.ipAddress);
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

    return this.createSessionForUser(this.db, userId, userAgent, ipAddress);
  }

  async logout(refreshToken: string): Promise<void> {
    const refreshTokenHash = hashRefreshToken(refreshToken);
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.refreshTokenHash, refreshTokenHash), isNull(sessions.revokedAt)));
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await this.db.query.sessions.findFirst({
      where: and(eq(sessions.refreshTokenHash, refreshTokenHash), isNull(sessions.revokedAt)),
    });

    if (!session || session.expiresAt < new Date()) {
      throw new AuthError('SESSION_EXPIRED', 'Session expired. Please sign in again.');
    }

    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, session.id));

    return this.createSessionForUser(this.db, session.userId);
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

    return this.createSessionForUser(this.db, userId, input.userAgent, input.ipAddress);
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
    userAgent?: string,
    ipAddress?: string,
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

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    const [session] = await db
      .insert(sessions)
      .values({
        userId: user.id,
        companyId: user.companyId,
        refreshTokenHash,
        userAgent,
        ipAddress,
        expiresAt,
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
