import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SaleOrigin, SyncStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/decorators';
import type { PushSyncDto, QueuedSaleDto } from './dto/sync.dto';

export interface SyncItemResult {
  idempotencyKey: string;
  clientUuid: string;
  status: SyncStatus;
  saleId?: string;
  receiptNumber?: string;
  message?: string;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Drain a device's offline queue.
   *
   * Each sale is processed independently: one bad transaction must not
   * block the rest of the queue (§25). Every outcome is reported back per
   * item so the device knows exactly which entries to clear and which to
   * keep for retry.
   *
   * A completed offline sale is never discarded. If it cannot be applied,
   * it is recorded as CONFLICT or REJECTED in `sync_queue` with its full
   * payload, for an authorised user to resolve.
   */
  async push(dto: PushSyncDto, user: AuthenticatedUser): Promise<{
    results: SyncItemResult[];
    summary: { accepted: number; duplicate: number; conflict: number; rejected: number };
  }> {
    // Replay in the order the device recorded them, so stock is consumed
    // in the sequence the shop actually sold it.
    const ordered = [...dto.sales].sort((a, b) => {
      if (a.clientSequence !== undefined && b.clientSequence !== undefined) {
        return a.clientSequence - b.clientSequence;
      }
      return new Date(a.clientTime).getTime() - new Date(b.clientTime).getTime();
    });

    const results: SyncItemResult[] = [];

    for (const queued of ordered) {
      results.push(await this.applyOne(queued, user));
    }

    const summary = {
      accepted: results.filter((r) => r.status === SyncStatus.ACCEPTED).length,
      duplicate: results.filter((r) => r.status === SyncStatus.DUPLICATE).length,
      conflict: results.filter((r) => r.status === SyncStatus.CONFLICT).length,
      rejected: results.filter((r) => r.status === SyncStatus.REJECTED).length,
    };

    this.logger.log(
      `Sync from device ${ordered[0]?.deviceId}: ${summary.accepted} accepted, ` +
        `${summary.duplicate} duplicate, ${summary.conflict} conflict, ${summary.rejected} rejected`,
    );

    return { results, summary };
  }

  private async applyOne(
    queued: QueuedSaleDto,
    user: AuthenticatedUser,
  ): Promise<SyncItemResult> {
    const existing = await this.prisma.syncQueueEntry.findUnique({
      where: { idempotencyKey: queued.idempotencyKey },
      select: { status: true, resultId: true, errorMessage: true },
    });

    // Already seen. Return the original outcome rather than reprocessing —
    // this is what makes a retry safe (§51.10, §51.11).
    if (existing) {
      if (existing.status === SyncStatus.ACCEPTED && existing.resultId) {
        const sale = await this.prisma.sale.findUnique({
          where: { id: existing.resultId },
          select: { id: true, receiptNumber: true },
        });
        return {
          idempotencyKey: queued.idempotencyKey,
          clientUuid: queued.clientUuid,
          status: SyncStatus.DUPLICATE,
          saleId: sale?.id,
          receiptNumber: sale?.receiptNumber,
          message: 'Already synchronised.',
        };
      }

      return {
        idempotencyKey: queued.idempotencyKey,
        clientUuid: queued.clientUuid,
        status: existing.status,
        message: existing.errorMessage ?? 'Previously recorded; awaiting resolution.',
      };
    }

    try {
      const sale = await this.sales.createSale(
        {
          ...queued.sale,
          clientUuid: queued.clientUuid,
          deviceId: queued.deviceId,
          clientSequence: queued.clientSequence,
          soldAt: queued.sale.soldAt ?? queued.clientTime,
        },
        {
          user,
          idempotencyKey: queued.idempotencyKey,
          origin: SaleOrigin.OFFLINE_SYNCED,
        },
      );

      return {
        idempotencyKey: queued.idempotencyKey,
        clientUuid: queued.clientUuid,
        status: sale.duplicate ? SyncStatus.DUPLICATE : SyncStatus.ACCEPTED,
        saleId: sale.id,
        receiptNumber: sale.receiptNumber,
      };
    } catch (error) {
      return this.recordFailure(queued, user, error);
    }
  }

  /**
   * A sale that cannot be applied is preserved, not dropped.
   *
   * Stock shortfalls are CONFLICT — the sale genuinely happened in the
   * shop, and someone must decide how to reconcile it. Everything else is
   * REJECTED, which the device stops retrying.
   */
  private async recordFailure(
    queued: QueuedSaleDto,
    user: AuthenticatedUser,
    error: unknown,
  ): Promise<SyncItemResult> {
    const message =
      error instanceof Error ? error.message : 'The transaction could not be applied.';

    const responseCode =
      typeof error === 'object' && error !== null && 'response' in error
        ? ((error as { response?: { code?: string } }).response?.code ?? null)
        : null;

    const isStockConflict =
      responseCode === 'INSUFFICIENT_STOCK' || responseCode === 'PRODUCT_EXPIRED';

    const status = isStockConflict ? SyncStatus.CONFLICT : SyncStatus.REJECTED;

    await this.prisma.syncQueueEntry.create({
      data: {
        idempotencyKey: queued.idempotencyKey,
        clientUuid: queued.clientUuid,
        deviceId: queued.deviceId,
        userId: user.id,
        entityType: 'Sale',
        clientSequence: queued.clientSequence,
        status,
        payload: queued.sale as unknown as Prisma.InputJsonValue,
        conflicts: isStockConflict
          ? ({ code: responseCode, detail: message } as Prisma.InputJsonValue)
          : undefined,
        errorMessage: message.slice(0, 500),
        clientTime: new Date(queued.clientTime),
      },
    });

    await this.audit.record({
      userId: user.id,
      action: isStockConflict ? 'SYNC_CONFLICT' : 'SYNC_REJECTED',
      entityType: 'SyncQueueEntry',
      entityId: queued.clientUuid,
      summary: `Offline sale from device ${queued.deviceId} could not be applied: ${message}`,
      metadata: { idempotencyKey: queued.idempotencyKey, code: responseCode },
    });

    this.logger.warn(`Sync ${status} for ${queued.idempotencyKey}: ${message}`);

    return {
      idempotencyKey: queued.idempotencyKey,
      clientUuid: queued.clientUuid,
      status,
      message,
    };
  }

