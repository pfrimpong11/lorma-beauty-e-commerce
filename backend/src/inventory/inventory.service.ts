import { BadRequestException, Injectable } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';

export interface StockDeduction {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: Prisma.Decimal;
  referenceType: string;
  referenceId: string;
  userId: string;
  reason: string;
}

export interface DeductionResult {
  /** Batch the units came from, when the product tracks expiry. */
  batchId: string | null;
  previousQty: number;
  newQty: number;
}

export class InsufficientStockError extends BadRequestException {
  constructor(productName: string, requested: number, available: number) {
    super({
      message: `Not enough stock for ${productName}. Requested ${requested}, available ${available}.`,
      code: 'INSUFFICIENT_STOCK',
      details: { productName, requested, available },
    });
  }
}

export class ExpiredProductError extends BadRequestException {
  constructor(productName: string) {
    super({
      message: `${productName} has expired and cannot be sold.`,
      code: 'PRODUCT_EXPIRED',
    });
  }
}

@Injectable()
export class InventoryService {
  /**
   * Remove stock for a sale, writing the ledger entry that explains it.
   *
   * Concurrency is handled by a conditional UPDATE rather than a read then
   * write: `WHERE quantity >= n` makes the check and the decrement a single
   * atomic statement, so two tills selling the last unit cannot both win.
   * A zero row count means someone else got there first.
   */
  async deductForSale(
    tx: Prisma.TransactionClient,
    deduction: StockDeduction,
  ): Promise<DeductionResult> {
    const { productId, productName, quantity } = deduction;

    const before = await tx.inventory.findUnique({
      where: { productId },
      select: { quantity: true },
    });

    if (!before) {
      throw new BadRequestException(`${productName} has no inventory record.`);
    }

    const updated = await tx.$executeRaw`
      UPDATE "inventory"
         SET "quantity" = "quantity" - ${quantity},
             "version"  = "version" + 1,
             "updatedAt" = NOW()
       WHERE "productId" = ${productId}::uuid
         AND "quantity" >= ${quantity}
    `;

    if (updated === 0) {
      throw new InsufficientStockError(productName, quantity, before.quantity);
    }

    const batchId = await this.consumeBatches(tx, productId, productName, quantity);

    const previousQty = before.quantity;
    const newQty = previousQty - quantity;

    await tx.inventoryMovement.create({
      data: {
        productId,
        batchId,
        type: MovementType.SALE,
        quantity: -quantity,
        previousQty,
        newQty,
        reason: deduction.reason,
        unitCost: deduction.unitCost,
        referenceType: deduction.referenceType,
        referenceId: deduction.referenceId,
        userId: deduction.userId,
      },
    });

    return { batchId, previousQty, newQty };
  }

  /**
   * Draw units from batches first-expiry-first-out, skipping anything
   * already expired (§51.3 — expired stock is never sold).
   *
   * Returns the batch id when the whole quantity came from one batch, so
   * the sale line can reference it; null when it spanned several.
   */
  private async consumeBatches(
    tx: Prisma.TransactionClient,
    productId: string,
    productName: string,
    quantity: number,
  ): Promise<string | null> {
    const product = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      select: { tracksExpiry: true },
    });

    if (!product.tracksExpiry) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const batches = await tx.productBatch.findMany({
      where: { productId, quantity: { gt: 0 }, expiryDate: { gte: today } },
      orderBy: { expiryDate: 'asc' },
      select: { id: true, quantity: true },
    });

    const sellable = batches.reduce((sum, b) => sum + b.quantity, 0);

    if (sellable < quantity) {
      // Stock exists but it is expired, or batches are out of step with the
      // inventory rollup. Either way this must not become a sale.
      const anyBatch = await tx.productBatch.findFirst({
        where: { productId, quantity: { gt: 0 } },
        select: { id: true },
      });
      if (anyBatch) throw new ExpiredProductError(productName);
      throw new InsufficientStockError(productName, quantity, sellable);
    }

    let remaining = quantity;
    const touched: string[] = [];

    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantity, remaining);

      await tx.productBatch.update({
        where: { id: batch.id },
        data: { quantity: { decrement: take } },
      });

      touched.push(batch.id);
      remaining -= take;
    }

    return touched.length === 1 ? touched[0] : null;
  }

  /** Put units back after a return, when the goods are resellable. */
  async restock(
    tx: Prisma.TransactionClient,
    input: {
      productId: string;
      batchId: string | null;
      quantity: number;
      reason: string;
      referenceType: string;
      referenceId: string;
      userId: string;
      type?: MovementType;
    },
  ): Promise<void> {
    const before = await tx.inventory.findUniqueOrThrow({
      where: { productId: input.productId },
      select: { quantity: true },
    });

    await tx.inventory.update({
      where: { productId: input.productId },
      data: { quantity: { increment: input.quantity }, version: { increment: 1 } },
    });

    if (input.batchId) {
      await tx.productBatch.update({
        where: { id: input.batchId },
        data: { quantity: { increment: input.quantity } },
      });
    }

    await tx.inventoryMovement.create({
      data: {
        productId: input.productId,
        batchId: input.batchId,
        type: input.type ?? MovementType.RETURN,
        quantity: input.quantity,
        previousQty: before.quantity,
        newQty: before.quantity + input.quantity,
        reason: input.reason,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        userId: input.userId,
      },
    });
  }
}
