import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/decorators';
import type { PermissionCode } from '../common/permissions';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends TokenPair {
  user: AuthenticatedUser & { mustChangePassword: boolean };
}

interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  permissions: PermissionCode[];
}

interface RefreshTokenPayload {
  sub: string;
  /** Bumped on password change / forced logout to invalidate old tokens. */
  tv: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async validateAndLogin(
    email: string,
    password: string,
    context: { ip?: string | null; userAgent?: string | null },
  ): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    // Same message and comparable timing whether the email is unknown, the
    // password is wrong, or the account is deactivated — the login form must
    // not become an account-enumeration oracle.
    const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const passwordMatches = await bcrypt.compare(password, hash);

    if (!user || !passwordMatches || !user.isActive) {
      if (user && !user.isActive) {
        this.logger.warn(`Login attempt on deactivated account: ${user.id}`);
      }
      await this.audit.record({
        userId: user?.id ?? null,
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user?.id ?? null,
        summary: `Failed login attempt for ${email}`,
        ipAddress: context.ip,
        userAgent: context.userAgent,
      });
      throw new UnauthorizedException('Incorrect email or password.');
    }

    const permissions = user.role.permissions.map((rp) => rp.permission.code as PermissionCode);

    const [tokens] = await Promise.all([
      this.issueTokens(user.id, user.email, user.role.name, permissions, user.tokenVersion),
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    await this.audit.record({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      summary: `${user.firstName} ${user.lastName} signed in`,
      ipAddress: context.ip,
      userAgent: context.userAgent,
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roleId: user.roleId,
        roleName: user.role.name,
        permissions,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async refresh(refreshToken: string): Promise<LoginResult> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    const permissions = user.role.permissions.map((rp) => rp.permission.code as PermissionCode);
    const tokens = await this.issueTokens(
      user.id,
      user.email,
      user.role.name,
      permissions,
      user.tokenVersion,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roleId: user.roleId,
        roleName: user.role.name,
        permissions,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Your current password is incorrect.');
    }

    const rounds = this.config.get<number>('bcryptRounds') ?? 12;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(newPassword, rounds),
        mustChangePassword: false,
        // Invalidates every refresh token issued before this change.
        tokenVersion: { increment: 1 },
      },
    });

    await this.audit.record({
      userId,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: userId,
      summary: `${user.firstName} ${user.lastName} changed their password`,
    });
  }

  async logout(userId: string, context: { ip?: string | null }): Promise<void> {
    await this.audit.record({
      userId,
      action: 'LOGOUT',
      entityType: 'User',
      entityId: userId,
      summary: 'Signed out',
      ipAddress: context.ip,
    });
  }

  private async issueTokens(
    userId: string,
    email: string,
    roleName: string,
    permissions: PermissionCode[],
    tokenVersion: number,
  ): Promise<TokenPair> {
    const accessPayload: AccessTokenPayload = {
      sub: userId,
      email,
      role: roleName,
      permissions,
    };
    const refreshPayload: RefreshTokenPayload = { sub: userId, tv: tokenVersion };

    // `expiresIn` is typed as the `ms` StringValue template union, which a
    // config-sourced string cannot satisfy structurally. The values are
    // validated at boot, so assert rather than widen the config types.
    const signOptions = (secret: string, expiresIn: string): JwtSignOptions =>
      ({ secret, expiresIn }) as JwtSignOptions;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        accessPayload,
        signOptions(
          this.config.getOrThrow<string>('jwt.accessSecret'),
          this.config.get<string>('jwt.accessTtl') ?? '15m',
        ),
      ),
      this.jwt.signAsync(
        refreshPayload,
        signOptions(
          this.config.getOrThrow<string>('jwt.refreshSecret'),
          this.config.get<string>('jwt.refreshTtl') ?? '7d',
        ),
      ),
    ]);

    return { accessToken, refreshToken };
  }
}
