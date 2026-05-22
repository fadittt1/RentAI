import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { DisputeResolution } from '@prisma/client';

export class ResolveDisputeDto {
  @ApiProperty({
    enum: ['REFUND_FULL', 'REFUND_PARTIAL', 'FAVOR_HOST', 'DISMISSED'],
  })
  @IsEnum({
    REFUND_FULL: 'REFUND_FULL',
    REFUND_PARTIAL: 'REFUND_PARTIAL',
    FAVOR_HOST: 'FAVOR_HOST',
    DISMISSED: 'DISMISSED',
  } as Record<DisputeResolution, DisputeResolution>)
  resolution: DisputeResolution;

  @ApiProperty({ required: false, description: 'Required when resolution = REFUND_PARTIAL' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  refundAmount?: number;

  @ApiProperty({ required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
