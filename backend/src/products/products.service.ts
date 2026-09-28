import { BadRequestException, Injectable } from '@nestjs/common';
import { MovementType, Prisma, StockCountStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { money } from '../common/utils/money';
import type { AuthenticatedUser } from '../common/decorators';
import type { CreateProductDto, UpdatePriceDto, UpdateProductDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The next free SKU, following whatever convention the catalogue
   * already uses: LMB-<CATEGORY CODE>-<NNN>.
   *
   * The category's code is read from its existing products rather than
   * re-derived from its name. Several of them are irregular — Hair Care
   * is HAR, Masks is MSK, Cleansers is CLN — so deriving would quietly
   * start a second series alongside the first.
   */
  async suggestSku(categoryId?: string, name?: string) {
    let code: string | null = null;

    if (categoryId) {
      const siblings = await this.prisma.product.findMany({
        where: { categoryId, sku: { startsWith: 'LMB-' } },
        select: { sku: true },
      });

      const counts = new Map<string, number>();
      for (const { sku } of siblings) {
        const segment = sku.split('-')[1];
        if (segment) counts.set(segment, (counts.get(segment) ?? 0) + 1);
      }

      // The code this category actually uses, not the one we would pick.
      code = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      if (!code) {
        const category = await this.prisma.category.findUnique({
          where: { id: categoryId },
          select: { name: true },
        });
        code = deriveCode(category?.name);
      }
    }

    code ??= deriveCode(name) ?? 'GEN';

    const prefix = `LMB-${code}-`;
    const existing = await this.prisma.product.findMany({
      where: { sku: { startsWith: prefix } },
      select: { sku: true },
    });

    let next =
      existing.reduce((max, { sku }) => {
        const n = Number.parseInt(sku.slice(prefix.length), 10);
        return Number.isFinite(n) ? Math.max(max, n) : max;
      }, 0) + 1;

    // A deactivated product still holds its SKU, so keep stepping until
    // the number is genuinely free.
    let sku = `${prefix}${String(next).padStart(3, '0')}`;
    while (await this.prisma.product.findUnique({ where: { sku }, select: { id: true } })) {
      next += 1;
      sku = `${prefix}${String(next).padStart(3, '0')}`;
    }

    return { sku, code };
  }

  async create(dto: CreateProductDto, user: AuthenticatedUser) {
    const costPrice = money(dto.costPrice);
    const sellingPrice = money(dto.sellingPrice);

    if (sellingPrice.lessThan(costPrice)) {
      throw new BadRequestException(
        'The selling price is below the cost price. Adjust one of them to continue.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: dto.name,
          sku: dto.sku,
          // Created through the relation so the first code is primary.
          ...(dto.barcode?.trim()
            ? {
                barcodes: {
                  create: { barcode: dto.barcode.trim(), isPrimary: true, isActive: true },
                },
              }
            : {}),
          description: dto.description,
          categoryId: dto.categoryId,
          brand: dto.brand,
          costPrice,
          sellingPrice,
          minStockLevel: dto.minStockLevel ?? 0,
          /*
           * A size given at creation opens a group of one. That is a
           * complete, usable state, not a half-built one: the till collapses
           * a single-size group back to an ordinary tile, and further sizes
           * are added later against a product that already carries its label.
           */
          ...(dto.variantName?.trim()
            ? {
                variantGroupId: randomUUID(),
                variantName: dto.variantName.trim(),
                variantSort: 0,
              }
            : {}),
          unit: dto.unit,
          imageUrl: dto.imageUrl,
          tracksExpiry: dto.tracksExpiry ?? false,
        },
      });

      const opening = dto.openingStock ?? 0;

      await tx.inventory.create({ data: { productId: product.id, quantity: opening } });

      // Stock never appears without a ledger entry explaining where it came
      // from, even at creation (§13).
      if (opening > 0) {
        let batchId: string | null = null;

        /*
         * A batch-tracked product sells first-expiry-first-out, drawing
         * from batches rather than the stock figure. Opening stock with
         * no batch therefore produced a product that showed units in
         * stock and refused every sale with "available 0". The batch is
         * now created with it, and required.
         */
        if (product.tracksExpiry) {
          if (!dto.openingBatchNumber || !dto.openingExpiryDate) {
            throw new BadRequestException(
              `${product.name} tracks expiry, so opening stock needs a batch number and expiry date.`,
            );
          }

          const expiry = new Date(dto.openingExpiryDate);
          expiry.setHours(0, 0, 0, 0);

          if (expiry.getTime() <= Date.now()) {
            throw new BadRequestException('The opening batch has already expired.');
          }

          const batch = await tx.productBatch.create({
            data: {
              productId: product.id,
              batchNumber: dto.openingBatchNumber.trim(),
              expiryDate: expiry,
              quantity: opening,
              costPrice,
            },
          });
          batchId = batch.id;
        }

        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            batchId,
            type: MovementType.OPENING_BALANCE,
            quantity: opening,
            previousQty: 0,
            newQty: opening,
            reason: 'Opening stock at product creation',
            unitCost: costPrice,
            userId: user.id,
          },
        });
      }

      await this.audit.recordInTransaction(tx, {
        userId: user.id,
        action: 'PRODUCT_CREATED',
        entityType: 'Product',
        entityId: product.id,
        summary: `${user.firstName} ${user.lastName} created product ${product.name} (${product.sku})`,
        metadata: { sku: product.sku, sellingPrice: sellingPrice.toFixed(2), openingStock: opening },
      });

      return product;
    });
  }

  async update(id: string, dto: UpdateProductDto, user: AuthenticatedUser) {
    const existing = await this.prisma.product.findUniqueOrThrow({ where: { id } });

    if (dto.isActive === false) {
      const soldCount = await this.prisma.saleItem.count({ where: { productId: id } });
      // Same outcome as DELETE on a sold product, so the same consequence:
      // the codes are freed rather than left reserved against a product
      // nobody can sell. See remove().
      const released = await this.prisma.productBarcode.findMany({
        where: { productId: id },
        select: { barcode: true },
      });
      await this.prisma.productBarcode.deleteMany({ where: { productId: id } });
      // §51.14 — products with history are deactivated, never deleted. This
      // endpoint only ever deactivates, so history is safe either way; the
      // count is surfaced in the audit line for context.
      await this.audit.record({
        userId: user.id,
        action: 'PRODUCT_DEACTIVATED',
        entityType: 'Product',
        entityId: id,
        summary:
          `${user.firstName} ${user.lastName} deactivated ${existing.name} ` +
          `(${soldCount} historical sale line(s) retained` +
          `${released.length ? `, ${released.length} barcode(s) released: ${released.map((b) => b.barcode).join(', ')}` : ''})`,
      });
    }

    // Barcodes are managed through their own endpoints, so they are not
    // part of an ordinary product edit.
    const { barcode: _ignored, ...rest } = dto as typeof dto & { barcode?: string };

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...rest,
        ...(dto.isActive === false ? { deactivatedAt: new Date() } : {}),
        ...(dto.isActive === true ? { deactivatedAt: null } : {}),
      },
    });

    if (dto.isActive !== false) {
      await this.audit.record({
        userId: user.id,
        action: 'PRODUCT_UPDATED',
        entityType: 'Product',
        entityId: id,
        summary: `${user.firstName} ${user.lastName} updated ${product.name}`,
      });
    }

    return product;
  }

  /**
   * Delete a product.
   *
   * §51.14 draws the line at history: a product that has been sold is
   * deactivated, never removed, because its sale lines must keep pointing
   * at a real product for receipts, returns and reports to stay truthful.
   * A product with no sale lines is a genuine mistake — a typo, a
   * duplicate — and is removed outright along with the records that only
   * exist to describe it.
   *
   * The caller is told which of the two happened rather than being left to
   * guess from a bare 204.
   */
  async remove(id: string, user: AuthenticatedUser) {
    const existing = await this.prisma.product.findUniqueOrThrow({ where: { id } });
    const soldCount = await this.prisma.saleItem.count({ where: { productId: id } });

    /*
     * A count still being taken is not history, it is work in progress, and
     * removing one of its lines underneath the person counting would leave
     * them with a total they cannot explain. They are asked to finish or
     * cancel it first. Without this the delete failed on a foreign key and
     * surfaced as "A related record was not found. Please refresh and try
     * again." — which named nothing and suggested a refresh that cannot help.
     */
    const openCount = await this.prisma.stockCountItem.findFirst({
      where: { productId: id, stockCount: { status: StockCountStatus.IN_PROGRESS } },
      select: { stockCount: { select: { countNumber: true } } },
    });

    if (openCount) {
      throw new BadRequestException(
        `${existing.name} is part of stock count ${openCount.stockCount.countNumber}, which is still open. ` +
          'Approve or cancel that count first.',
      );
    }

    // An approved count is history in the same way a sale is: its lines must
    // keep resolving to a real product, so the product is kept.
    const countedCount = await this.prisma.stockCountItem.count({
      where: { productId: id, stockCount: { status: StockCountStatus.APPROVED } },
    });

    if (soldCount > 0 || countedCount > 0) {
      if (!existing.isActive) {
        throw new BadRequestException(
          `${existing.name} has already been removed from sale. Its history keeps it on record.`,
        );
      }

      const because = [
        soldCount > 0 ? `${soldCount} sale line(s)` : null,
        countedCount > 0 ? `${countedCount} approved stock-count line(s)` : null,
      ]
        .filter(Boolean)
        .join(' and ');

      /*
       * The barcodes go even though the product stays. A barcode is a label
       * mapping, not an accounting record: keeping it would hold the code
       * globally reserved against a product nobody can sell, so the same
       * physical code could never be registered again. Sale lines reference
       * the product, not its barcodes, so history is untouched — and a stock
       * count's scan rows survive by design, keeping the code as a string.
       */
      const released = await this.prisma.$transaction(async (tx) => {
        const codes = await tx.productBarcode.findMany({
          where: { productId: id },
          select: { barcode: true },
        });

        await tx.productBarcode.deleteMany({ where: { productId: id } });
        await tx.product.update({
          where: { id },
          data: { isActive: false, deactivatedAt: new Date() },
        });

        return codes.map((c) => c.barcode);
      });

      await this.audit.record({
        userId: user.id,
        action: 'PRODUCT_DEACTIVATED',
        entityType: 'Product',
        entityId: id,
        summary:
          `${user.firstName} ${user.lastName} removed ${existing.name} from sale ` +
          `(${because} retained` +
          `${released.length ? `, ${released.length} barcode(s) released: ${released.join(', ')}` : ''})`,
      });

      return {
        deleted: false,
        deactivated: true,
        soldCount,
        barcodesRemoved: released.length,
        message:
          `${existing.name} has ${because}, so it was removed from sale rather than deleted. ` +
          `Its history is intact` +
          `${released.length ? ` and its ${released.length} barcode(s) were freed for reuse` : ''}.`,
      };
    }

    /*
     * Nothing has been sold, so the only rows referring to this product
     * are ones describing it. They go with it, in one transaction, so a
     * failure half-way cannot leave an inventory row or a batch orphaned.
     * Anything holding a genuinely independent record — a stock count that
     * has been approved, for instance — would fail the foreign key here
     * rather than be quietly discarded.
     */
    const removedCodes = await this.prisma.$transaction(async (tx) => {
      const codes = await tx.productBarcode.findMany({
        where: { productId: id },
        select: { barcode: true },
      });

      /*
       * Lines from counts that were abandoned. An open count was refused
       * above and an approved one forced a deactivation, so anything left
       * here belongs to a cancelled count and is not a record of anything.
       */
      await tx.stockCountItem.deleteMany({
        where: { productId: id, stockCount: { status: StockCountStatus.CANCELLED } },
      });
      await tx.stockCountScan.deleteMany({
        where: {
          barcodeId: { in: (await tx.productBarcode.findMany({
            where: { productId: id },
            select: { id: true },
          })).map((b) => b.id) },
          stockCount: { status: StockCountStatus.CANCELLED },
        },
      });

      await tx.inventoryMovement.deleteMany({ where: { productId: id } });
      await tx.productBatch.deleteMany({ where: { productId: id } });
      await tx.inventory.deleteMany({ where: { productId: id } });
      await tx.productBarcode.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });

      return codes.map((c) => c.barcode);
    });

    // Recorded after the fact: the audit row outlives the product, and
    // carries the SKU so the deletion is still legible later.
    await this.audit.record({
      userId: user.id,
      action: 'PRODUCT_DELETED',
      entityType: 'Product',
      entityId: id,
      summary:
        `${user.firstName} ${user.lastName} deleted ${existing.name} (${existing.sku}) — never sold` +
        `${removedCodes.length ? `; barcode(s) removed: ${removedCodes.join(', ')}` : ''}`,
    });

    return {
      deleted: true,
      deactivated: false,
      soldCount: 0,
      barcodesRemoved: removedCodes.length,
      message: `${existing.name} was deleted.`,
    };
  }

  /**
   * Price changes are separated from ordinary edits because they need a
   * distinct permission and always carry a reason into the audit log —
   * "John changed the price of Vitamin C Serum" (§19).
   */
  async updatePrice(id: string, dto: UpdatePriceDto, user: AuthenticatedUser) {
    const existing = await this.prisma.product.findUniqueOrThrow({ where: { id } });

    if (dto.costPrice === undefined && dto.sellingPrice === undefined) {
      throw new BadRequestException('Provide a new cost price or selling price.');
    }

    const costPrice = dto.costPrice !== undefined ? money(dto.costPrice) : existing.costPrice;
    const sellingPrice =
      dto.sellingPrice !== undefined ? money(dto.sellingPrice) : existing.sellingPrice;

    if (sellingPrice.lessThan(costPrice)) {
      throw new BadRequestException('The selling price cannot be below the cost price.');
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: { costPrice, sellingPrice },
    });

    await this.audit.record({
      userId: user.id,
      action: 'PRODUCT_PRICE_CHANGED',
      entityType: 'Product',
      entityId: id,
      summary: `${user.firstName} ${user.lastName} changed the price of ${product.name} from ${existing.sellingPrice.toFixed(2)} to ${sellingPrice.toFixed(2)}`,
      metadata: {
        reason: dto.reason,
        previousCost: existing.costPrice.toFixed(2),
        newCost: costPrice.toFixed(2),
        previousPrice: existing.sellingPrice.toFixed(2),
        newPrice: sellingPrice.toFixed(2),
      },
    });

    return product;
  }
}

/**
 * A three-letter code from a name: first word where it is long enough,
 * otherwise the name's letters squeezed together.
 */
function deriveCode(value?: string | null): string | null {
  if (!value) return null;

  const words = value.replace(/[^a-zA-Z ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const first = words[0];
  if (first.length >= 3) return first.slice(0, 3).toUpperCase();

  const letters = words.join('');
  return letters.length >= 3 ? letters.slice(0, 3).toUpperCase() : letters.toUpperCase().padEnd(3, 'X');
}
