import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../common/decorators';
import type { PermissionCode } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';

interface AccessPayload {
  sub: string;
  email: string;
  role: string;
  permissions: PermissionCode[];
}

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  async validate(payload: AccessPayload): Promise<AuthenticatedUser> {
    // Access tokens are short-lived but a deactivated cashier must lose
    // access immediately, not at the end of the token's life.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, firstName: true, lastName: true, roleId: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Your account is no longer active.');
    }

    return {
      id: payload.sub,
      email: payload.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roleId: user.roleId,
      roleName: payload.role,
      permissions: payload.permissions ?? [],
    };
  }
}
