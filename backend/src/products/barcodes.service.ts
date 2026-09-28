import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/decorators';

/**
 * Barcodes that identify a product.
 *
 * A product can carry many — a supplier changes the printed code between
 * runs, a multipack has its own, and serialized goods carry one per unit.
 * A barcode belongs to exactly one product, which is what makes the
 * lookup unambiguous.
 *
 * Price deliberately lives on the product. Repeating it per barcode would
 * mean a price change had to be applied N times and could drift.
 */
@Injectable()
export class BarcodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Resolve a scanned code to its product.
   *
   * The single lookup used by the admin tools today and by the sales
   * flow — one place to change if barcode semantics ever grow.
   */
  async resolve(barcode: string) {
    const code = barcode.trim();
    if (!code) return null;

    for (const candidate of equivalentCodes(code)) {
      const match = await this.prisma.productBarcode.findUnique({
        where: { barcode: candidate },
        include: {
          product: {
            include: {
              category: { select: { id: true, name: true } },
              inventory: { select: { quantity: true } },
            },
          },
        },
      });

      if (match && match.isActive && match.product.isActive) return match;
    }

    return null;
  }

  async list(productId: string) {
    return this.prisma.productBarcode.findMany({
      where: { productId },
      orderBy: [{ isPrimary: 'desc' }, { isActive: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async add(
    productId: string,
    input: { barcode: string; isPrimary?: boolean; note?: string },
    user: AuthenticatedUser,
  ) {
    // Whitespace only — the value stays a string so leading zeros survive.
    const code = input.barcode.trim();
    if (!code) throw new BadRequestException('Enter a barcode.');

    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { id: true, name: true },
    });

    const existing = await this.prisma.productBarcode.findUnique({
      where: { barcode: code },
      include: { product: { select: { id: true, name: true, sku: true } } },
    });

    if (existing) {
      // Naming the owner is the difference between a usable error and a
      // dead end — the admin usually mis-scanned a neighbouring item.
      throw new ConflictException(
        existing.product.id === productId
          ? `${code} is already on this product.`
          : `${code} already belongs to ${existing.product.name} (${existing.product.sku}).`,
      );
    }

    const count = await this.prisma.productBarcode.count({ where: { productId } });
    // The first barcode is the primary one by definition.
    const makePrimary = input.isPrimary || count === 0;

    const created = await this.prisma.$transaction(async (tx) => {
      if (makePrimary) {
        await tx.productBarcode.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.productBarcode.create({
        data: { productId, barcode: code, isPrimary: makePrimary, note: input.note },
      });
    });

    await this.audit.record({
      userId: user.id,
      action: 'BARCODE_ADDED',
      entityType: 'Product',
      entityId: productId,
      summary: `${user.firstName} ${user.lastName} added barcode ${code} to ${product.name}`,
      metadata: { barcode: code, isPrimary: makePrimary },
    });

    return created;
  }

  async update(
    productId: string,
    barcodeId: string,
    input: { isPrimary?: boolean; isActive?: boolean; note?: string },
    user: AuthenticatedUser,
  ) {
    const barcode = await this.prisma.productBarcode.findFirst({
      where: { id: barcodeId, productId },
      include: { product: { select: { name: true } } },
    });
    if (!barcode) throw new NotFoundException('That barcode is not on this product.');

    if (input.isActive === false && barcode.isPrimary) {
      throw new BadRequestException(
        'That is the primary barcode. Make another one primary before deactivating it.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.isPrimary) {
        // Only one primary per product — enforced by a partial unique
        // index, so the old one must be cleared in the same transaction.
        await tx.productBarcode.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.productBarcode.update({
        where: { id: barcodeId },
        data: {
          ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
      });
    });

    await this.audit.record({
      userId: user.id,
      action: input.isActive === false ? 'BARCODE_DEACTIVATED' : 'BARCODE_UPDATED',
      entityType: 'Product',
      entityId: productId,
      summary:
        input.isActive === false
          ? `${user.firstName} ${user.lastName} deactivated barcode ${barcode.barcode} on ${barcode.product.name}`
          : `${user.firstName} ${user.lastName} updated barcode ${barcode.barcode} on ${barcode.product.name}`,
      metadata: { barcode: barcode.barcode, ...input },
    });

    return updated;
  }

  /** The primary code, for display on a product row. */
  static primaryOf(barcodes: Array<{ barcode: string; isPrimary: boolean; isActive: boolean }>) {
    return (
      barcodes.find((b) => b.isPrimary && b.isActive)?.barcode ??
      barcodes.find((b) => b.isActive)?.barcode ??
      null
    );
  }

  /** Every code that should resolve to this product, for offline caching. */
  static activeCodes(barcodes: Array<{ barcode: string; isActive: boolean }>) {
    return barcodes.filter((b) => b.isActive).map((b) => b.barcode);
  }

  static readonly include = {
    select: { id: true, barcode: true, isPrimary: true, isActive: true, note: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  } satisfies Prisma.Product$barcodesArgs;
}

/**
 * The forms of a barcode that mean the same product.
 *
 * A UPC-A code is 12 digits on the packaging, but most scanners — the
 * FR20 included — transmit it expanded to EAN-13 with a leading zero.
 * "305210287303" and "0305210287303" are the same item, so registering
 * one from the box and scanning the other must not miss.
 *
 * This is a defined equivalence in the GS1 standard, not a guess: the
 * only difference is that zero. Nothing else is tried.
 */
export function equivalentCodes(code: string): string[] {
  const candidates = [code];

  if (/^\d{13}$/.test(code) && code.startsWith('0')) {
    // EAN-13 carrying a UPC-A -> the 12-digit form on the packaging.
    candidates.push(code.slice(1));
  } else if (/^\d{12}$/.test(code)) {
    // UPC-A -> the 13-digit form a scanner is likely to send.
    candidates.push(`0${code}`);
  }

  return candidates;
}
