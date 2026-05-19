import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { VerifyType } from './verify.dto';

export class RequestVerificationDto {
  @ApiProperty({ enum: VerifyType, description: 'Which channel to verify' })
  @IsEnum(VerifyType)
  type: VerifyType;
}
