import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RefundMethod, ReturnReason } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReturnItemDto {
  @ApiProperty({ description: 'The line on the original sale being returned' })
  @IsUUID()
  saleItemId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1, { message: 'Return quantity must be at least 1.' })
  quantity!: number;

  @ApiPropertyOptional({
    default: true,
    description: 'False when the goods are unsellable and should not re-enter stock',
  })
  @IsOptional()
  @IsBoolean()
  restock?: boolean;
}

export class CreateReturnDto {
  @ApiProperty({ description: 'The original sale — a return always references one (§51.6)' })
  @IsUUID()
  saleId!: string;

  @ApiProperty({ type: [ReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least one item to return.' })
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];

  @ApiProperty({ enum: ReturnReason })
  @IsEnum(ReturnReason)
  reason!: ReturnReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonNote?: string;

  @ApiProperty({ enum: RefundMethod })
  @IsEnum(RefundMethod)
  refundMethod!: RefundMethod;
}
