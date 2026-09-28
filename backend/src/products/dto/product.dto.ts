import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ProductUnit } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateProductDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Product name must be at least 2 characters.' })
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'LMB-SER-028' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  sku!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty()
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  brand?: string;

  @ApiProperty({ example: '72.00', description: 'Decimal string, never a float' })
  @IsNumberString({}, { message: 'Cost price must be a decimal amount.' })
  costPrice!: string;

  @ApiProperty({ example: '120.00' })
  @IsNumberString({}, { message: 'Selling price must be a decimal amount.' })
  sellingPrice!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minStockLevel?: number;

  @ApiPropertyOptional({ enum: ProductUnit })
  @IsOptional()
  @IsEnum(ProductUnit)
  unit?: ProductUnit;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Hold stock in batches and sell first-expiry-first-out' })
  @IsOptional()
  @IsBoolean()
  tracksExpiry?: boolean;

  /**
   * Creates the product as the first of a set of sizes.
   *
   * Deliberately not validated against a fixed list: the label is stored as
   * written and shown on receipts, and the options the form offers should be
   * able to grow without a migration or a deploy of this service.
   */
  @ApiPropertyOptional({ description: 'Size label, e.g. "Large" or "200ml"' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  variantName?: string;

  @ApiPropertyOptional({ description: 'Stock on hand now; recorded as an OPENING_BALANCE movement' })
  @IsOptional()
  @IsInt()
  @Min(0)
  openingStock?: number;

  /**
   * Required alongside openingStock when the product tracks expiry.
   *
   * Without a batch the units exist in the stock figure but nowhere the
   * sale can draw from, so the product reads as in stock and refuses to
   * sell — see products.service.ts.
   */
  @ApiPropertyOptional({ description: 'Batch for the opening stock; required when tracking expiry' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  openingBatchNumber?: string;

  @ApiPropertyOptional({ description: 'Expiry for the opening batch; required when tracking expiry' })
  @IsOptional()
  @IsDateString()
  openingExpiryDate?: string;
}

/**
 * Price fields are deliberately absent — changing a price needs
 * product.update_price, which cashiers do not hold (§6, §51.4).
 */
export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minStockLevel?: number;

  @ApiPropertyOptional({ enum: ProductUnit })
  @IsOptional()
  @IsEnum(ProductUnit)
  unit?: ProductUnit;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePriceDto {
  @ApiPropertyOptional({ example: '78.00' })
  @IsOptional()
  @IsNumberString({}, { message: 'Cost price must be a decimal amount.' })
  costPrice?: string;

  @ApiPropertyOptional({ example: '130.00' })
  @IsOptional()
  @IsNumberString({}, { message: 'Selling price must be a decimal amount.' })
  sellingPrice?: string;

  @ApiProperty({ description: 'Why the price changed — recorded in the audit log' })
  @IsString()
  @MinLength(3, { message: 'Give a reason for the price change.' })
  @MaxLength(500)
  reason!: string;
}
