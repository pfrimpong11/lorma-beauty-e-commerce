import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma, SaleStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@ApiTags('customers')
@Controller({ path: 'customers', version: '1' })
export class CustomersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMER_VIEW)
  @ApiOperation({ summary: 'Search and list customers' })
  async list(
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
  ) {
    const take = Math.min(Number.parseInt(pageSize, 10) || 25, 100);
    const skip = (Math.max(Number.parseInt(page, 10) || 1, 1) - 1) * take;

    const where: Prisma.CustomerWhereInput = {
      isActive: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, customers] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        // Walk-in first — it is the default selection on the POS.
        orderBy: [{ isWalkIn: 'desc' }, { name: 'asc' }],
        skip,
        take,
        include: { _count: { select: { sales: true } } },
      }),
    ]);

    return {
      data: customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        isWalkIn: c.isWalkIn,
        transactionCount: c._count.sales,
      })),
      meta: { page: Number(page), pageSize: take, total, pages: Math.ceil(total / take) },
    };
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_VIEW)
  @ApiOperation({ summary: 'Customer detail with purchase history' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id } });

    const [aggregate, recent] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { customerId: id, status: { not: SaleStatus.VOIDED } },
        _sum: { total: true },
        _count: true,
        _max: { soldAt: true },
      }),
      this.prisma.sale.findMany({
        where: { customerId: id },
        orderBy: { soldAt: 'desc' },
        take: 20,
        select: {
          id: true,
          receiptNumber: true,
          soldAt: true,
          total: true,
          status: true,
          _count: { select: { items: true } },
        },
      }),
    ]);

    return {
      ...customer,
      stats: {
        totalPurchases: (aggregate._sum.total ?? new Prisma.Decimal(0)).toFixed(2),
        transactionCount: aggregate._count,
        lastPurchaseAt: aggregate._max.soldAt?.toISOString() ?? null,
      },
      recentSales: recent.map((s) => ({
        id: s.id,
        receiptNumber: s.receiptNumber,
        soldAt: s.soldAt.toISOString(),
        total: s.total.toFixed(2),
        status: s.status,
        itemCount: s._count.items,
      })),
    };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMER_MANAGE)
  @ApiOperation({ summary: 'Create a customer' })
  async create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthenticatedUser) {
    const customer = await this.prisma.customer.create({ data: { ...dto } });

    await this.audit.record({
      userId: user.id,
      action: 'CUSTOMER_CREATED',
      entityType: 'Customer',
      entityId: customer.id,
      summary: `${user.firstName} ${user.lastName} added customer ${customer.name}`,
    });

    return customer;
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_MANAGE)
  @ApiOperation({ summary: 'Update a customer' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const existing = await this.prisma.customer.findUniqueOrThrow({ where: { id } });

    // The POS falls back to this row whenever no customer is chosen.
    if (existing.isWalkIn && dto.isActive === false) {
      throw new BadRequestException('The Walk-in Customer cannot be deactivated.');
    }

    const customer = await this.prisma.customer.update({ where: { id }, data: { ...dto } });

    await this.audit.record({
      userId: user.id,
      action: 'CUSTOMER_UPDATED',
      entityType: 'Customer',
      entityId: customer.id,
      summary: `${user.firstName} ${user.lastName} updated customer ${customer.name}`,
    });

    return customer;
  }
}
