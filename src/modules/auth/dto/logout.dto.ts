import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LogoutDto {
  @ApiProperty({ required: false, description: 'Refresh token to revoke' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
