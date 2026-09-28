import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { MovementType, Prisma, StockCountStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CounterService } from '../common/services/counter.service';
import { BarcodesService } from '../products/barcodes.service';
import type { AuthenticatedUser } from '../common/decorators';

export type ScanOutcome =
  | { status: 'counted'; item: CountItemView; product: { id: string; name: string; sku: string } }
  | { status: 'duplicate'; barcode: string; product: { id: string; name: string } }
  | { status: 'unknown'; barcode: string };

export interface CountItemView {
  id: string;
  productId: string;
  name: string;
  sku: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
}

/**
 * Physical stock counts.
 *
 * The rule that shapes this whole service: **counting never changes
 * stock.** Counted figures accumulate on the count document, and only an
 * explicit approval moves inventory. A half-finished count, or one with
 * an obvious miscount in it, can therefore never silently rewrite the
 * shop's stock levels.
 */
@Injectable()
export class StockCountsService {
  private readonly logger = new Logger(StockCountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly counters: CounterService,
    private readonly barcodes: BarcodesService,
  ) {}

  async start(note: string | undefined, user: AuthenticatedUser) {
    const open = await this.prisma.stockCount.findFirst({
      where: { status: StockCountStatus.IN_PROGRESS },
      select: { id: true, countNumber: true },
    });

    // Two counts running at once would each capture a different system
    // quantity and fight over the same stock on approval.
    if (open) {
      throw new ConflictException(
        `Stock count ${open.countNumber} is already open. Finish or cancel it first.`,
      );
    }

    const count = await this.prisma.$transaction(async (tx) => {
      const countNumber = await this.counters.next(tx, 'stockcount');
      const created = await tx.stockCount.create({
        data: { countNumber, note, startedById: user.id },
      });

      await this.audit.recordInTransaction(tx, {
        userId: user.id,
        action: 'STOCK_COUNT_STARTED',
        entityType: 'StockCount',
        entityId: created.id,
        summary: `${user.firstName} ${user.lastName} started stock count ${countNumber}`,
      });

      return created;
    });

    return this.detail(count.id);
  }

