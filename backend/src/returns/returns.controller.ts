import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/return.dto';

@ApiTags('returns')
@Controller({ path: 'returns', version: '1' })
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RETURN_VIEW)
  @ApiOperation({ summary: 'Return history' })
  list(@Query('page') page = '1', @Query('pageSize') pageSize = '25') {
    return this.returns.list(Number.parseInt(page, 10), Number.parseInt(pageSize, 10));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RETURN_CREATE)
  @ApiOperation({ summary: 'Process a return and refund against a sale' })
  create(@Body() dto: CreateReturnDto, @CurrentUser() user: AuthenticatedUser) {
    return this.returns.create(dto, user);
  }
}
