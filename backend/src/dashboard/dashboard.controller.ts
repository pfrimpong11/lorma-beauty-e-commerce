import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma, SaleStatus } from '@prisma/client';
import { RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { add, ZERO } from '../common/utils/money';

@ApiTags('dashboard')
@Controller({ path: 'dashboard', version: '1' })
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW)
  @ApiOperation({ summary: "Today's figures, inventory health and product performance" })
  async overview(@Query('expiryDays') expiryDays = '30') {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(startOfDay);
    // Monday-based week — Sunday (0) belongs to the week that just ended.
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));

    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

    const expiryWindow = new Date(startOfDay);
    expiryWindow.setDate(expiryWindow.getDate() + (Number.parseInt(expiryDays, 10) || 30));

    const notVoided = { status: { not: SaleStatus.VOIDED } };

    const [today, week, month, itemsToday, byMethod, products, batches, topSellers, slowMovers] =
      await Promise.all([
        this.prisma.sale.aggregate({
          where: { soldAt: { gte: startOfDay }, ...notVoided },
          _sum: { total: true },
          _count: true,
        }),
        this.prisma.sale.aggregate({
          where: { soldAt: { gte: startOfWeek }, ...notVoided },
          _sum: { total: true },
          _count: true,
        }),
        this.prisma.sale.aggregate({
          where: { soldAt: { gte: startOfMonth }, ...notVoided },
          _sum: { total: true },
          _count: true,
        }),
        this.prisma.saleItem.aggregate({
          where: { sale: { soldAt: { gte: startOfDay }, ...notVoided } },
          _sum: { quantity: true },
        }),
        this.prisma.payment.groupBy({
          by: ['method'],
          where: { sale: { soldAt: { gte: startOfDay }, ...notVoided } },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.product.findMany({
          where: { isActive: true },
          select: { id: true, minStockLevel: true, inventory: { select: { quantity: true } } },
        }),
        this.prisma.productBatch.count({
          where: { quantity: { gt: 0 }, expiryDate: { lte: expiryWindow } },
        }),
        this.prisma.saleItem.groupBy({
          by: ['productId', 'productName'],
          where: { sale: { soldAt: { gte: startOfMonth }, ...notVoided } },
          _sum: { quantity: true, lineTotal: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 5,
        }),
        this.prisma.saleItem.groupBy({
          by: ['productId', 'productName'],
          where: { sale: { soldAt: { gte: startOfMonth }, ...notVoided } },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'asc' } },
          take: 5,
        }),
      ]);

    const todayTotal = today._sum.total ?? ZERO();
    const lowStock = products.filter(
      (p) => (p.inventory?.quantity ?? 0) > 0 && (p.inventory?.quantity ?? 0) <= p.minStockLevel,
    ).length;
    const outOfStock = products.filter((p) => (p.inventory?.quantity ?? 0) === 0).length;

    return {
      today: {
        totalSales: todayTotal.toFixed(2),
        transactions: today._count,
        itemsSold: itemsToday._sum.quantity ?? 0,
        averageTransactionValue:
          today._count > 0
            ? todayTotal.div(today._count).toFixed(2)
            : '0.00',
      },
      inventory: {
        totalProducts: products.length,
        lowStock,
        outOfStock,
        expiringSoon: batches,
      },
      sales: {
        today: todayTotal.toFixed(2),
        week: (week._sum.total ?? ZERO()).toFixed(2),
        month: (month._sum.total ?? ZERO()).toFixed(2),
        weekTransactions: week._count,
        monthTransactions: month._count,
        byPaymentMethod: byMethod
          .map((m) => ({
            method: m.method,
            amount: (m._sum.amount ?? ZERO()).toFixed(2),
            count: m._count,
          }))
          .sort((a, b) => Number(b.amount) - Number(a.amount)),
      },
      productPerformance: {
        topSelling: topSellers.map((t) => ({
          productId: t.productId,
          name: t.productName,
          quantitySold: t._sum.quantity ?? 0,
          revenue: (t._sum.lineTotal ?? ZERO()).toFixed(2),
        })),
        slowMoving: slowMovers.map((t) => ({
          productId: t.productId,
          name: t.productName,
          quantitySold: t._sum.quantity ?? 0,
        })),
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
