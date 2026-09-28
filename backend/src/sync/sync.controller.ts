import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { SyncService } from './sync.service';
import { PushSyncDto } from './dto/sync.dto';

class ResolveConflictDto {
  @IsString()
  @MinLength(3, { message: 'Describe how the conflict was resolved.' })
  @MaxLength(500)
  note!: string;
}

@ApiTags('sync')
@Controller({ path: 'sync', version: '1' })
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  @RequirePermissions(PERMISSIONS.SALE_CREATE)
  // A till reconnecting after a long outage drains a backlog in bursts;
  // the global limit would throttle its own recovery.
  @SkipThrottle()
  @ApiOperation({ summary: 'Submit queued offline transactions' })
  push(@Body() dto: PushSyncDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sync.push(dto, user);
  }

  @Get('pull')
  @RequirePermissions(PERMISSIONS.PRODUCT_VIEW)
  @ApiOperation({ summary: 'Catalogue changes since the last pull' })
  pull(@Query('since') since?: string) {
    return this.sync.pull(since);
  }

  @Get('status')
  @RequirePermissions(PERMISSIONS.SALE_VIEW)
  @ApiOperation({ summary: 'Sync counters and entries needing attention' })
  status(@Query('deviceId') deviceId?: string) {
    return this.sync.status(deviceId);
  }

  @Post('conflicts/:id/resolve')
  @RequirePermissions(PERMISSIONS.SYNC_RESOLVE_CONFLICT)
  @ApiOperation({ summary: 'Mark a sync conflict as resolved' })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveConflictDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sync.resolve(id, dto.note, user);
  }
}
