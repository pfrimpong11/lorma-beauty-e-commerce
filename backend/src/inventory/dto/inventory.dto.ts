import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MovementType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
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

export class StockInDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1.' })
  quantity!: number;

  @ApiProperty()
  @IsString()
  @MinLength(3, { message: 'Give a reason for this stock movement.' })
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ description: 'Required when the product tracks expiry' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  batchNumber?: string;

  @ApiPropertyOptional({ description: 'Required when the product tracks expiry' })
  @IsOptional()
  @IsDateString({}, { message: 'Enter a valid expiry date.' })
  expiryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  unitCost?: string;
}

export class AdjustStockDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ description: 'The counted quantity this product should now show' })
  @IsInt()
  @Min(0)
  newQuantity!: number;

  @ApiProperty()
  @IsString()
  @MinLength(3, { message: 'Give a reason for this adjustment.' })
  @MaxLength(500)
  reason!: string;
}

export class WriteOffDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({ description: 'Write off a specific batch' })
  @IsOptional()
  @IsUUID()
  batchId?: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ enum: [MovementType.DAMAGED, MovementType.EXPIRED] })
  @IsEnum(MovementType, { message: 'Write-off type must be DAMAGED or EXPIRED.' })
  type!: MovementType;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ReceiptLineDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Required when the product tracks expiry' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  batchNumber?: string;

  @ApiPropertyOptional({ description: 'Required when the product tracks expiry' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  unitCost?: string;
}

/**
 * A whole stock receipt in one call.
 *
 * Sent once at the end of a scanning session rather than per scan, so the
 * receipt lands as a single transaction — a delivery is never half
 * recorded because the connection dropped part-way through.
 */
export class ReceiveStockDto {
  @ApiProperty({ type: [ReceiptLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Scan at least one product.' })
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  lines!: ReceiptLineDto[];

  @ApiProperty()
  @IsString()
  @MinLength(3, { message: 'Give a reason or reference for this delivery.' })
  @MaxLength(500)
  reason!: string;
}
