import { Injectable } from '@nestjs/common';
import { Prisma, SaleStatus, ShiftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { add, ZERO } from '../common/utils/money';

export interface DateRange {
  from?: string;
  to?: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  /** Right-align and format as money in exports. */
  money?: boolean;
  numeric?: boolean;
}

export interface ReportResult {
  title: string;
  range: { from: string | null; to: string | null };
  generatedAt: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  totals?: Record<string, string | number>;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private window(range: DateRange): { gte?: Date; lte?: Date } {
    const filter: { gte?: Date; lte?: Date } = {};
    if (range.from) filter.gte = new Date(`${range.from}T00:00:00.000Z`);
    // Inclusive of the whole end day — a report "to 21 Sept" must contain
    // sales made at 21:45 on the 21st.
    if (range.to) filter.lte = new Date(`${range.to}T23:59:59.999Z`);
    return filter;
  }

  private meta(title: string, range: DateRange) {
    return {
      title,
      range: { from: range.from ?? null, to: range.to ?? null },
      generatedAt: new Date().toISOString(),
    };
  }

  async sales(range: DateRange): Promise<ReportResult> {
    const soldAt = this.window(range);

    const items = await this.prisma.saleItem.findMany({
      where: {
        sale: {
          ...(Object.keys(soldAt).length ? { soldAt } : {}),
          status: { not: SaleStatus.VOIDED },
        },
      },
      orderBy: { sale: { soldAt: 'desc' } },
      include: {
        sale: {
          select: {
            receiptNumber: true,
            soldAt: true,
            cashier: { select: { firstName: true, lastName: true } },
            payments: { select: { method: true } },
          },
        },
      },
    });

    let total = ZERO();
    const rows = items.map((i) => {
      total = add(total, i.lineTotal);
      return {
        date: i.sale.soldAt.toISOString().slice(0, 10),
        receiptNumber: i.sale.receiptNumber,
        product: i.productName,
        quantity: i.quantity,
        amount: i.lineTotal.toFixed(2),
        cashier: `${i.sale.cashier.firstName} ${i.sale.cashier.lastName}`,
        paymentMethod: i.sale.payments.map((p) => p.method).join(', ') || '—',
      };
    });

    return {
      ...this.meta('Sales Report', range),
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'receiptNumber', label: 'Receipt' },
        { key: 'product', label: 'Product' },
        { key: 'quantity', label: 'Qty', numeric: true },
        { key: 'amount', label: 'Amount', money: true },
        { key: 'cashier', label: 'Cashier' },
        { key: 'paymentMethod', label: 'Payment' },
      ],
      rows,
      totals: { amount: total.toFixed(2), lines: rows.length },
    };
  }

  async inventory(range: DateRange): Promise<ReportResult> {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { inventory: true },
    });

    let stockValue = ZERO();
    const rows = products.map((p) => {
      const qty = p.inventory?.quantity ?? 0;
      const value = p.costPrice.mul(qty);
      stockValue = add(stockValue, value);
      return {
        product: p.name,
        sku: p.sku,
        currentStock: qty,
        costPrice: p.costPrice.toFixed(2),
        sellingPrice: p.sellingPrice.toFixed(2),
        stockValue: value.toFixed(2),
        status: qty === 0 ? 'Out of stock' : qty <= p.minStockLevel ? 'Low stock' : 'OK',
      };
    });

    return {
      ...this.meta('Inventory Report', range),
      columns: [
        { key: 'product', label: 'Product' },
        { key: 'sku', label: 'SKU' },
        { key: 'currentStock', label: 'Stock', numeric: true },
        { key: 'costPrice', label: 'Cost', money: true },
        { key: 'sellingPrice', label: 'Price', money: true },
        { key: 'stockValue', label: 'Stock Value', money: true },
        { key: 'status', label: 'Status' },
      ],
      rows,
      totals: { stockValue: stockValue.toFixed(2), products: rows.length },
    };
  }

  async productSales(range: DateRange): Promise<ReportResult> {
    const soldAt = this.window(range);

    const grouped = await this.prisma.saleItem.groupBy({
      by: ['productId', 'productName', 'sku'],
      where: {
        sale: {
          ...(Object.keys(soldAt).length ? { soldAt } : {}),
          status: { not: SaleStatus.VOIDED },
        },
      },
      _sum: { quantity: true, lineTotal: true },
      _count: true,
      orderBy: { _sum: { lineTotal: 'desc' } },
    });

    let revenue = ZERO();
    const rows = grouped.map((g) => {
      const amount = g._sum.lineTotal ?? ZERO();
      revenue = add(revenue, amount);
      return {
        product: g.productName,
        sku: g.sku,
        quantitySold: g._sum.quantity ?? 0,
        revenue: amount.toFixed(2),
        transactions: g._count,
      };
    });

    return {
      ...this.meta('Product Sales Report', range),
      columns: [
        { key: 'product', label: 'Product' },
        { key: 'sku', label: 'SKU' },
        { key: 'quantitySold', label: 'Qty Sold', numeric: true },
        { key: 'revenue', label: 'Revenue', money: true },
        { key: 'transactions', label: 'Transactions', numeric: true },
      ],
      rows,
      totals: { revenue: revenue.toFixed(2), products: rows.length },
    };
  }

  async payments(range: DateRange): Promise<ReportResult> {
    const soldAt = this.window(range);

    const grouped = await this.prisma.payment.groupBy({
      by: ['method'],
      where: {
        sale: {
          ...(Object.keys(soldAt).length ? { soldAt } : {}),
          status: { not: SaleStatus.VOIDED },
        },
      },
      _sum: { amount: true },
      _count: true,
    });

    let total = ZERO();
    for (const g of grouped) total = add(total, g._sum.amount ?? ZERO());

    const rows = grouped
      .map((g) => {
        const amount = g._sum.amount ?? ZERO();
        return {
          method: g.method.replace(/_/g, ' '),
          transactions: g._count,
          amount: amount.toFixed(2),
          share: total.isZero() ? '0.0%' : `${amount.div(total).mul(100).toFixed(1)}%`,
        };
      })
      .sort((a, b) => Number(b.amount) - Number(a.amount));

    return {
      ...this.meta('Payment Report', range),
      columns: [
        { key: 'method', label: 'Payment Method' },
        { key: 'transactions', label: 'Transactions', numeric: true },
        { key: 'amount', label: 'Amount', money: true },
        { key: 'share', label: 'Share' },
      ],
      rows,
      totals: { amount: total.toFixed(2) },
    };
  }

  async shifts(range: DateRange): Promise<ReportResult> {
    const openedAt = this.window(range);

    const shifts = await this.prisma.shift.findMany({
      where: Object.keys(openedAt).length ? { openedAt } : {},
      orderBy: { openedAt: 'desc' },
      include: {
        cashier: { select: { firstName: true, lastName: true } },
        transactions: { select: { type: true, amount: true, method: true } },
      },
    });

    let varianceTotal = ZERO();
    const rows = shifts.map((s) => {
      const sales = s.transactions
        .filter((t) => t.type === 'SALE')
        .reduce((sum, t) => add(sum, t.amount), ZERO());
      if (s.variance) varianceTotal = add(varianceTotal, s.variance);

      return {
        shiftNumber: s.shiftNumber,
        cashier: `${s.cashier.firstName} ${s.cashier.lastName}`,
        openedAt: s.openedAt.toISOString().slice(0, 16).replace('T', ' '),
        openingCash: s.openingCash.toFixed(2),
        sales: sales.toFixed(2),
        expectedCash: s.expectedCash?.toFixed(2) ?? '—',
        actualCash: s.closingCash?.toFixed(2) ?? '—',
        variance: s.variance?.toFixed(2) ?? '—',
        status: s.status === ShiftStatus.OPEN ? 'Open' : 'Closed',
      };
    });

    return {
      ...this.meta('Shift Report', range),
      columns: [
        { key: 'shiftNumber', label: 'Shift' },
        { key: 'cashier', label: 'Cashier' },
        { key: 'openedAt', label: 'Opened' },
        { key: 'openingCash', label: 'Opening', money: true },
        { key: 'sales', label: 'Sales', money: true },
        { key: 'expectedCash', label: 'Expected', money: true },
        { key: 'actualCash', label: 'Actual', money: true },
        { key: 'variance', label: 'Variance', money: true },
        { key: 'status', label: 'Status' },
      ],
      rows,
      totals: { variance: varianceTotal.toFixed(2), shifts: rows.length },
    };
  }

  async byKey(key: string, range: DateRange): Promise<ReportResult> {
    switch (key) {
      case 'sales':
        return this.sales(range);
      case 'inventory':
        return this.inventory(range);
      case 'product-sales':
        return this.productSales(range);
      case 'payments':
        return this.payments(range);
      case 'shifts':
        return this.shifts(range);
      default:
        throw new Prisma.PrismaClientKnownRequestError('Unknown report', {
          code: 'P2025',
          clientVersion: '6',
        });
    }
  }
}
