import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from './products.service';
import { BarcodesService } from './barcodes.service';
import { VariantsService } from './variants.service';
import { AddBarcodeDto, UpdateBarcodeDto } from './dto/barcode.dto';
import { AddVariantDto, UpdateVariantDto } from './dto/variant.dto';
import { CreateProductDto, UpdatePriceDto, UpdateProductDto } from './dto/product.dto';

@ApiTags('products')
@Controller({ path: 'products', version: '1' })
export class ProductsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly barcodes: BarcodesService,
    private readonly variants: VariantsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCT_VIEW)
  @ApiOperation({ summary: 'Search and list products' })
  async list(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    const take = Math.min(Number.parseInt(pageSize, 10) || 50, 200);
    const skip = (Math.max(Number.parseInt(page, 10) || 1, 1) - 1) * take;

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { barcodes: { some: { barcode: search, isActive: true } } },
              { brand: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take,
        include: {
          category: { select: { id: true, name: true } },
          inventory: { select: { quantity: true } },
          barcodes: BarcodesService.include,
        },
      }),
    ]);

    return {
      data: products.map((p) => this.present(p)),
      meta: { page: Number(page), pageSize: take, total, pages: Math.ceil(total / take) },
    };
  }

  /** Barcode lookup — the scanner's hot path, so it is a dedicated route. */
  @Get('barcode/:barcode')
  @RequirePermissions(PERMISSIONS.PRODUCT_VIEW)
  @ApiOperation({ summary: 'Find a product by barcode' })
  async byBarcode(@Param('barcode') barcode: string) {
    const match = await this.barcodes.resolve(barcode);

    if (!match) {
      return { found: false, barcode, message: 'Barcode not found.' };
    }

    const all = await this.barcodes.list(match.productId);
    return {
      found: true,
      matchedBarcode: match.barcode,
      product: this.present({ ...match.product, barcodes: all }),
    };
  }

  /** Declared before :id, or the path would be read as a product id. */
  @Get('sku-suggestion')
  @RequirePermissions(PERMISSIONS.PRODUCT_CREATE)
  @ApiOperation({ summary: 'The next free SKU for a category' })
  suggestSku(@Query('categoryId') categoryId?: string, @Query('name') name?: string) {
    return this.products.suggestSku(categoryId, name);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_VIEW)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        inventory: { select: { quantity: true } },
        barcodes: BarcodesService.include,
        batches: {
          where: { quantity: { gt: 0 } },
          orderBy: { expiryDate: 'asc' },
          select: { id: true, batchNumber: true, expiryDate: true, quantity: true },
        },
      },
    });
    return this.present(product);
  }

  // ---- barcodes ----------------------------------------------------------

  @Get(':id/barcodes')
  @RequirePermissions(PERMISSIONS.PRODUCT_VIEW)
  @ApiOperation({ summary: 'Every barcode on a product' })
  listBarcodes(@Param('id', ParseUUIDPipe) id: string) {
    return this.barcodes.list(id).then((data) => ({ data }));
  }

  @Post(':id/barcodes')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @ApiOperation({ summary: 'Attach a barcode to a product' })
  addBarcode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddBarcodeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.barcodes.add(id, dto, user);
  }

  @Patch(':id/barcodes/:barcodeId')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @ApiOperation({ summary: 'Make a barcode primary, or deactivate it' })
  updateBarcode(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('barcodeId', ParseUUIDPipe) barcodeId: string,
    @Body() dto: UpdateBarcodeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.barcodes.update(id, barcodeId, dto, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCT_CREATE)
  @ApiOperation({ summary: 'Create a product' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthenticatedUser) {
    return this.products.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @ApiOperation({ summary: 'Update or deactivate a product' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.update(id, dto, user);
  }

  // --- sizes ---------------------------------------------------------------
  // A size is a product in its own right, so it is created and edited under
  // the article it belongs to rather than through a separate resource.

  @Get(':id/variants')
  @RequirePermissions(PERMISSIONS.PRODUCT_VIEW)
  @ApiOperation({ summary: 'Every size of this product' })
  listVariants(@Param('id', ParseUUIDPipe) id: string) {
    return this.variants.list(id);
  }

  @Post(':id/variants')
  @RequirePermissions(PERMISSIONS.PRODUCT_CREATE)
  @ApiOperation({ summary: 'Add a size, with its own price and stock' })
  addVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddVariantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.variants.add(id, dto, user);
  }

  @Patch(':id/variant')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @ApiOperation({ summary: 'Rename a size or move it in the order' })
  updateVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVariantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.variants.update(id, dto, user);
  }

  @Delete(':id/variant')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @ApiOperation({ summary: 'Take a product out of its set of sizes, keeping the product' })
  detachVariant(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.variants.detach(id, user);
  }

  // Deleting is its own permission, held by an administrator alone: editing a
  // product and taking it off the shelf are different decisions.
  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_DEACTIVATE)
  @ApiOperation({ summary: 'Delete a product, or deactivate it if it has been sold' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.products.remove(id, user);
  }

  // Separate route and permission: a cashier may edit nothing here (§51.4).
  @Patch(':id/price')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE_PRICE)
  @ApiOperation({ summary: 'Change a product price (requires a reason)' })
  updatePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePriceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.updatePrice(id, dto, user);
  }

  private present(p: {
    id: string;
    name: string;
    sku: string;
    barcodes?: Array<{ id: string; barcode: string; isPrimary: boolean; isActive: boolean; note: string | null }>;
    brand: string | null;
    unit: string;
    imageUrl: string | null;
    minStockLevel: number;
    tracksExpiry: boolean;
    barcodeMode: string;
    variantGroupId?: string | null;
    variantName?: string | null;
    variantSort?: number;
    sellingPrice: Prisma.Decimal;
    costPrice: Prisma.Decimal;
    category: { id: string; name: string };
    inventory: { quantity: number } | null;
    batches?: Array<{ id: string; batchNumber: string; expiryDate: Date; quantity: number }>;
  }) {
    const stock = p.inventory?.quantity ?? 0;
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      // The size, and the group it belongs to. The till groups on these so
      // one article shows as one row with a size chooser behind it; the
      // grouping is done from the cached catalogue so it survives offline.
      variantGroupId: p.variantGroupId ?? null,
      variantName: p.variantName ?? null,
      variantSort: p.variantSort ?? 0,
      // What a receipt, a movement line or a report should call it.
      displayName: p.variantName ? `${p.name} — ${p.variantName}` : p.name,
      barcode: BarcodesService.primaryOf(p.barcodes ?? []),
      barcodes: p.barcodes ?? [],
      brand: p.brand,
      unit: p.unit,
      imageUrl: p.imageUrl,
      category: p.category,
      sellingPrice: p.sellingPrice.toFixed(2),
      costPrice: p.costPrice.toFixed(2),
      stock,
      minStockLevel: p.minStockLevel,
      isLowStock: stock > 0 && stock <= p.minStockLevel,
      isOutOfStock: stock === 0,
      tracksExpiry: p.tracksExpiry,
      // Whether every unit carries its own code — receiving and counting
      // need it to know if a repeat scan is a mis-scan or a real unit.
      barcodeMode: p.barcodeMode,
      ...(p.batches ? { batches: p.batches.map((b) => ({ ...b, expiryDate: b.expiryDate.toISOString().slice(0, 10) })) } : {}),
    };
  }
}