  /**
   * Catalogue delta for offline caching.
   *
   * The device sends the timestamp of its last successful pull and gets
   * back only what changed, so a till on a slow link is not re-downloading
   * the whole catalogue on every reconnect (§26).
   */
  async pull(since?: string) {
    const cutoff = since ? new Date(since) : undefined;
    const where = cutoff ? { updatedAt: { gt: cutoff } } : {};
    const serverTime = new Date().toISOString();

    const [products, categories, customers] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          inventory: { select: { quantity: true } },
          category: { select: { id: true, name: true } },
          barcodes: { where: { isActive: true }, select: { barcode: true, isPrimary: true } },
          batches: {
            where: { quantity: { gt: 0 } },
            orderBy: { expiryDate: 'asc' },
            select: { id: true, batchNumber: true, expiryDate: true, quantity: true },
          },
        },
      }),
      this.prisma.category.findMany({ where }),
      this.prisma.customer.findMany({
        where: { ...where, isActive: true },
        select: { id: true, name: true, phone: true, isWalkIn: true },
      }),
    ]);

    return {
      serverTime,
      since: since ?? null,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        // Every active code, so an offline till can resolve any of them.
        barcodes: p.barcodes.map((b) => b.barcode),
        barcode: p.barcodes.find((b) => b.isPrimary)?.barcode ?? p.barcodes[0]?.barcode ?? null,
        brand: p.brand,
        categoryId: p.categoryId,
        category: p.category.name,
        sellingPrice: p.sellingPrice.toFixed(2),
        unit: p.unit,
        imageUrl: p.imageUrl,
        stock: p.inventory?.quantity ?? 0,
        minStockLevel: p.minStockLevel,
        tracksExpiry: p.tracksExpiry,
        // The till groups sizes into one tile from the cached catalogue, so
        // these have to travel with it or grouping stops working offline.
        variantGroupId: p.variantGroupId,
        variantName: p.variantName,
        variantSort: p.variantSort,
        isActive: p.isActive,
        // Cached so the device can refuse to sell expired stock offline.
        earliestExpiry: p.batches[0]?.expiryDate.toISOString().slice(0, 10) ?? null,
        updatedAt: p.updatedAt.toISOString(),
      })),
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
      })),
      customers,
      counts: {
        products: products.length,
        categories: categories.length,
        customers: customers.length,
      },
    };
  }

  async status(deviceId?: string) {
    const where = deviceId ? { deviceId } : {};

    const [grouped, lastAccepted, recentFailures] = await Promise.all([
      this.prisma.syncQueueEntry.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      this.prisma.syncQueueEntry.findFirst({
        where: { ...where, status: SyncStatus.ACCEPTED },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true },
      }),
      this.prisma.syncQueueEntry.findMany({
        where: { ...where, status: { in: [SyncStatus.CONFLICT, SyncStatus.REJECTED] }, resolvedAt: null },
        orderBy: { receivedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          idempotencyKey: true,
          clientUuid: true,
          deviceId: true,
          status: true,
          errorMessage: true,
          conflicts: true,
          clientTime: true,
          receivedAt: true,
        },
      }),
    ]);

    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count]));

    return {
      lastSuccessfulSyncAt: lastAccepted?.receivedAt.toISOString() ?? null,
      counts: {
        accepted: counts[SyncStatus.ACCEPTED] ?? 0,
        duplicate: counts[SyncStatus.DUPLICATE] ?? 0,
        conflict: counts[SyncStatus.CONFLICT] ?? 0,
        rejected: counts[SyncStatus.REJECTED] ?? 0,
      },
      needsAttention: recentFailures.map((f) => ({
        id: f.id,
        idempotencyKey: f.idempotencyKey,
        clientUuid: f.clientUuid,
        deviceId: f.deviceId,
        status: f.status,
        message: f.errorMessage,
        conflicts: f.conflicts,
        soldAt: f.clientTime.toISOString(),
        receivedAt: f.receivedAt.toISOString(),
      })),
    };
  }

  /** Mark a conflict as dealt with, so it leaves the attention list. */
  async resolve(entryId: string, note: string, user: AuthenticatedUser) {
    const entry = await this.prisma.syncQueueEntry.update({
      where: { id: entryId },
      data: {
        resolvedById: user.id,
        resolvedAt: new Date(),
        errorMessage: note.slice(0, 500),
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'SYNC_CONFLICT_RESOLVED',
      entityType: 'SyncQueueEntry',
      entityId: entryId,
      summary: `${user.firstName} ${user.lastName} resolved a sync conflict from device ${entry.deviceId}`,
      metadata: { note },
    });

    return { id: entry.id, resolvedAt: entry.resolvedAt?.toISOString() };
  }
}
