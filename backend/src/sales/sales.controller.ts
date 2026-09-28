import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma, SaleOrigin } from '@prisma/client';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('sales')
@Controller({ path: 'sales', version: '1' })
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @RequirePermissions(PERMISSIONS.SALE_CREATE)
  @ApiOperation({ summary: 'Complete a sale' })
  create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: AuthenticatedUser,
    // Supplying this header makes the call idempotent: a retry after a
    // timeout returns the original sale instead of creating a second one.
    @Headers('x-idempotency-key') idempotencyKey?: string,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return this.sales.createSale(
      { ...dto, deviceId: dto.deviceId ?? deviceId },
      {
        user,
        idempotencyKey: idempotencyKey || undefined,
        origin: idempotencyKey ? SaleOrigin.OFFLINE_SYNCED : SaleOrigin.ONLINE,
      },
    );
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SALE_VIEW)
  @ApiOperation({ summary: 'List sales, newest first' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('search') search?: string,
  ) {
    const take = Math.min(Number.parseInt(pageSize, 10) || 20, 100);
    const skip = (Math.max(Number.parseInt(page, 10) || 1, 1) - 1) * take;

    // A cashier sees their own sales; viewing everyone's needs sale.view_all.
    const scope: Prisma.SaleWhereInput = user.permissions.includes(PERMISSIONS.SALE_VIEW_ALL)
      ? {}
      : { cashierId: user.id };

    /*
     * Receipt lookup at the counter.
     *
     * A cashier holding a printed slip types whatever is quickest —
     * "LMB-000018", "000018" or just "18" — so the match is a contains,
     * not an equals. Customer name is included because the other common
     * case is "the lady who bought the serum this morning".
     */
    const term = search?.trim();
    const where: Prisma.SaleWhereInput = term
      ? {
          ...scope,
          OR: [
            { receiptNumber: { contains: term, mode: 'insensitive' } },
            { customer: { name: { contains: term, mode: 'insensitive' } } },
          ],
        }
      : scope;

    const [total, sales] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        orderBy: { soldAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          receiptNumber: true,
          soldAt: true,
          status: true,
          origin: true,
          total: true,
          cashier: { select: { firstName: true, lastName: true } },
          customer: { select: { name: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    return {
      data: sales.map((s) => ({
        id: s.id,
        receiptNumber: s.receiptNumber,
        soldAt: s.soldAt.toISOString(),
        status: s.status,
        origin: s.origin,
        total: s.total.toFixed(2),
        itemCount: s._count.items,
        cashier: `${s.cashier.firstName} ${s.cashier.lastName}`,
        customer: s.customer?.name ?? 'Walk-in Customer',
      })),
      meta: { page: Number(page), pageSize: take, total, pages: Math.ceil(total / take) },
    };
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SALE_VIEW)
  @ApiOperation({ summary: 'Full sale detail, for receipts and returns' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const sale = await this.prisma.sale.findUniqueOrThrow({
      where: { id },
      include: {
        items: true,
        payments: true,
        customer: { select: { id: true, name: true, phone: true, isWalkIn: true } },
        cashier: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return {
      ...sale,
      subtotal: sale.subtotal.toFixed(2),
      discountAmount: sale.discountAmount.toFixed(2),
      total: sale.total.toFixed(2),
      amountRefunded: sale.amountRefunded.toFixed(2),
      discountValue: sale.discountValue.toFixed(2),
      taxAmount: sale.taxAmount.toFixed(2),
      items: sale.items.map((i) => ({
        ...i,
        unitPrice: i.unitPrice.toFixed(2),
        unitCost: i.unitCost.toFixed(2),
        discountAmount: i.discountAmount.toFixed(2),
        lineTotal: i.lineTotal.toFixed(2),
      })),
      payments: sale.payments.map((p) => ({
        ...p,
        amount: p.amount.toFixed(2),
        amountTendered: p.amountTendered?.toFixed(2) ?? null,
        changeGiven: p.changeGiven?.toFixed(2) ?? null,
      })),
    };
  }
}
