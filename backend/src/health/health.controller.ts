import { Controller, Get, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Health endpoints for Docker, Compose and any orchestrator (§37, §47).
 *
 * Deliberately outside the /api prefix and exempt from rate limiting so a
 * probe loop can never throttle itself out of service.
 */
@ApiTags('health')
// VERSION_NEUTRAL keeps these at /health rather than /v1/health, so probes
// stay valid across API versions.
@Controller({ path: 'health', version: VERSION_NEUTRAL })
@SkipThrottle()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness and database readiness' })
  async check(@Res({ passthrough: true }) res: Response): Promise<{
    status: 'ok' | 'degraded';
    uptimeSeconds: number;
    database: 'up' | 'down';
    timestamp: string;
  }> {
    const databaseUp = await this.prisma.isHealthy();

    // Must be non-2xx when the database is unreachable, otherwise Compose's
    // `service_healthy` gate would let the API accept traffic it cannot serve.
    res.status(databaseUp ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: databaseUp ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      database: databaseUp ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
  }

  /** Process is alive — does not touch the database. */
  @Public()
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Ready to serve traffic; fails while the database is unreachable. */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<{
    status: 'ready' | 'not-ready';
  }> {
    const ready = await this.prisma.isHealthy();
    res.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: ready ? 'ready' : 'not-ready' };
  }
}
