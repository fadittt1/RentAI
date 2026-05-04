import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsEnum, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export enum AdjustmentDirection {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export class WalletAdjustDto {
  @ApiProperty({ example: 25.0, description: 'Adjustment amount (always positive)' })
  @IsNumber()
  @Type(() => Number)
  amount: number;

  @ApiProperty({ enum: AdjustmentDirection, description: 'CREDIT to add, DEBIT to subtract' })
  @IsEnum(AdjustmentDirection)
  direction: AdjustmentDirection;

  @ApiProperty({ example: 'Goodwill credit for support ticket #1234', description: 'Mandatory reason for audit log' })
  @IsString()
  @MinLength(5)
  reason: string;
}
