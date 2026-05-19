import { IsEnum, IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum VerifyType {
  EMAIL = 'email',
  PHONE = 'phone',
}

export class VerifyDto {
  @ApiProperty({ enum: VerifyType })
  @IsEnum(VerifyType)
  type: VerifyType;

  @ApiProperty({ example: '123456', description: '6-digit verification code' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code: string;
}
