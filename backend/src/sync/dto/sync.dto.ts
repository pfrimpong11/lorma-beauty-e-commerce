import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateSaleDto } from '../../sales/dto/create-sale.dto';

export class QueuedSaleDto {
  @ApiProperty({ description: 'Stable per-transaction key; the same value on every retry' })
  @IsString()
  @MaxLength(120)
  idempotencyKey!: string;

  @ApiProperty({ description: 'Generated on the device when the sale was completed' })
  @IsUUID()
  clientUuid!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  deviceId!: string;

  @ApiPropertyOptional({ description: 'Per-device ordering, so sales replay in sequence' })
  @IsOptional()
  @IsInt()
  @Min(0)
  clientSequence?: number;

  @ApiProperty({ description: 'When the sale was completed on the device' })
  @IsDateString()
  clientTime!: string;

  @ApiProperty({ type: CreateSaleDto })
  @ValidateNested()
  @Type(() => CreateSaleDto)
  sale!: CreateSaleDto;
}

export class PushSyncDto {
  @ApiProperty({ type: [QueuedSaleDto] })
  @IsArray()
  @ArrayMinSize(1)
  // Bounded so a device that has been offline for days cannot send one
  // enormous request that times out and never drains.
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QueuedSaleDto)
  sales!: QueuedSaleDto[];
}
