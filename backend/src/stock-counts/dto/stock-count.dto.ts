import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class StartStockCountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ScanStockCountDto {
  /** Trimmed only — leading zeros are significant. */
  @ApiProperty({ example: '0012345678901' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(64)
  barcode!: string;
}

export class SetCountedQuantityDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  countedQuantity!: number;
}

export class AddCountItemDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  countedQuantity?: number;
}

export class ApproveStockCountDto {
  @ApiPropertyOptional({ description: 'Recorded against every adjustment the count produces' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
