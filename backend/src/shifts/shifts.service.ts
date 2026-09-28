import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  PaymentMethod,
  Prisma,
  ShiftStatus,
  ShiftTransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CounterService } from '../common/services/counter.service';
import { add, money, subtract, ZERO } from '../common/utils/money';
import type { AuthenticatedUser } from '../common/decorators';
import type { CloseShiftDto, OpenShiftDto } from './dto/shift.dto';

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly counters: CounterService,
  ) {}

  async open(dto: OpenShiftDto, user: AuthenticatedUser) {
    const existing = await this.prisma.shift.findFirst({
      where: { cashierId: user.id, status: ShiftStatus.OPEN },
      select: { shiftNumber: true, openedAt: true },
    });

    // §51.15. The partial unique index in the database is the real guard;
    // this check exists to return a helpful message rather than a conflict.
    if (existing) {
      throw new ConflictException(
        `You already have shift ${existing.shiftNumber} open. Close it before opening another.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const shiftNumber = await this.counters.next(tx, 'shift');

      const shift = await tx.shift.create({
        data: {
          shiftNumber,
          cashierId: user.id,
          openingCash: money(dto.openingCash),
          notes: dto.notes,
        },
      });

      await this.audit.recordInTransaction(tx, {
        userId: user.id,
        action: 'SHIFT_OPENED',
        entityType: 'Shift',
        entityId: shift.id,
        summary: `${user.firstName} ${user.lastName} opened shift ${shiftNumber} with ${shift.openingCash.toFixed(2)} opening cash`,
      });

      return this.present(shift, await this.tally(tx, shift.id), shift.openingCash);
    });
  }

  async close(shiftId: string, dto: CloseShiftDto, user: AuthenticatedUser) {
    const shift = await this.prisma.shift.findUniqueOrThrow({
      where: { id: shiftId },
      include: { cashier: { select: { firstName: true, lastName: true } } },
    });

    if (shift.status === ShiftStatus.CLOSED) {
      throw new BadRequestException('That shift is already closed.');
    }

    const isOwn = shift.cashierId === user.id;
    if (!isOwn && !user.permissions.includes('shift.close_any')) {
      throw new BadRequestException('You can only close your own shift.');
    }

    const threshold = await this.varianceThreshold();

    return this.prisma.$transaction(async (tx) => {
      const tally = await this.tally(tx, shiftId);

      // Only cash affects the drawer. Mobile money and card are recorded
      // for the shift report but never counted as expected cash.
      const expectedCash = add(shift.openingCash, tally.byMethod.CASH ?? ZERO());
      const closingCash = money(dto.closingCash);
      const variance = subtract(closingCash, expectedCash);

      if (variance.abs().greaterThan(threshold) && !dto.varianceReason) {
        throw new BadRequestException({
          message: `The cash variance is ${variance.toFixed(2)}. A reason is required for variances over ${threshold.toFixed(2)}.`,
          code: 'VARIANCE_REASON_REQUIRED',
          details: {
            expectedCash: [expectedCash.toFixed(2)],
            variance: [variance.toFixed(2)],
            threshold: [threshold.toFixed(2)],
          },
        });
      }

      const closed = await tx.shift.update({
        where: { id: shiftId },
        data: {
          status: ShiftStatus.CLOSED,
          closingCash,
          expectedCash,
          variance,
          varianceReason: dto.varianceReason,
          notes: dto.notes ?? shift.notes,
          closedAt: new Date(),
        },
      });

      await this.audit.recordInTransaction(tx, {
        userId: user.id,
        action: 'SHIFT_CLOSED',
        entityType: 'Shift',
        entityId: shiftId,
        summary: `${user.firstName} ${user.lastName} closed shift ${shift.shiftNumber} with a variance of ${variance.toFixed(2)}`,
        metadata: {
          expectedCash: expectedCash.toFixed(2),
          actualCash: closingCash.toFixed(2),
          variance: variance.toFixed(2),
          reason: dto.varianceReason,
        },
      });

      return this.present(closed, tally, expectedCash);
    });
  }

  /** The shift a cashier is currently working, if any. */
  async current(user: AuthenticatedUser) {
    const shift = await this.prisma.shift.findFirst({
      where: { cashierId: user.id, status: ShiftStatus.OPEN },
    });

    if (!shift) return { open: false, shift: null };

    const tally = await this.tally(this.prisma, shift.id);
    return {
      open: true,
      shift: this.present(shift, tally, add(shift.openingCash, tally.byMethod.CASH ?? ZERO())),
    };
  }

  async list(user: AuthenticatedUser, page: number, pageSize: number) {
    const take = Math.min(pageSize || 25, 100);
    const skip = (Math.max(page || 1, 1) - 1) * take;

    const where = user.permissions.includes('shift.view_all') ? {} : { cashierId: user.id };

    const [total, shifts] = await Promise.all([
      this.prisma.shift.count({ where }),
      this.prisma.shift.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        skip,
        take,
        include: { cashier: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    return {
      data: shifts.map((s) => ({
        id: s.id,
        shiftNumber: s.shiftNumber,
        cashier: `${s.cashier.firstName} ${s.cashier.lastName}`,
        status: s.status,
        openingCash: s.openingCash.toFixed(2),
        expectedCash: s.expectedCash?.toFixed(2) ?? null,
        closingCash: s.closingCash?.toFixed(2) ?? null,
        variance: s.variance?.toFixed(2) ?? null,
        varianceReason: s.varianceReason,
        openedAt: s.openedAt.toISOString(),
        closedAt: s.closedAt?.toISOString() ?? null,
      })),
      meta: { page, pageSize: take, total, pages: Math.ceil(total / take) },
    };
  }

  /** Sum the shift's recorded cash movements by payment method. */
  private async tally(client: Prisma.TransactionClient | PrismaService, shiftId: string) {
    const grouped = await client.shiftTransaction.groupBy({
      by: ['method', 'type'],
      where: { shiftId },
      _sum: { amount: true },
      _count: true,
    });

    const byMethod: Partial<Record<PaymentMethod, Prisma.Decimal>> = {};
    let salesTotal = ZERO();
    let refundTotal = ZERO();
    let transactionCount = 0;

    for (const row of grouped) {
      const amount = row._sum.amount ?? ZERO();
      const signed = row.type === ShiftTransactionType.REFUND ? amount.negated() : amount;

      byMethod[row.method] = add(byMethod[row.method] ?? ZERO(), signed);

      if (row.type === ShiftTransactionType.SALE) {
        salesTotal = add(salesTotal, amount);
        transactionCount += row._count;
      }
      if (row.type === ShiftTransactionType.REFUND) {
        refundTotal = add(refundTotal, amount);
      }
    }

    return { byMethod, salesTotal, refundTotal, transactionCount };
  }

  private async varianceThreshold(): Promise<Prisma.Decimal> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: 'shift.varianceThreshold' },
    });
    const raw = setting?.value;
    return money(typeof raw === 'string' || typeof raw === 'number' ? raw : '20.00');
  }

  private present(
    shift: {
      id: string;
      shiftNumber: string;
      cashierId: string;
      status: ShiftStatus;
      openingCash: Prisma.Decimal;
      closingCash: Prisma.Decimal | null;
      expectedCash: Prisma.Decimal | null;
      variance: Prisma.Decimal | null;
      varianceReason: string | null;
      openedAt: Date;
      closedAt: Date | null;
      notes: string | null;
    },
    tally: Awaited<ReturnType<ShiftsService['tally']>>,
    expectedCash: Prisma.Decimal,
  ) {
    return {
      id: shift.id,
      shiftNumber: shift.shiftNumber,
      cashierId: shift.cashierId,
      status: shift.status,
      openingCash: shift.openingCash.toFixed(2),
      expectedCash: (shift.expectedCash ?? expectedCash).toFixed(2),
      closingCash: shift.closingCash?.toFixed(2) ?? null,
      variance: shift.variance?.toFixed(2) ?? null,
      varianceReason: shift.varianceReason,
      openedAt: shift.openedAt.toISOString(),
      closedAt: shift.closedAt?.toISOString() ?? null,
      notes: shift.notes,
      totals: {
        sales: tally.salesTotal.toFixed(2),
        refunds: tally.refundTotal.toFixed(2),
        transactionCount: tally.transactionCount,
        byMethod: Object.fromEntries(
          Object.entries(tally.byMethod).map(([k, v]) => [k, v.toFixed(2)]),
        ),
      },
    };
  }
}
