import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCK_DURATION_MINUTES = 30;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        organizationId: dto.organizationId,
      },
    });

    return this.generateTokenPair(user.id, user.email, user.organizationId);
  }

  async login(dto: LoginDto, userAgent?: string, ipAddress?: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException(
        'Account locked due to too many failed attempts. Try again later.',
      );
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      const failedCount = user.failedLoginCount + 1;
      const updateData: Record<string, unknown> = { failedLoginCount: failedCount };

      if (failedCount >= this.MAX_LOGIN_ATTEMPTS) {
        updateData.lockedUntil = new Date(
          Date.now() + this.LOCK_DURATION_MINUTES * 60 * 1000,
        );
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const tokens = await this.generateTokenPair(
      user.id,
      user.email,
      user.organizationId,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userAgent,
        ipAddress,
      },
    });

    return tokens;
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.generateTokenPair(
      stored.user.id,
      stored.user.email,
      stored.user.organizationId,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: stored.user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return tokens;
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, token: refreshToken },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.redisService.del(`user:${userId}:permissions`);
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (user && (await bcrypt.compare(password, user.passwordHash))) {
      return user;
    }
    return null;
  }

  private async generateTokenPair(
    userId: string,
    email: string,
    organizationId: string,
  ): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: userId,
      email,
      organizationId,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = uuidv4();

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
    };
  }
}
