import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DiscountType, PaymentMethod } from '@prisma/client';

export class SaleItemDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1.' })
  @Max(10_000)
  quantity!: number;

  /**
   * Per-line discount as a decimal string. Money never crosses the wire as
   * a JSON number — float parsing would reintroduce the rounding error the
   * NUMERIC columns exist to prevent.
   */
  @ApiPropertyOptional({ example: '5.00' })
  @IsOptional()
  @IsNumberString({ no_symbols: false }, { message: 'Discount must be a decimal amount.' })
  discountAmount?: string;
}

export class PaymentDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiProperty({ example: '280.00' })
  @IsNumberString({ no_symbols: false }, { message: 'Amount must be a decimal value.' })
  amount!: string;

  @ApiPropertyOptional({ example: '300.00', description: 'Cash handed over; cash sales only' })
  @IsOptional()
  @IsNumberString()
  amountTendered?: string;

  @ApiPropertyOptional({ description: 'Mobile money / card reference' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}

export class CreateSaleDto {
  @ApiProperty({ type: [SaleItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'A sale must contain at least one item.' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];

  @ApiProperty({ type: [PaymentDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'A payment method is required.' })
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments!: PaymentDto[];

  @ApiPropertyOptional({ description: 'Omit for the Walk-in Customer' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  /**
   * A walk-in customer's number, captured at the till.
   *
   * Sent with the sale rather than saved beforehand so the whole thing is
   * one operation: a queued offline sale carries the number with it and
   * needs no second call that could be lost.
   */
  @ApiPropertyOptional({ description: "Walk-in customer's mobile number" })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  customerPhone?: string;

  @ApiPropertyOptional({ description: 'Name for a customer created from the phone number' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customerName?: string;

  @ApiPropertyOptional({ enum: DiscountType })
  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @ApiPropertyOptional({ example: '20.00', description: 'Amount, or percent when discountType=PERCENT' })
  @IsOptional()
  @IsNumberString()
  discountValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  // ---- Offline provenance (§24) ----------------------------------------

  @ApiPropertyOptional({ description: 'Client-generated id; makes the sale idempotent' })
  @IsOptional()
  @IsUUID()
  clientUuid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  clientSequence?: number;

  @ApiPropertyOptional({ description: 'When the sale was completed on the device' })
  @IsOptional()
  @IsISO8601()
  soldAt?: string;
}
