import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { ShiftsService } from './shifts.service';
import { CloseShiftDto, OpenShiftDto } from './dto/shift.dto';

@ApiTags('shifts')
@Controller({ path: 'shifts', version: '1' })
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get('current')
  @RequirePermissions(PERMISSIONS.SHIFT_OPEN)
  @ApiOperation({ summary: 'The shift this cashier currently has open' })
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.shifts.current(user);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SHIFT_OPEN)
  @ApiOperation({ summary: 'Shift history' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
  ) {
    return this.shifts.list(user, Number.parseInt(page, 10), Number.parseInt(pageSize, 10));
  }

  @Post('open')
  @RequirePermissions(PERMISSIONS.SHIFT_OPEN)
  @ApiOperation({ summary: 'Open a shift with an opening cash float' })
  open(@Body() dto: OpenShiftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.shifts.open(dto, user);
  }

  @Post(':id/close')
  @RequirePermissions(PERMISSIONS.SHIFT_CLOSE_OWN)
  @ApiOperation({ summary: 'Close a shift and record the cash variance' })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shifts.close(id, dto, user);
  }
}
