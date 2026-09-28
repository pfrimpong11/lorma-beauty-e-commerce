import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { money } from '../common/utils/money';
import type { AuthenticatedUser } from '../common/decorators';
import type { AddVariantDto, UpdateVariantDto } from './dto/variant.dto';

/**
 * Sizes of one article.
 *
 * A size is a separate product sharing a group id, not a field on a
 * product. That is not a workaround: Small and Large are different things
 * on the shelf. Each is counted, priced, scanned, received and sold on its
 * own, and every one of those already works per product. Modelling a size
 * as anything less would mean reinventing stock, batches and barcodes a
 * second time, one level down.
 *
 * What the group adds is presentation: the till shows one row and asks
 * which size, rather than four rows that differ by a word.
 */
@Injectable()
export class VariantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Every size in this product's group, the product itself included. */
  async list(productId: string) {
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: { inventory: true },
    });

    if (!product.variantGroupId) {
      return { groupId: null, baseName: product.name, variants: [] };
    }

    const siblings = await this.prisma.product.findMany({
      where: { variantGroupId: product.variantGroupId },
      include: { inventory: true, barcodes: { where: { isPrimary: true } } },
      orderBy: [{ variantSort: 'asc' }, { variantName: 'asc' }],
    });

    return {
      groupId: product.variantGroupId,
      baseName: product.name,
      variants: siblings.map((v) => this.present(v)),
    };
  }

  private present(v: {
    id: string;
    name: string;
    sku: string;
    variantName: string | null;
    variantSort: number;
    sellingPrice: Prisma.Decimal;
    costPrice: Prisma.Decimal;
    isActive: boolean;
    minStockLevel: number;
    inventory: { quantity: number } | null;
    barcodes?: Array<{ barcode: string }>;
  }) {
    const stock = v.inventory?.quantity ?? 0;
    return {
      id: v.id,
      name: v.name,
      sku: v.sku,
      variantName: v.variantName,
      variantSort: v.variantSort,
      sellingPrice: v.sellingPrice.toFixed(2),
      costPrice: v.costPrice.toFixed(2),
      stock,
      minStockLevel: v.minStockLevel,
      isLowStock: stock > 0 && stock <= v.minStockLevel,
      isOutOfStock: stock === 0,
      isActive: v.isActive,
      barcode: v.barcodes?.[0]?.barcode ?? null,
    };
  }

  /**
   * Add a size.
   *
   * The first call on a product that has no sizes also names the product's
   * existing stock — it has to, because that stock is a size too and
   * leaving it unlabelled would strand it outside the group it belongs to.
   */
  async add(productId: string, dto: AddVariantDto, user: AuthenticatedUser) {
    const base = await this.prisma.product.findUniqueOrThrow({ where: { id: productId } });

    if (!base.isActive) {
      throw new BadRequestException(`${base.name} is not on sale, so sizes cannot be added to it.`);
    }

    const label = dto.variantName.trim();
    if (!label) throw new BadRequestException('A size needs a label.');

    let groupId = base.variantGroupId;
    let baseLabel: string | null = null;

    if (!groupId) {
      if (!dto.baseVariantName?.trim()) {
        throw new BadRequestException(
          `${base.name} has no sizes yet. Say what the current one is called as well as the new one.`,
        );
      }
      baseLabel = dto.baseVariantName.trim();
      if (baseLabel.toLowerCase() === label.toLowerCase()) {
        throw new BadRequestException('The two sizes cannot share a label.');
      }
      groupId = randomUUID();
    } else {
      const clash = await this.prisma.product.findFirst({
        where: { variantGroupId: groupId, variantName: { equals: label, mode: 'insensitive' } },
      });
      if (clash) {
        throw new ConflictException(`${base.name} already has a ${label} size.`);
      }
    }

    const sku = dto.sku.trim().toUpperCase();
    if (await this.prisma.product.findUnique({ where: { sku } })) {
      throw new ConflictException(`SKU ${sku} is already in use.`);
    }

    const costPrice = money(dto.costPrice);
    const sellingPrice = money(dto.sellingPrice);
    if (sellingPrice.lessThan(costPrice)) {
      throw new BadRequestException('The selling price is below the cost price.');
    }

    const opening = dto.openingStock ?? 0;

    // A size that tracks expiry needs its batch for the same reason a plain
    // product does: without one the stock shows and cannot be sold.
    if (base.tracksExpiry && opening > 0 && (!dto.openingBatchNumber || !dto.openingExpiryDate)) {
      throw new BadRequestException(
        `${base.name} tracks expiry, so opening stock needs a batch number and expiry date.`,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // Bring the existing product into the group first, so the group is
      // never left holding a single orphaned size.
      if (baseLabel) {
        await tx.product.update({
          where: { id: base.id },
          data: { variantGroupId: groupId, variantName: baseLabel, variantSort: 0 },
        });
      }

      const last = await tx.product.aggregate({
        where: { variantGroupId: groupId },
        _max: { variantSort: true },
      });

      const variant = await tx.product.create({
        data: {
          // Sizes share the article's name; the label is what separates them.
          name: base.name,
          sku,
          categoryId: base.categoryId,
          brand: base.brand,
          description: base.description,
          unit: base.unit,
          tracksExpiry: base.tracksExpiry,
          barcodeMode: base.barcodeMode,
          costPrice,
          sellingPrice,
          minStockLevel: dto.minStockLevel ?? base.minStockLevel,
          variantGroupId: groupId,
          variantName: label,
          variantSort: (last._max.variantSort ?? 0) + 1,
          ...(dto.barcode?.trim()
            ? { barcodes: { create: { barcode: dto.barcode.trim(), isPrimary: true, isActive: true } } }
            : {}),
        },
      });

      await tx.inventory.create({ data: { productId: variant.id, quantity: opening } });

      if (opening > 0) {
        let batchId: string | null = null;

        if (base.tracksExpiry) {
          const expiry = new Date(dto.openingExpiryDate!);
          expiry.setHours(0, 0, 0, 0);
          if (expiry.getTime() <= Date.now()) {
            throw new BadRequestException('The opening batch has already expired.');
          }
          const batch = await tx.productBatch.create({
            data: {
              productId: variant.id,
              batchNumber: dto.openingBatchNumber!.trim(),
              expiryDate: expiry,
              quantity: opening,
              costPrice,
            },
          });
          batchId = batch.id;
        }

        await tx.inventoryMovement.create({
          data: {
            productId: variant.id,
            batchId,
            type: MovementType.OPENING_BALANCE,
            quantity: opening,
            previousQty: 0,
            newQty: opening,
            reason: `Opening stock for the ${label} size`,
            unitCost: costPrice,
            userId: user.id,
          },
        });
      }

      return variant;
    });

    await this.audit.record({
      userId: user.id,
      action: 'PRODUCT_CREATED',
      entityType: 'Product',
      entityId: created.id,
      summary:
        `${user.firstName} ${user.lastName} added the ${label} size of ${base.name} (${sku})` +
        `${baseLabel ? `, naming the existing one ${baseLabel}` : ''}`,
    });

    return this.list(base.id);
  }

  /** Rename a size or move it in the order. */
  async update(variantId: string, dto: UpdateVariantDto, user: AuthenticatedUser) {
    const variant = await this.prisma.product.findUniqueOrThrow({ where: { id: variantId } });

    if (!variant.variantGroupId) {
      throw new BadRequestException(`${variant.name} is not one of a set of sizes.`);
    }

    const label = dto.variantName?.trim();

    if (label) {
      const clash = await this.prisma.product.findFirst({
        where: {
          variantGroupId: variant.variantGroupId,
          variantName: { equals: label, mode: 'insensitive' },
          id: { not: variantId },
        },
      });
      if (clash) throw new ConflictException(`There is already a ${label} size.`);
    }

    await this.prisma.product.update({
      where: { id: variantId },
      data: {
        ...(label ? { variantName: label } : {}),
        ...(dto.variantSort !== undefined ? { variantSort: dto.variantSort } : {}),
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'PRODUCT_UPDATED',
      entityType: 'Product',
      entityId: variantId,
      summary:
        `${user.firstName} ${user.lastName} updated the ${variant.variantName} size of ${variant.name}` +
        `${label && label !== variant.variantName ? `, renamed to ${label}` : ''}`,
    });

    return this.list(variantId);
  }

  /**
   * Take a product back out of its group.
   *
   * A group of one is not a set of sizes, so the last remaining sibling is
   * ungrouped with it rather than left showing a size chooser with a single
   * button.
   */
  async detach(variantId: string, user: AuthenticatedUser) {
    const variant = await this.prisma.product.findUniqueOrThrow({ where: { id: variantId } });
    if (!variant.variantGroupId) {
      throw new BadRequestException(`${variant.name} is not one of a set of sizes.`);
    }

    const groupId = variant.variantGroupId;

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: variantId },
        data: { variantGroupId: null, variantName: null, variantSort: 0 },
      });

      const left = await tx.product.findMany({ where: { variantGroupId: groupId } });
      if (left.length === 1) {
        await tx.product.update({
          where: { id: left[0].id },
          data: { variantGroupId: null, variantName: null, variantSort: 0 },
        });
      }
    });

    await this.audit.record({
      userId: user.id,
      action: 'PRODUCT_UPDATED',
      entityType: 'Product',
      entityId: variantId,
      summary: `${user.firstName} ${user.lastName} removed ${variant.name} (${variant.variantName}) from its set of sizes`,
    });

    return { detached: true };
  }
}
