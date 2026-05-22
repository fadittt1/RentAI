import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectKycDto {
  @ApiProperty({ description: 'Reason shown to the host (≥ 4 chars)' })
  @IsString()
  @MinLength(4)
  reason: string;
}
