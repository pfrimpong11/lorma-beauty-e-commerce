import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumberString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class OpenShiftDto {
  @ApiProperty({ example: '500.00', description: 'Cash in the drawer at the start' })
  @IsNumberString({}, { message: 'Opening cash must be a decimal amount.' })
  openingCash!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CloseShiftDto {
  @ApiProperty({ example: '2480.00', description: 'Cash actually counted in the drawer' })
  @IsNumberString({}, { message: 'Closing cash must be a decimal amount.' })
  closingCash!: string;

  @ApiPropertyOptional({ description: 'Required when the variance exceeds the threshold' })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Explain the cash variance.' })
  @MaxLength(500)
  varianceReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
