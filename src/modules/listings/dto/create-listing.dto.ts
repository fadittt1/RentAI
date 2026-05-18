import {
  IsString,
  IsNumber,
  IsNotEmpty,
  Min,
  Max,
  IsUUID,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// Tunisia bounding box (with small margin): lat 30..38, lng 7..12.
// Rejects coords outside the country to catch host typos / accidental coords.
const TN_LAT_MIN = 30;
const TN_LAT_MAX = 38;
const TN_LNG_MIN = 7;
const TN_LNG_MAX = 12;

export class CreateListingDto {
  @ApiProperty({ example: 'Mountain Bike for Rent' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'High-quality mountain bike...' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiProperty({ example: 25.0, description: 'Price per day in TND' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  pricePerDay: number;

  @ApiProperty({ example: 36.8475, description: `Must be inside Tunisia (${TN_LAT_MIN}..${TN_LAT_MAX})` })
  @IsLatitude()
  @Min(TN_LAT_MIN, { message: 'Latitude is outside Tunisia' })
  @Max(TN_LAT_MAX, { message: 'Latitude is outside Tunisia' })
  @Type(() => Number)
  latitude: number;

  @ApiProperty({ example: 11.0939, description: `Must be inside Tunisia (${TN_LNG_MIN}..${TN_LNG_MAX})` })
  @IsLongitude()
  @Min(TN_LNG_MIN, { message: 'Longitude is outside Tunisia' })
  @Max(TN_LNG_MAX, { message: 'Longitude is outside Tunisia' })
  @Type(() => Number)
  longitude: number;

  @ApiProperty({ example: '123 Main St, Kelibia, Tunisia' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rules?: string;

  @ApiProperty({
    required: false,
    enum: ['DAILY', 'SLOT'],
    default: 'DAILY',
    description:
      'Booking type: DAILY for day-based rentals, SLOT for hourly/time-slot bookings',
  })
  @IsOptional()
  @IsString()
  bookingType?: 'DAILY' | 'SLOT';

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  availability?: Array<{ startDate: string; endDate: string }>;
}
