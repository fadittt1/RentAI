import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'abc123…', description: 'Token from the reset link' })
  @IsString()
  @MinLength(20)
  token: string;

  @ApiProperty({ example: 'new-secret-pass', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}
