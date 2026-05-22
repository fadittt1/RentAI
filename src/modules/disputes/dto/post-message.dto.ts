import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PostDisputeMessageDto {
  @ApiProperty({ required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  body?: string;
}
