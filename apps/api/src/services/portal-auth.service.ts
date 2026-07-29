import { and, eq, isNull } from 'drizzle-orm';
import {
  createPortalAccessToken,
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  verifyPassword,
} from '@titan/auth';
import type { PortalAuthSession, PortalAuthUser } from '@titan/shared';
import { isPortalAccessPermission } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  companies,
  customers,
  portalSessions,
  portalUserPermissions,
  portalUsers,
} from '@titan/db';

export type PortalAuthServiceConfig = {
  jwtSecret: string;
};

export type PortalLoginInput = {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
};

export type PortalAuthResult = {
  user: PortalAuthUser;
  session: PortalAuthSession;
  refreshToken: string;
};

export class PortalAuthService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly config: PortalAuthServiceConfig,
  ) {}

  async login(input: PortalLoginInput): Promise<PortalAuthResult> {
    const email = input.email.trim().toLowerCase();
    const portalUser = await this.db.query.portalUsers.findFirst({
      where: eq(portalUsers.email, email),
      with: {
        company: true,
        customer: true,
        permissions: true,
      },
    });

    if (!portalUser || !portalUser.isActive || !portalUser.company || !portalUser.customer) {
      throw new PortalAuthError('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const passwordValid = await verifyPassword(input.password, portalUser.passwordHash);

    if (!passwordValid) {
      throw new PortalAuthError('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    await this.db
      .update(portalUsers)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(portalUsers.id, portalUser.id));

    return this.createSessionForPortalUser(
      portalUser.id,
      input.userAgent,
      input.ipAddress,
    );
  }

  async logout(refreshToken: string): Promise<void> {
    const refreshTokenHash = hashRefreshToken(refreshToken);
    await this.db
      .update(portalSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(portalSessions.refreshTokenHash, refreshTokenHash), isNull(portalSessions.revokedAt)),
      );
  }

  async refresh(refreshToken: string): Promise<PortalAuthResult> {
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await this.db.query.portalSessions.findFirst({
      where: and(
        eq(portalSessions.refreshTokenHash, refreshTokenHash),
        isNull(portalSessions.revokedAt),
      ),
    });

    if (!session || session.expiresAt < new Date()) {
      throw new PortalAuthError('SESSION_EXPIRED', 'Session expired. Please sign in again.');
    }

    await this.db
      .update(portalSessions)
      .set({ revokedAt: new Date() })
      .where(eq(portalSessions.id, session.id));

    return this.createSessionForPortalUser(session.portalUserId);
  }

  async getPortalUserById(portalUserId: string): Promise<PortalAuthUser | null> {
    const portalUser = await this.db.query.portalUsers.findFirst({
      where: and(eq(portalUsers.id, portalUserId), eq(portalUsers.isActive, true)),
      with: {
        company: true,
        customer: true,
        permissions: true,
      },
    });

    if (!portalUser?.company || !portalUser.customer) {
      return null;
    }

    return toPortalAuthUser(portalUser);
  }

  async validateSession(sessionId: string, portalUserId: string): Promise<boolean> {
    const session = await this.db.query.portalSessions.findFirst({
      where: and(
        eq(portalSessions.id, sessionId),
        eq(portalSessions.portalUserId, portalUserId),
        isNull(portalSessions.revokedAt),
      ),
    });

    return Boolean(session && session.expiresAt >= new Date());
  }

  private async createSessionForPortalUser(
    portalUserId: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<PortalAuthResult> {
    const portalUser = await this.db.query.portalUsers.findFirst({
      where: eq(portalUsers.id, portalUserId),
      with: {
        company: true,
        customer: true,
        permissions: true,
      },
    });

    if (!portalUser?.company || !portalUser.customer || !portalUser.isActive) {
      throw new PortalAuthError('USER_NOT_FOUND', 'Portal user not found');
    }

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    const [session] = await this.db
      .insert(portalSessions)
      .values({
        portalUserId: portalUser.id,
        companyId: portalUser.companyId,
        customerId: portalUser.customerId,
        refreshTokenHash,
        userAgent,
        ipAddress,
        expiresAt,
      })
      .returning();

    if (!session) {
      throw new PortalAuthError('SESSION_FAILED', 'Unable to create portal session');
    }

    const permissions = portalUser.permissions
      .map((item: { permission: string }) => item.permission)
      .filter(isPortalAccessPermission);

    const { token, expiresIn } = createPortalAccessToken(
      {
        sub: portalUser.id,
        companyId: portalUser.companyId,
        customerId: portalUser.customerId,
        sessionId: session.id,
        permissions,
      },
      this.config.jwtSecret,
    );

    return {
      user: toPortalAuthUser(portalUser),
      session: { accessToken: token, expiresIn },
      refreshToken,
    };
  }
}

export class PortalAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PortalAuthError';
  }
}

function toPortalAuthUser(
  portalUser: typeof portalUsers.$inferSelect & {
    company: typeof companies.$inferSelect;
    customer: typeof customers.$inferSelect;
    permissions: Array<typeof portalUserPermissions.$inferSelect>;
  },
): PortalAuthUser {
  return {
    id: portalUser.id,
    email: portalUser.email,
    firstName: portalUser.firstName,
    lastName: portalUser.lastName,
    companyId: portalUser.companyId,
    companyName: portalUser.company.name,
    customerId: portalUser.customerId,
    customerName: portalUser.customer.name,
    permissions: portalUser.permissions
      .map((item: { permission: string }) => item.permission)
      .filter(isPortalAccessPermission),
  };
}

export { hashPassword };
