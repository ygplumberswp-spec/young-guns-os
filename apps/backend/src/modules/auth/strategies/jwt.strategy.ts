import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';

interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        branches: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    const permissions = user.roles.flatMap((ur) =>
      ur.role.permissions.map((rp) => `${rp.permission.resource}:${rp.permission.action}`),
    );

    return {
      id: user.id,
      email: user.email,
      organizationId: user.organizationId,
      firstName: user.firstName,
      lastName: user.lastName,
      permissions,
      branches: user.branches.map((ub) => ub.branchId),
    };
  }
}
