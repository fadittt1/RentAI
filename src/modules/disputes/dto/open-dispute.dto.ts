import { IsEnum, IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DisputeReason } from '@prisma/client';

export class OpenDisputeDto {
  @ApiProperty()
  @IsUUID()
  bookingId: string;

  @ApiProperty({
    enum: [
      'NOT_AS_DESCRIBED',
      'DAMAGED',
      'NO_SHOW',
      'CANCELLED_LATE',
      'PAYMENT_ISSUE',
      'OTHER',
    ],
  })
  @IsEnum({
    NOT_AS_DESCRIBED: 'NOT_AS_DESCRIBED',
    DAMAGED: 'DAMAGED',
    NO_SHOW: 'NO_SHOW',
    CANCELLED_LATE: 'CANCELLED_LATE',
    PAYMENT_ISSUE: 'PAYMENT_ISSUE',
    OTHER: 'OTHER',
  } as Record<DisputeReason, DisputeReason>)
  reason: DisputeReason;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @IsString()
  @MinLength(10)
  description: string;
}
