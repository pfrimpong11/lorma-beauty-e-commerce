import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { StockCountsService } from './stock-counts.service';
import {
  AddCountItemDto,
  ApproveStockCountDto,
  ScanStockCountDto,
  SetCountedQuantityDto,
  StartStockCountDto,
} from './dto/stock-count.dto';

@ApiTags('stock-counts')
@Controller({ path: 'stock-counts', version: '1' })
export class StockCountsController {
  constructor(private readonly counts: StockCountsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({ summary: 'Stock count history' })
  list(@Query('page') page = '1', @Query('pageSize') pageSize = '25') {
    return this.counts.list(Number.parseInt(page, 10), Number.parseInt(pageSize, 10));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({ summary: 'A stock count with its lines and variances' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.counts.detail(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.STOCKCOUNT_MANAGE)
  @ApiOperation({ summary: 'Start a stock count' })
  start(@Body() dto: StartStockCountDto, @CurrentUser() user: AuthenticatedUser) {
    return this.counts.start(dto.note, user);
  }

  @Post(':id/scan')
  @RequirePermissions(PERMISSIONS.STOCKCOUNT_MANAGE)
  // Counting is a rapid burst of scans; the global limit would throttle
  // a stock take part-way through.
  @SkipThrottle()
  @ApiOperation({ summary: 'Record one scanned barcode' })
  scan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScanStockCountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.counts.scan(id, dto.barcode, user);
  }

  @Post(':id/items')
  @RequirePermissions(PERMISSIONS.STOCKCOUNT_MANAGE)
  @ApiOperation({ summary: 'Add a product that was not scanned' })
  addItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddCountItemDto) {
    return this.counts.addItem(id, dto.productId, dto.countedQuantity ?? 0);
  }

  @Patch(':id/items/:itemId')
  @RequirePermissions(PERMISSIONS.STOCKCOUNT_MANAGE)
  @ApiOperation({ summary: 'Correct a counted quantity by hand' })
  setQuantity(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: SetCountedQuantityDto,
  ) {
    return this.counts.setQuantity(id, itemId, dto.countedQuantity);
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions(PERMISSIONS.STOCKCOUNT_MANAGE)
  @ApiOperation({ summary: 'Remove a line from the count' })
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.counts.removeItem(id, itemId);
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.STOCKCOUNT_APPROVE)
  @ApiOperation({ summary: 'Approve the count and adjust inventory to it' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveStockCountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.counts.approve(id, dto.note, user);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.STOCKCOUNT_MANAGE)
  @ApiOperation({ summary: 'Abandon a count without touching stock' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.counts.cancel(id, user);
  }
}