  async list(page = 1, pageSize = 25) {
    const take = Math.min(pageSize || 25, 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const [total, counts] = await Promise.all([
      this.prisma.stockCount.count(),
      this.prisma.stockCount.findMany({
        orderBy: { startedAt: 'desc' },
        skip,
        take,
        include: {
          startedBy: { select: { firstName: true, lastName: true } },
          completedBy: { select: { firstName: true, lastName: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    return {
      data: counts.map((c) => ({
        id: c.id,
        countNumber: c.countNumber,
        status: c.status,
        note: c.note,
        itemCount: c._count.items,
        startedBy: `${c.startedBy.firstName} ${c.startedBy.lastName}`,
        startedAt: c.startedAt.toISOString(),
        completedBy: c.completedBy
          ? `${c.completedBy.firstName} ${c.completedBy.lastName}`
          : null,
        completedAt: c.completedAt?.toISOString() ?? null,
      })),
      meta: { page, pageSize: take, total, pages: Math.ceil(total / take) },
    };
  }

  async detail(id: string) {
    const count = await this.prisma.stockCount.findUniqueOrThrow({
      where: { id },
      include: {
        startedBy: { select: { firstName: true, lastName: true } },
        completedBy: { select: { firstName: true, lastName: true } },
        items: {
          orderBy: { product: { name: 'asc' } },
          include: { product: { select: { id: true, name: true, sku: true } } },
        },
        _count: { select: { scans: true } },
      },
    });

    const items: CountItemView[] = count.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.product.name,
      sku: i.product.sku,
      systemQuantity: i.systemQuantity,
      countedQuantity: i.countedQuantity,
      variance: i.variance,
    }));

    return {
      id: count.id,
      countNumber: count.countNumber,
      status: count.status,
      note: count.note,
      startedBy: `${count.startedBy.firstName} ${count.startedBy.lastName}`,
      startedAt: count.startedAt.toISOString(),
      completedBy: count.completedBy
        ? `${count.completedBy.firstName} ${count.completedBy.lastName}`
        : null,
      completedAt: count.completedAt?.toISOString() ?? null,
      scanCount: count._count.scans,
      items,
      totals: {
        products: items.length,
        counted: items.reduce((sum, i) => sum + i.countedQuantity, 0),
        system: items.reduce((sum, i) => sum + i.systemQuantity, 0),
        shortages: items.filter((i) => i.variance < 0).length,
        overages: items.filter((i) => i.variance > 0).length,
        matched: items.filter((i) => i.variance === 0).length,
      },
    };
  }

  /** One scan. Resolves the code, then increments the counted quantity. */
  async scan(id: string, barcode: string, user: AuthenticatedUser): Promise<ScanOutcome> {
    const count = await this.requireOpen(id);
    const match = await this.barcodes.resolve(barcode);

    if (!match) return { status: 'unknown', barcode: barcode.trim() };

    const product = match.product;

    return this.prisma.$transaction(async (tx) => {
      // A serialized code is one physical unit, so it can only be counted
      // once. The unique index is the real guard — it survives saving the
      // count as a draft and resuming it later.
      if (product.barcodeMode === 'SERIALIZED') {
        try {
          await tx.stockCountScan.create({
            data: { stockCountId: count.id, barcodeId: match.id, barcode: match.barcode },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            return {
              status: 'duplicate' as const,
              barcode: match.barcode,
              product: { id: product.id, name: product.name },
            };
          }
          throw error;
        }
      }

      const existing = await tx.stockCountItem.findUnique({
        where: { stockCountId_productId: { stockCountId: count.id, productId: product.id } },
      });

      // System quantity is captured the first time a product is counted,
      // not at approval — the variance should reflect what the counter
      // was looking at.
      const systemQuantity = existing?.systemQuantity ?? product.inventory?.quantity ?? 0;
      const countedQuantity = (existing?.countedQuantity ?? 0) + 1;

      const item = await tx.stockCountItem.upsert({
        where: { stockCountId_productId: { stockCountId: count.id, productId: product.id } },
        update: { countedQuantity, variance: countedQuantity - systemQuantity },
        create: {
          stockCountId: count.id,
          productId: product.id,
          systemQuantity,
          countedQuantity,
          variance: countedQuantity - systemQuantity,
        },
      });

      return {
        status: 'counted' as const,
        product: { id: product.id, name: product.name, sku: product.sku },
        item: {
          id: item.id,
          productId: product.id,
          name: product.name,
          sku: product.sku,
          systemQuantity: item.systemQuantity,
          countedQuantity: item.countedQuantity,
          variance: item.variance,
        },
      };
    });
  }

  /** Correct a counted figure by hand — a miscount, or a bulk quantity. */
  async setQuantity(id: string, itemId: string, countedQuantity: number) {
    const count = await this.requireOpen(id);

    const item = await this.prisma.stockCountItem.findFirst({
      where: { id: itemId, stockCountId: count.id },
    });
    if (!item) throw new BadRequestException('That line is not part of this count.');

    await this.prisma.stockCountItem.update({
      where: { id: itemId },
      data: { countedQuantity, variance: countedQuantity - item.systemQuantity },
    });

    return this.detail(id);
  }

  /** Add a product that was not scanned — typically to record a zero. */
  async addItem(id: string, productId: string, countedQuantity: number) {
    const count = await this.requireOpen(id);

    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: { inventory: { select: { quantity: true } } },
    });
    const systemQuantity = product.inventory?.quantity ?? 0;

    await this.prisma.stockCountItem.upsert({
      where: { stockCountId_productId: { stockCountId: count.id, productId } },
      update: { countedQuantity, variance: countedQuantity - systemQuantity },
      create: {
        stockCountId: count.id,
        productId,
        systemQuantity,
        countedQuantity,
        variance: countedQuantity - systemQuantity,
      },
    });

    return this.detail(id);
  }

  async removeItem(id: string, itemId: string) {
    const count = await this.requireOpen(id);
    await this.prisma.stockCountItem.deleteMany({ where: { id: itemId, stockCountId: count.id } });
    return this.detail(id);
  }

  /**
   * Approve: adjust inventory to the counted figures.
   *
   * Everything below is one transaction — inventory, the movement ledger
   * and the document's status all land together or not at all (§15). A
   * partially applied count would leave stock that nobody can reconcile.
   */
  async approve(id: string, note: string | undefined, user: AuthenticatedUser) {
    const count = await this.requireOpen(id);

    const items = await this.prisma.stockCountItem.findMany({
      where: { stockCountId: count.id },
      include: { product: { select: { id: true, name: true } } },
    });

    if (items.length === 0) {
      throw new BadRequestException('Nothing has been counted yet.');
    }

    await this.prisma.$transaction(async (tx) => {
      let adjusted = 0;

      for (const item of items) {
        const inventory = await tx.inventory.findUnique({
          where: { productId: item.productId },
          select: { quantity: true },
        });
        // Live stock at approval, which may have moved since counting.
        // The ledger must record what actually changed, even though the
        // variance shown to the counter used the figure they saw.
        const previousQty = inventory?.quantity ?? 0;
        const newQty = item.countedQuantity;

        if (previousQty === newQty) continue;

        await tx.inventory.upsert({
          where: { productId: item.productId },
          update: { quantity: newQty, version: { increment: 1 }, lastCountedAt: new Date() },
          create: { productId: item.productId, quantity: newQty },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            type: MovementType.STOCK_COUNT,
            quantity: newQty - previousQty,
            previousQty,
            newQty,
            reason: note?.trim()
              ? `Stock count ${count.countNumber}: ${note.trim()}`
              : `Stock count ${count.countNumber}`,
            referenceType: 'StockCount',
            referenceId: count.id,
            userId: user.id,
          },
        });

        adjusted += 1;
      }

      await tx.stockCount.update({
        where: { id: count.id },
        data: {
          status: StockCountStatus.APPROVED,
          completedById: user.id,
          completedAt: new Date(),
          ...(note?.trim() ? { note: note.trim() } : {}),
        },
      });

      await this.audit.recordInTransaction(tx, {
        userId: user.id,
        action: 'STOCK_COUNT_APPROVED',
        entityType: 'StockCount',
        entityId: count.id,
        summary: `${user.firstName} ${user.lastName} approved stock count ${count.countNumber}, adjusting ${adjusted} product(s)`,
        metadata: {
          countNumber: count.countNumber,
          productsCounted: items.length,
          productsAdjusted: adjusted,
        },
      });

      this.logger.log(`Stock count ${count.countNumber} approved: ${adjusted} adjustment(s)`);
    });

    return this.detail(id);
  }

  async cancel(id: string, user: AuthenticatedUser) {
    const count = await this.requireOpen(id);

    await this.prisma.stockCount.update({
      where: { id: count.id },
      data: { status: StockCountStatus.CANCELLED, completedById: user.id, completedAt: new Date() },
    });

    await this.audit.record({
      userId: user.id,
      action: 'STOCK_COUNT_CANCELLED',
      entityType: 'StockCount',
      entityId: count.id,
      summary: `${user.firstName} ${user.lastName} cancelled stock count ${count.countNumber}`,
    });

    return this.detail(id);
  }

  /** An approved count is a closed document and can never be edited (§15). */
  private async requireOpen(id: string) {
    const count = await this.prisma.stockCount.findUniqueOrThrow({ where: { id } });

    if (count.status !== StockCountStatus.IN_PROGRESS) {
      throw new ConflictException(
        count.status === StockCountStatus.APPROVED
          ? `Stock count ${count.countNumber} has been approved and can no longer be changed.`
          : `Stock count ${count.countNumber} was cancelled.`,
      );
    }

    return count;
  }
}
