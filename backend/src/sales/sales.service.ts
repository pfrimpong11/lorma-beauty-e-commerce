import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  DiscountType,
  PaymentMethod,
  Prisma,
  SaleOrigin,
  SaleStatus,
  ShiftStatus,
  ShiftTransactionType,
  SyncStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CounterService } from '../common/services/counter.service';
import { InventoryService } from '../inventory/inventory.service';
import { add, atLeastZero, eq, gt, money, multiply, percentOf, subtract, ZERO } from '../common/utils/money';
import { displayName } from '../common/utils/display-name';
import { SmsService, receiptSms } from '../sms/sms.service';
import { normaliseGhanaPhone } from '../sms/phone';
import type { AuthenticatedUser } from '../common/decorators';
import type { CreateSaleDto } from './dto/create-sale.dto';

export interface SaleContext {
  user: AuthenticatedUser;
  /** Present when the sale arrived through the offline sync endpoint. */
  idempotencyKey?: string;
  origin?: SaleOrigin;
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly counters: CounterService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
  ) {}

  /**
   * Complete a sale.
   *
   * Everything below happens in one database transaction (§29): sale, sale
   * items, payments, inventory decrement, movement ledger, shift ledger and
   * audit row either all land or none do. A failure halfway cannot leave
   * stock deducted for a sale that does not exist.
   */
  async createSale(dto: CreateSaleDto, context: SaleContext) {
    // Replaying a sale must return the original, not make a second one
    // (§25). Checked before the transaction so a retry is cheap.
    if (context.idempotencyKey) {
      const replay = await this.findByIdempotencyKey(context.idempotencyKey);
      if (replay) return replay;
    }

    if (dto.clientUuid) {
      const existing = await this.prisma.sale.findUnique({
        where: { clientUuid: dto.clientUuid },
        include: this.saleInclude(),
      });
      if (existing) {
        this.logger.log(`Duplicate sale suppressed for clientUuid ${dto.clientUuid}`);
        return this.present(existing, { duplicate: true });
      }
    }

    // The X-Idempotency-Key header alone is enough to make a call idempotent,
    // so a caller that sends it without a clientUuid must still work. The
    // ledger row needs one, so mint it here; the header remains the guard.
    const clientUuid =
      dto.clientUuid ?? (context.idempotencyKey ? randomUUID() : undefined);

    const sale = await this.prisma.$transaction(
      async (tx) => {
        const productIds = [...new Set(dto.items.map((i) => i.productId))];

        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            name: true,
            sku: true,
            // The size, so the receipt line says which one was sold rather
            // than naming the article and leaving it ambiguous.
            variantName: true,
            sellingPrice: true,
            costPrice: true,
            isActive: true,
          },
        });

        const byId = new Map(products.map((p) => [p.id, p]));

        for (const id of productIds) {
          const product = byId.get(id);
          if (!product) throw new BadRequestException('One of the products no longer exists.');
          if (!product.isActive) {
            throw new BadRequestException(`${product.name} is no longer available for sale.`);
          }
        }

        // ---- Totals ---------------------------------------------------
        let subtotal = ZERO();
        const lines = dto.items.map((item) => {
          const product = byId.get(item.productId)!;
          const gross = multiply(product.sellingPrice, item.quantity);
          const lineDiscount = atLeastZero(item.discountAmount ?? 0);

          if (gt(lineDiscount, gross)) {
            throw new BadRequestException(
              `The discount on ${product.name} is larger than the line total.`,
            );
          }

          const lineTotal = subtract(gross, lineDiscount);
          subtotal = add(subtotal, lineTotal);

          return {
            product,
            quantity: item.quantity,
            unitPrice: money(product.sellingPrice),
            unitCost: money(product.costPrice),
            discountAmount: lineDiscount,
            lineTotal,
          };
        });

        const discountType = dto.discountType ?? DiscountType.NONE;
        const discountValue = atLeastZero(dto.discountValue ?? 0);

        let discountAmount = ZERO();
        if (discountType === DiscountType.AMOUNT) {
          discountAmount = discountValue;
        } else if (discountType === DiscountType.PERCENT) {
          if (gt(discountValue, 100)) {
            throw new BadRequestException('A percentage discount cannot exceed 100%.');
          }
          discountAmount = percentOf(subtotal, discountValue);
        }

        if (gt(discountAmount, subtotal)) {
          throw new BadRequestException('The discount is larger than the sale total.');
        }

        const total = subtract(subtotal, discountAmount);

        // ---- Payment must cover the total exactly ---------------------
        const paid = add(...dto.payments.map((p) => p.amount));
        if (!eq(paid, total)) {
          throw new BadRequestException(
            `Payment of ${paid.toFixed(2)} does not match the total of ${total.toFixed(2)}.`,
          );
        }

        /*
         * Cash must say what was handed over.
         *
         * This used to be checked only when the field happened to be
         * present, so omitting it skipped the check entirely and the sale
         * completed with no record of the cash taken — leaving the change
         * owed unknowable and the shift impossible to reconcile against the
         * drawer. Disabling the button was not enough: the till is one
         * client among several, and a stale cached bundle, a replayed
         * offline sale or any other caller went straight past it.
         */
        for (const payment of dto.payments) {
          if (payment.method !== PaymentMethod.CASH) continue;

          if (payment.amountTendered === undefined) {
            throw new BadRequestException(
              'Cash tendered is required. Record what the customer handed over.',
            );
          }

          if (gt(payment.amount, payment.amountTendered)) {
            throw new BadRequestException('Cash tendered is less than the amount due.');
          }
        }

        // ---- Shift ----------------------------------------------------
        const shift = await tx.shift.findFirst({
          where: { cashierId: context.user.id, status: ShiftStatus.OPEN },
          select: { id: true },
        });

        /*
         * A number typed at the till identifies the customer. Looked up
         * before it is created, so serving the same person twice does not
         * make a second record of them — phone is unique, and a blind
         * create would fail the whole sale on the second visit.
         */
        let customerId = dto.customerId ?? null;

        if (!customerId && dto.customerPhone?.trim()) {
          const phone = normaliseGhanaPhone(dto.customerPhone);
          if (!phone) {
            throw new BadRequestException(
              `${dto.customerPhone} is not a Ghanaian mobile number.`,
            );
          }

          const existing = await tx.customer.findUnique({ where: { phone: phone.e164 } });
          customerId =
            existing?.id ??
            (
              await tx.customer.create({
                data: {
                  name: dto.customerName?.trim() || `Customer ${phone.local}`,
                  phone: phone.e164,
                },
              })
            ).id;
        }

        customerId = customerId ?? (await this.walkInCustomerId(tx));
        const receiptNumber = await this.counters.next(tx, 'receipt');

        const created = await tx.sale.create({
          data: {
            receiptNumber,
            customerId,
            cashierId: context.user.id,
            shiftId: shift?.id ?? null,
            status: SaleStatus.COMPLETED,
            origin: context.origin ?? SaleOrigin.ONLINE,
            subtotal,
            discountType,
            discountValue,
            discountAmount,
            total,
            note: dto.note,
            clientUuid,
            deviceId: dto.deviceId,
            clientSequence: dto.clientSequence,
            soldAt: dto.soldAt ? new Date(dto.soldAt) : new Date(),
          },
        });

        // ---- Lines, stock and the ledger ------------------------------
        for (const line of lines) {
          const result = await this.inventory.deductForSale(tx, {
            productId: line.product.id,
            productName: displayName(line.product),
            quantity: line.quantity,
            unitCost: line.unitCost,
            referenceType: 'Sale',
            referenceId: created.id,
            userId: context.user.id,
            reason: `Sold on receipt ${receiptNumber}`,
          });

          await tx.saleItem.create({
            data: {
              saleId: created.id,
              productId: line.product.id,
              batchId: result.batchId,
              productName: displayName(line.product),
              sku: line.product.sku,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              unitCost: line.unitCost,
              discountAmount: line.discountAmount,
              lineTotal: line.lineTotal,
            },
          });
        }

        // ---- Payments and the cash drawer -----------------------------
        for (const payment of dto.payments) {
          const amount = money(payment.amount);
          const tendered =
            payment.method === PaymentMethod.CASH && payment.amountTendered !== undefined
              ? money(payment.amountTendered)
              : null;

          await tx.payment.create({
            data: {
              saleId: created.id,
              method: payment.method,
              amount,
              amountTendered: tendered,
              changeGiven: tendered ? subtract(tendered, amount) : null,
              reference: payment.reference,
            },
          });

          if (shift) {
            await tx.shiftTransaction.create({
              data: {
                shiftId: shift.id,
                type: ShiftTransactionType.SALE,
                method: payment.method,
                amount,
                referenceId: created.id,
                note: `Receipt ${receiptNumber}`,
              },
            });
          }
        }

        await this.audit.recordInTransaction(tx, {
          userId: context.user.id,
          action: 'SALE_COMPLETED',
          entityType: 'Sale',
          entityId: created.id,
          summary: `${context.user.firstName} ${context.user.lastName} completed sale ${receiptNumber} for ${total.toFixed(2)}`,
          metadata: {
            receiptNumber,
            total: total.toFixed(2),
            itemCount: lines.length,
            origin: context.origin ?? SaleOrigin.ONLINE,
          },
        });

        if (context.idempotencyKey) {
          await tx.syncQueueEntry.create({
            data: {
              idempotencyKey: context.idempotencyKey,
              clientUuid: clientUuid!,
              deviceId: dto.deviceId ?? 'unknown',
              userId: context.user.id,
              entityType: 'Sale',
              clientSequence: dto.clientSequence,
              status: SyncStatus.ACCEPTED,
              resultId: created.id,
              payload: dto as unknown as Prisma.InputJsonValue,
              clientTime: dto.soldAt ? new Date(dto.soldAt) : new Date(),
            },
          });
        }

        return tx.sale.findUniqueOrThrow({
          where: { id: created.id },
          include: this.saleInclude(),
        });
      },
      {
        // A busy counter can have several tills committing at once; the
        // conditional stock UPDATE is the real serialisation point.
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15_000,
      },
    );

    /*
     * After the commit, never inside it.
     *
     * The money is taken, the stock is gone and the receipt is about to
     * print. A gateway that is slow or down is a message problem, not a
     * trading one, so it is not allowed to roll any of that back — or even
     * to make the cashier wait. The message is recorded either way.
     */
    void this.sendReceiptSms(sale);

    return this.present(sale);
  }

  /** Never throws: see the call site. */
  private async sendReceiptSms(sale: {
    id: string;
    receiptNumber: string;
    total: Prisma.Decimal;
    customer: { phone: string | null; isWalkIn: boolean } | null;
    items: Array<{ productName: string }>;
  }): Promise<void> {
    try {
      const phone = sale.customer?.phone;
      if (!phone) return;

      await this.sms.send({
        to: phone,
        saleId: sale.id,
        body: receiptSms({
          itemNames: sale.items.map((i) => i.productName),
          amount: sale.total.toFixed(2),
          receiptNumber: sale.receiptNumber,
        }),
      });
    } catch (error) {
      this.logger.error(`Receipt SMS for ${sale.receiptNumber} failed: ${String(error)}`);
    }
  }

  private async findByIdempotencyKey(key: string) {
    const entry = await this.prisma.syncQueueEntry.findUnique({
      where: { idempotencyKey: key },
      select: { status: true, resultId: true, errorMessage: true },
    });

    if (!entry) return null;

    if (entry.status === SyncStatus.ACCEPTED && entry.resultId) {
      const sale = await this.prisma.sale.findUnique({
        where: { id: entry.resultId },
        include: this.saleInclude(),
      });
      if (sale) return this.present(sale, { duplicate: true });
    }

    if (entry.status === SyncStatus.REJECTED) {
      throw new ConflictException(
        entry.errorMessage ?? 'This transaction was previously rejected.',
      );
    }

    return null;
  }

  private async walkInCustomerId(tx: Prisma.TransactionClient): Promise<string | null> {
    const walkIn = await tx.customer.findFirst({
      where: { isWalkIn: true },
      select: { id: true },
    });
    return walkIn?.id ?? null;
  }

  private saleInclude() {
    return {
      items: true,
      payments: true,
      customer: { select: { id: true, name: true, phone: true, isWalkIn: true } },
      cashier: { select: { id: true, firstName: true, lastName: true } },
    } satisfies Prisma.SaleInclude;
  }

  /** Serialise a sale with money as fixed-scale strings, never floats. */
  private present(
    sale: Prisma.SaleGetPayload<{ include: ReturnType<SalesService['saleInclude']> }>,
    meta: { duplicate?: boolean } = {},
  ) {
    return {
      id: sale.id,
      receiptNumber: sale.receiptNumber,
      status: sale.status,
      origin: sale.origin,
      soldAt: sale.soldAt.toISOString(),
      cashier: sale.cashier,
      customer: sale.customer,
      subtotal: sale.subtotal.toFixed(2),
      discountType: sale.discountType,
      discountAmount: sale.discountAmount.toFixed(2),
      total: sale.total.toFixed(2),
      amountRefunded: sale.amountRefunded.toFixed(2),
      note: sale.note,
      items: sale.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        sku: i.sku,
        quantity: i.quantity,
        quantityReturned: i.quantityReturned,
        unitPrice: i.unitPrice.toFixed(2),
        discountAmount: i.discountAmount.toFixed(2),
        lineTotal: i.lineTotal.toFixed(2),
      })),
      payments: sale.payments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: p.amount.toFixed(2),
        amountTendered: p.amountTendered?.toFixed(2) ?? null,
        changeGiven: p.changeGiven?.toFixed(2) ?? null,
        reference: p.reference,
      })),
      ...(meta.duplicate ? { duplicate: true } : {}),
    };
  }
}
