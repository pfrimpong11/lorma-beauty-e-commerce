import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, Public, type AuthenticatedUser } from '../common/decorators';
import { AuthService, type LoginResult } from './auth.service';
import { ChangePasswordDto, LoginDto } from './dto/login.dto';

const REFRESH_COOKIE = 'lorma_refresh';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  // Tighter than the global limit: brute-forcing the login form is the
  // attack this endpoint actually faces.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in and receive an access token' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<LoginResult, 'refreshToken'>> {
    const result = await this.auth.validateAndLogin(dto.email, dto.password, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    this.setRefreshCookie(res, result.refreshToken);

    // The refresh token stays in the httpOnly cookie and never reaches JS.
    const { refreshToken: _discarded, ...body } = result;
    return body;
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange the refresh cookie for a new access token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<LoginResult, 'refreshToken'>> {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!token) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    const result = await this.auth.refresh(token);
    this.setRefreshCookie(res, result.refreshToken);

    const { refreshToken: _discarded, ...body } = result;
    return body;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out and clear the refresh cookie' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(user.id, { ip: req.ip });
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @ApiOperation({ summary: 'The signed-in user and their permissions' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change own password' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
    // Every existing session is now invalid, including this one.
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private cookieOptions() {
    const secure = this.config.get<boolean>('cookie.secure') ?? false;

    // Explicit setting wins. Otherwise: SameSite=None when Secure, because
    // the browser and API are usually separate origins — but browsers
    // reject None over plain HTTP, so plain dev falls back to Lax.
    //
    // Behind a same-origin proxy, set COOKIE_SAMESITE=lax: the cookie is
    // first-party there and needs no cross-site allowance.
    const configured = this.config.get<'lax' | 'strict' | 'none' | undefined>(
      'cookie.sameSite',
    );
    const sameSite = configured ?? (secure ? ('none' as const) : ('lax' as const));

    return {
      httpOnly: true,
      sameSite,
      secure,
      domain: this.config.get<string>('cookie.domain'),
      path: '/api/v1/auth',
    };
  }
}
