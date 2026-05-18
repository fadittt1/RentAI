import { IsOptional, IsString, IsEmail, IsNumber, Min, Max, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiProperty({ required: false, description: 'Saved home latitude (null to clear)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(-90)
  @Max(90)
  homeLat?: number | null;

  @ApiProperty({ required: false, description: 'Saved home longitude (null to clear)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(-180)
  @Max(180)
  homeLng?: number | null;

  @ApiProperty({ required: false, description: 'Saved home city display name' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  homeCityName?: string | null;
}
