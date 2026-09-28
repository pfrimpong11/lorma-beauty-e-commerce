import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MovementType,
  PaymentMethod,
  Prisma,
  RefundMethod,
  ReturnReason,
  SaleStatus,
  ShiftStatus,
  ShiftTransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CounterService } from '../common/services/counter.service';
import { InventoryService } from '../inventory/inventory.service';
import { add, money, multiply, ZERO } from '../common/utils/money';
import type { AuthenticatedUser } from '../common/decorators';
import type { CreateReturnDto } from './dto/return.dto';

/** Refund methods that take cash out of the drawer. */
const CASH_EQUIVALENT: Partial<Record<RefundMethod, PaymentMethod>> = {
  [RefundMethod.CASH]: PaymentMethod.CASH,
  [RefundMethod.MOBILE_MONEY]: PaymentMethod.MOBILE_MONEY,
  [RefundMethod.CARD]: PaymentMethod.CARD,
  [RefundMethod.BANK_TRANSFER]: PaymentMethod.BANK_TRANSFER,
};

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly counters: CounterService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Process a return against an existing sale.
   *
   * The original sale is never edited (§17, §51.1). Its `amountRefunded`
   * and per-line `quantityReturned` are incremented so the history stays
   * truthful about what was sold and what came back.
   */
  async create(dto: CreateReturnDto, user: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUniqueOrThrow({
        where: { id: dto.saleId },
        include: { items: true },
      });

      if (sale.status === SaleStatus.VOIDED) {
        throw new BadRequestException('That sale was voided and cannot be returned against.');
      }

      const itemsById = new Map(sale.items.map((i) => [i.id, i]));
      let refundAmount = ZERO();
      const lines: Array<{
        saleItemId: string;
        productId: string;
        batchId: string | null;
        productName: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
        lineRefund: Prisma.Decimal;
        restock: boolean;
      }> = [];

      for (const item of dto.items) {
        const saleItem = itemsById.get(item.saleItemId);
        if (!saleItem) {
          throw new BadRequestException('One of the items is not part of that sale.');
        }

        const remaining = saleItem.quantity - saleItem.quantityReturned;
        if (item.quantity > remaining) {
          throw new BadRequestException(
            `Only ${remaining} of ${saleItem.productName} remain available to return.`,
          );
        }

        // Refund the price actually paid for the line, discount included,
        // rather than the list price.
        const effectiveUnitPrice = saleItem.lineTotal.div(saleItem.quantity);
        const lineRefund = money(multiply(effectiveUnitPrice, item.quantity));
        refundAmount = add(refundAmount, lineRefund);

        lines.push({
          saleItemId: saleItem.id,
          productId: saleItem.productId,
          batchId: saleItem.batchId,
          productName: saleItem.productName,
          quantity: item.quantity,
          unitPrice: saleItem.unitPrice,
          lineRefund,
          // Expired or damaged goods must not go back on the shelf.
          restock:
            item.restock ??
            (dto.reason !== ReturnReason.EXPIRED && dto.reason !== ReturnReason.DAMAGED),
        });
      }

      const alreadyRefunded = sale.amountRefunded;
      if (add(alreadyRefunded, refundAmount).greaterThan(sale.total)) {
        throw new BadRequestException('That refund would exceed the original sale total.');
      }

      const shift = await tx.shift.findFirst({
        where: { cashierId: user.id, status: ShiftStatus.OPEN },
        select: { id: true },
      });

      const returnNumber = await this.counters.next(tx, 'return');

      const created = await tx.return.create({
        data: {
          returnNumber,
          saleId: sale.id,
          processedById: user.id,
          shiftId: shift?.id ?? null,
          reason: dto.reason,
          reasonNote: dto.reasonNote,
          refundMethod: dto.refundMethod,
          refundAmount,
          restocked: lines.some((l) => l.restock),
        },
      });

      for (const line of lines) {
        await tx.returnItem.create({
          data: {
            returnId: created.id,
            saleItemId: line.saleItemId,
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            refundAmount: line.lineRefund,
            restocked: line.restock,
          },
        });

        await tx.saleItem.update({
          where: { id: line.saleItemId },
          data: { quantityReturned: { increment: line.quantity } },
        });

        if (line.restock) {
          await this.inventory.restock(tx, {
            productId: line.productId,
            batchId: line.batchId,
            quantity: line.quantity,
            reason: `Returned on ${returnNumber} (sale ${sale.receiptNumber})`,
            referenceType: 'Return',
            referenceId: created.id,
            userId: user.id,
          });
        } else {
          // Goods came back but are unsellable — record the write-off so the
          // loss is visible rather than silently vanishing.
          const before = await tx.inventory.findUniqueOrThrow({
            where: { productId: line.productId },
            select: { quantity: true },
          });
          await tx.inventoryMovement.create({
            data: {
              productId: line.productId,
              batchId: line.batchId,
              type:
                dto.reason === ReturnReason.EXPIRED
                  ? MovementType.EXPIRED
                  : MovementType.DAMAGED,
              quantity: 0,
              previousQty: before.quantity,
              newQty: before.quantity,
              reason: `Returned unsellable on ${returnNumber}: ${dto.reason.toLowerCase().replace(/_/g, ' ')}`,
              referenceType: 'Return',
              referenceId: created.id,
              userId: user.id,
            },
          });
        }
      }

      // Update the sale's rollup without rewriting what it recorded.
      const refreshed = await tx.saleItem.findMany({
        where: { saleId: sale.id },
        select: { quantity: true, quantityReturned: true },
      });
      const fullyReturned = refreshed.every((i) => i.quantityReturned >= i.quantity);

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          amountRefunded: add(alreadyRefunded, refundAmount),
          status: fullyReturned ? SaleStatus.RETURNED : SaleStatus.PARTIALLY_RETURNED,
        },
      });

      if (shift && CASH_EQUIVALENT[dto.refundMethod]) {
        await tx.shiftTransaction.create({
          data: {
            shiftId: shift.id,
            type: ShiftTransactionType.REFUND,
            method: CASH_EQUIVALENT[dto.refundMethod]!,
            amount: refundAmount,
            referenceId: created.id,
            note: `Refund ${returnNumber}`,
          },
        });
      }

      await this.audit.recordInTransaction(tx, {
        userId: user.id,
        action: 'RETURN_PROCESSED',
        entityType: 'Return',
        entityId: created.id,
        summary: `${user.firstName} ${user.lastName} processed refund ${returnNumber} of ${refundAmount.toFixed(2)} against sale ${sale.receiptNumber}`,
        metadata: {
          returnNumber,
          receiptNumber: sale.receiptNumber,
          refundAmount: refundAmount.toFixed(2),
          reason: dto.reason,
          refundMethod: dto.refundMethod,
        },
      });

      return {
        id: created.id,
        returnNumber,
        saleId: sale.id,
        receiptNumber: sale.receiptNumber,
        refundAmount: refundAmount.toFixed(2),
        refundMethod: dto.refundMethod,
        reason: dto.reason,
        items: lines.map((l) => ({
          productName: l.productName,
          quantity: l.quantity,
          refundAmount: l.lineRefund.toFixed(2),
          restocked: l.restock,
        })),
        createdAt: created.createdAt.toISOString(),
      };
    });
  }

  async list(page: number, pageSize: number) {
    const take = Math.min(pageSize || 25, 100);
    const skip = (Math.max(page || 1, 1) - 1) * take;

    const [total, returns] = await Promise.all([
      this.prisma.return.count(),
      this.prisma.return.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          sale: { select: { receiptNumber: true } },
          processedBy: { select: { firstName: true, lastName: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    return {
      data: returns.map((r) => ({
        id: r.id,
        returnNumber: r.returnNumber,
        receiptNumber: r.sale.receiptNumber,
        refundAmount: r.refundAmount.toFixed(2),
        refundMethod: r.refundMethod,
        reason: r.reason,
        itemCount: r._count.items,
        processedBy: `${r.processedBy.firstName} ${r.processedBy.lastName}`,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: { page, pageSize: take, total, pages: Math.ceil(total / take) },
    };
  }
}
