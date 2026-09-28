import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AddVariantDto {
  @ApiProperty({ description: 'Label for the new size, e.g. "Large" or "250g"' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  variantName!: string;

  /**
   * Required the first time a product gains sizes: its existing stock is a
   * size too, and needs naming before the group means anything.
   */
  @ApiPropertyOptional({ description: 'Label for the stock the product already has' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  baseVariantName?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  sku!: string;

  @ApiProperty({ description: 'Fixed-scale decimal string' })
  @IsNumberString()
  costPrice!: string;

  @ApiProperty({ description: 'Fixed-scale decimal string' })
  @IsNumberString()
  sellingPrice!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  openingStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  openingBatchNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  openingExpiryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minStockLevel?: number;

  @ApiPropertyOptional({ description: 'Barcode for this size specifically' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;
}

export class UpdateVariantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  variantName?: string;

  @ApiPropertyOptional({ description: 'Position within the group' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  variantSort?: number;
}
