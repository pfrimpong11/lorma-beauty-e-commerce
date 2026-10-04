import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MovementType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { money } from '../common/utils/money';
import { AdjustStockDto, ReceiveStockDto, StockInDto, WriteOffDto } from './dto/inventory.dto';
import { randomUUID } from 'node:crypto';

@ApiTags('inventory')
@Controller({ path: 'inventory', version: '1' })
export class InventoryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({ summary: 'Stock levels with valuation' })
  async list(
    @Query('status') status?: 'low' | 'out' | 'ok',
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    const take = Math.min(Number.parseInt(pageSize, 10) || 50, 200);
    const skip = (Math.max(Number.parseInt(page, 10) || 1, 1) - 1) * take;

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(status === 'out' ? { inventory: { quantity: { lte: 0 } } } : {}),
    };

    const products = await this.prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { inventory: true, category: { select: { name: true } } },
    });

    // Low stock compares two columns (quantity <= minStockLevel), which
    // Prisma's filter language cannot express, so it is filtered here.
    const filtered = products.filter((p) => {
      const qty = p.inventory?.quantity ?? 0;
      if (status === 'low') return qty > 0 && qty <= p.minStockLevel;
      if (status === 'ok') return qty > p.minStockLevel;
      return true;
    });

    const rows = filtered.slice(skip, skip + take).map((p) => {
      const qty = p.inventory?.quantity ?? 0;
      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category.name,
        quantity: qty,
        minStockLevel: p.minStockLevel,
        costPrice: p.costPrice.toFixed(2),
        sellingPrice: p.sellingPrice.toFixed(2),
        stockValue: p.costPrice.mul(qty).toFixed(2),
        retailValue: p.sellingPrice.mul(qty).toFixed(2),
        status: qty === 0 ? 'OUT_OF_STOCK' : qty <= p.minStockLevel ? 'LOW_STOCK' : 'OK',
      };
    });

    const totalValue = filtered.reduce(
      (sum, p) => sum.add(p.costPrice.mul(p.inventory?.quantity ?? 0)),
      new Prisma.Decimal(0),
    );

    return {
      data: rows,
      meta: {
        page: Number(page),
        pageSize: take,
        total: filtered.length,
        pages: Math.ceil(filtered.length / take),
        totalStockValue: totalValue.toFixed(2),
      },
    };
  }

  @Get('movements')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({ summary: 'Inventory movement history' })
  async movements(
    @Query('productId') productId?: string,
    @Query('type') type?: MovementType,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    const take = Math.min(Number.parseInt(pageSize, 10) || 50, 200);
    const skip = (Math.max(Number.parseInt(page, 10) || 1, 1) - 1) * take;

    const where: Prisma.InventoryMovementWhereInput = {
      ...(productId ? { productId } : {}),
      ...(type ? { type } : {}),
    };

    const [total, movements] = await Promise.all([
      this.prisma.inventoryMovement.count({ where }),
      this.prisma.inventoryMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          product: { select: { name: true, sku: true } },
          user: { select: { firstName: true, lastName: true } },
          batch: { select: { batchNumber: true } },
        },
      }),
    ]);

    return {
      data: movements.map((m) => ({
        id: m.id,
        product: m.product.name,
        sku: m.product.sku,
        type: m.type,
        quantity: m.quantity,
        previousQty: m.previousQty,
        newQty: m.newQty,
        reason: m.reason,
        batch: m.batch?.batchNumber ?? null,
        user: `${m.user.firstName} ${m.user.lastName}`,
        createdAt: m.createdAt.toISOString(),
      })),
      meta: { page: Number(page), pageSize: take, total, pages: Math.ceil(total / take) },
    };
  }

  @Get('expiring')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({ summary: 'Batches expiring within the warning window, and expired stock' })
  async expiring(@Query('days') days = '30') {
    const window = Math.min(Math.max(Number.parseInt(days, 10) || 30, 1), 365);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + window);

    const batches = await this.prisma.productBatch.findMany({
      where: { quantity: { gt: 0 }, expiryDate: { lte: cutoff } },
      orderBy: { expiryDate: 'asc' },
      include: { product: { select: { id: true, name: true, sku: true, costPrice: true } } },
    });

    const rows = batches.map((b) => {
      const daysLeft = Math.floor(
        (b.expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        batchId: b.id,
        batchNumber: b.batchNumber,
        productId: b.product.id,
        product: b.product.name,
        sku: b.product.sku,
        quantity: b.quantity,
        expiryDate: b.expiryDate.toISOString().slice(0, 10),
        daysUntilExpiry: daysLeft,
        status: daysLeft < 0 ? 'EXPIRED' : 'EXPIRING_SOON',
        valueAtCost: b.product.costPrice.mul(b.quantity).toFixed(2),
      };
    });

    return {
      data: rows,
      meta: {
        windowDays: window,
        expired: rows.filter((r) => r.status === 'EXPIRED').length,
        expiringSoon: rows.filter((r) => r.status === 'EXPIRING_SOON').length,
      },
    };
  }

  @Post('stock-in')
  @RequirePermissions(PERMISSIONS.INVENTORY_STOCK_IN)
  @ApiOperation({ summary: 'Receive stock' })
  async stockIn(@Body() dto: StockInDto, @CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: dto.productId },
        select: { id: true, name: true, tracksExpiry: true, costPrice: true },
      });

      if (product.tracksExpiry && (!dto.batchNumber || !dto.expiryDate)) {
        throw new BadRequestException(
          `${product.name} tracks expiry, so a batch number and expiry date are required.`,
        );
      }

      const before = await tx.inventory.findUniqueOrThrow({
        where: { productId: dto.productId },
        select: { quantity: true },
      });

      await tx.inventory.update({
        where: { productId: dto.productId },
        data: { quantity: { increment: dto.quantity }, version: { increment: 1 } },
      });

      let batchId: string | null = null;
      if (product.tracksExpiry && dto.batchNumber && dto.expiryDate) {
        const expiry = new Date(dto.expiryDate);
        expiry.setHours(0, 0, 0, 0);

        if (expiry.getTime() <= Date.now()) {
          throw new BadRequestException('Cannot receive stock that has already expired.');
        }

        // Receiving more of an existing batch tops it up rather than
        // creating a duplicate batch number for the same product.
        const batch = await tx.productBatch.upsert({
          where: {
            productId_batchNumber: { productId: dto.productId, batchNumber: dto.batchNumber },
          },
          update: { quantity: { increment: dto.quantity } },
          create: {
            productId: dto.productId,
            batchNumber: dto.batchNumber,
            expiryDate: expiry,
            quantity: dto.quantity,
            costPrice: dto.unitCost ? money(dto.unitCost) : product.costPrice,
          },
        });
        batchId = batch.id;
      }

      await tx.inventoryMovement.create({
        data: {
          productId: dto.productId,
          batchId,
          type: MovementType.STOCK_IN,
          quantity: dto.quantity,
          previousQty: before.quantity,
          newQty: before.quantity + dto.quantity,
          reason: dto.reason,
          unitCost: dto.unitCost ? money(dto.unitCost) : product.costPrice,
          userId: user.id,
        },
      });

      await this.audit.recordInTransaction(tx, {
        userId: user.id,
        action: 'STOCK_RECEIVED',
        entityType: 'Product',
        entityId: dto.productId,
        summary: `${user.firstName} ${user.lastName} received ${dto.quantity} of ${product.name}`,
        metadata: { reason: dto.reason, batchNumber: dto.batchNumber },
      });

      return { productId: dto.productId, previousQty: before.quantity, newQty: before.quantity + dto.quantity };
    });
  }

  @Post('receive')
  @RequirePermissions(PERMISSIONS.INVENTORY_STOCK_IN)
  @ApiOperation({ summary: 'Receive a whole delivery in one transaction' })
  async receive(@Body() dto: ReceiveStockDto, @CurrentUser() user: AuthenticatedUser) {
    // One reference across every line, so the delivery reads as a single
    // document in the movement history.
    const receiptId = randomUUID();

    return this.prisma.$transaction(
      async (tx) => {
        const results: Array<{
          productId: string;
          name: string;
          previousQty: number;
          newQty: number;
        }> = [];

        for (const line of dto.lines) {
          const product = await tx.product.findUniqueOrThrow({
            where: { id: line.productId },
            select: { id: true, name: true, tracksExpiry: true, costPrice: true, isActive: true },
          });

          if (!product.isActive) {
            throw new BadRequestException(`${product.name} is not active and cannot be received.`);
          }

          if (product.tracksExpiry && (!line.batchNumber || !line.expiryDate)) {
            throw new BadRequestException(
              `${product.name} tracks expiry, so a batch number and expiry date are required.`,
            );
          }

          const before = await tx.inventory.findUniqueOrThrow({
            where: { productId: product.id },
            select: { quantity: true },
          });

          await tx.inventory.update({
            where: { productId: product.id },
            data: { quantity: { increment: line.quantity }, version: { increment: 1 } },
          });

          let batchId: string | null = null;
          if (product.tracksExpiry && line.batchNumber && line.expiryDate) {
            const expiry = new Date(line.expiryDate);
            expiry.setHours(0, 0, 0, 0);

            if (expiry.getTime() <= Date.now()) {
              throw new BadRequestException(
                `${product.name}: cannot receive stock that has already expired.`,
              );
            }

            const batch = await tx.productBatch.upsert({
              where: {
                productId_batchNumber: {
                  productId: product.id,
                  batchNumber: line.batchNumber,
                },
              },
              update: { quantity: { increment: line.quantity } },
              create: {
                productId: product.id,
                batchNumber: line.batchNumber,
                expiryDate: expiry,
                quantity: line.quantity,
                costPrice: line.unitCost ? money(line.unitCost) : product.costPrice,
              },
            });
            batchId = batch.id;
          }

          await tx.inventoryMovement.create({
            data: {
              productId: product.id,
              batchId,
              type: MovementType.STOCK_IN,
              quantity: line.quantity,
              previousQty: before.quantity,
              newQty: before.quantity + line.quantity,
              reason: dto.reason,
              unitCost: line.unitCost ? money(line.unitCost) : product.costPrice,
              referenceType: 'StockReceipt',
              referenceId: receiptId,
              userId: user.id,
            },
          });

          results.push({
            productId: product.id,
            name: product.name,
            previousQty: before.quantity,
            newQty: before.quantity + line.quantity,
          });
        }

        const units = dto.lines.reduce((sum, l) => sum + l.quantity, 0);

        await this.audit.recordInTransaction(tx, {
          userId: user.id,
          action: 'STOCK_RECEIVED',
          entityType: 'StockReceipt',
          entityId: receiptId,
          summary: `${user.firstName} ${user.lastName} received ${units} unit(s) across ${dto.lines.length} product(s)`,
          metadata: { reason: dto.reason, lines: dto.lines.length, units },
        });

        return { receiptId, lines: results, units, reason: dto.reason };
      },
      { timeout: 30_000 },
    );
  }

  @Post('adjust')
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  @ApiOperation({ summary: 'Correct a stock level to a counted quantity' })
  async adjust(@Body() dto: AdjustStockDto, @CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: dto.productId },
        select: { name: true, tracksExpiry: true },
      });

      const before = await tx.inventory.findUniqueOrThrow({
        where: { productId: dto.productId },
        select: { quantity: true },
      });

      const delta = dto.newQuantity - before.quantity;
      if (delta === 0) {
        throw new BadRequestException('The counted quantity matches the current stock level.');
      }

      /*
       * A batch-tracked product sells from its batches, not from this
       * figure, so moving one without the other leaves the till showing
       * stock it cannot sell. That used to happen silently.
       *
       * Counting fewer is unambiguous: the missing units come off the
       * batches nearest expiry, the order they would have sold in anyway.
       * Counting MORE is not — the extra units physically exist and carry
       * an expiry only the person holding them knows, so they come in
       * through Receive stock, where it is asked for.
       */
      if (product.tracksExpiry) {
        if (delta > 0) {
          throw new BadRequestException(
            `${product.name} is tracked in batches, so its stock cannot simply be raised — ` +
              'the new units need a batch number and expiry date. ' +
              'Use Inventory \u2192 Receive stock instead.',
          );
        }

        const batches = await tx.productBatch.findMany({
          where: { productId: dto.productId, quantity: { gt: 0 } },
          orderBy: { expiryDate: 'asc' },
          select: { id: true, quantity: true },
        });

        const held = batches.reduce((sum, b) => sum + b.quantity, 0);
        if (held < -delta) {
          throw new BadRequestException(
            `${product.name} holds ${held} across its batches, so it cannot be reduced by ${-delta}.`,
          );
        }

        let remaining = -delta;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const take = Math.min(batch.quantity, remaining);
          await tx.productBatch.update({
            where: { id: batch.id },
            data: { quantity: { decrement: take } },
          });
          remaining -= take;
        }
      }


      await tx.inventory.update({
        where: { productId: dto.productId },
        data: { quantity: dto.newQuantity, version: { increment: 1 }, lastCountedAt: new Date() },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: dto.productId,
          type: MovementType.ADJUSTMENT,
          quantity: delta,
          previousQty: before.quantity,
          newQty: dto.newQuantity,
          reason: dto.reason,
          userId: user.id,
        },
      });

      await this.audit.recordInTransaction(tx, {
        userId: user.id,
        action: 'INVENTORY_ADJUSTED',
        entityType: 'Product',
        entityId: dto.productId,
        summary: `${user.firstName} ${user.lastName} adjusted stock for ${product.name} from ${before.quantity} to ${dto.newQuantity}`,
        metadata: { reason: dto.reason, delta },
      });

      return { productId: dto.productId, previousQty: before.quantity, newQty: dto.newQuantity };
    });
  }

  @Post('write-off')
  @RequirePermissions(PERMISSIONS.INVENTORY_WRITE_OFF)
  @ApiOperation({ summary: 'Write off damaged or expired stock' })
  async writeOff(@Body() dto: WriteOffDto, @CurrentUser() user: AuthenticatedUser) {
    if (dto.type !== MovementType.DAMAGED && dto.type !== MovementType.EXPIRED) {
      throw new BadRequestException('Write-off type must be DAMAGED or EXPIRED.');
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: dto.productId },
        select: { name: true },
      });

      const before = await tx.inventory.findUniqueOrThrow({
        where: { productId: dto.productId },
        select: { quantity: true },
      });

      if (before.quantity < dto.quantity) {
        throw new BadRequestException(
          `Cannot write off ${dto.quantity} of ${product.name}; only ${before.quantity} in stock.`,
        );
      }

      await tx.inventory.update({
        where: { productId: dto.productId },
        data: { quantity: { decrement: dto.quantity }, version: { increment: 1 } },
      });

      if (dto.batchId) {
        await tx.productBatch.update({
          where: { id: dto.batchId },
          data: { quantity: { decrement: dto.quantity } },
        });
      }

      await tx.inventoryMovement.create({
        data: {
          productId: dto.productId,
          batchId: dto.batchId ?? null,
          type: dto.type,
          quantity: -dto.quantity,
          previousQty: before.quantity,
          newQty: before.quantity - dto.quantity,
          reason: dto.reason,
          userId: user.id,
        },
      });

      await this.audit.recordInTransaction(tx, {
        userId: user.id,
        action: 'STOCK_WRITTEN_OFF',
        entityType: 'Product',
        entityId: dto.productId,
        summary: `${user.firstName} ${user.lastName} wrote off ${dto.quantity} of ${product.name} as ${dto.type.toLowerCase()}`,
        metadata: { reason: dto.reason, type: dto.type },
      });

      return {
        productId: dto.productId,
        previousQty: before.quantity,
        newQty: before.quantity - dto.quantity,
      };
    });
  }
}
