import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SearchFiltersDto {
  @ApiProperty({ required: false })
  q?: string;

  @ApiProperty({ required: false })
  categorySlug?: string;

  @ApiProperty({ required: false })
  city?: string;

  @ApiProperty({ required: false })
  nearSea?: boolean;

  @ApiProperty({ required: false })
  minPrice?: number;

  @ApiProperty({ required: false })
  maxPrice?: number;

  @ApiProperty({ required: false, enum: ['DAILY', 'SLOT', 'ANY'] })
  bookingType?: 'DAILY' | 'SLOT' | 'ANY';

  @ApiProperty({ required: false })
  availableFrom?: string;

  @ApiProperty({ required: false })
  availableTo?: string;

  @ApiProperty({
    required: false,
    enum: ['distance', 'date', 'price_asc', 'price_desc'],
  })
  sortBy?: 'distance' | 'date' | 'price_asc' | 'price_desc';

  @ApiProperty({ required: false })
  radiusKm?: number;

  @ApiProperty({ required: false, type: [String], description: 'AND-filtered amenities (piscine, parking, …)' })
  amenities?: string[];

  // Set once the user has explicitly resolved location ("Près de moi" / "Peu importe" / a city).
  // Echoed back as previousFilters so subsequent turns skip the location follow-up.
  @ApiProperty({ required: false })
  locationConfirmed?: boolean;
}

export class AiSearchRequestDto {
  @ApiProperty({
    description: 'User search query in natural language',
    example: 'villa near beach under 250',
    required: true,
  })
  @IsString()
  query: string;

  @ApiProperty({
    description: 'User latitude',
    example: 36.8578,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @IsLatitude()
  @Type(() => Number)
  lat?: number;

  @ApiProperty({
    description: 'User longitude',
    example: 11.092,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @IsLongitude()
  @Type(() => Number)
  lng?: number;

  @ApiProperty({
    description: 'Search radius in kilometers',
    example: 10,
    required: false,
    default: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  @Type(() => Number)
  radiusKm?: number = 60;

  @ApiProperty({
    description: 'Available category slugs within radius (optional)',
    example: ['stays', 'sports-facilities'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  availableCategorySlugs?: string[];

  @ApiProperty({
    description: 'How many follow-up rounds have already been used (max 3)',
    example: 0,
    required: false,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(3)
  @Type(() => Number)
  followUpUsed?: number = 0;

  @ApiProperty({
    description: 'Answer to previous follow-up question',
    example: 'tomorrow',
    required: false,
  })
  @IsOptional()
  @IsString()
  followUpAnswer?: string;

  @ApiProperty({
    description: 'Filters from the previous search — enables refinement mode',
    required: false,
  })
  @IsOptional()
  previousFilters?: SearchFiltersDto;
}

export class SearchChipDto {
  @ApiProperty()
  key: string;

  @ApiProperty()
  label: string;
}

export class FollowUpDto {
  @ApiProperty()
  question: string;

  @ApiProperty({
    enum: ['dates', 'price', 'category', 'bookingType', 'location', 'other'],
  })
  field: 'dates' | 'price' | 'category' | 'bookingType' | 'location' | 'other';

  @ApiProperty({ type: [String], required: false })
  options?: string[];
}

export class AiSearchResponseFollowUpDto {
  @ApiProperty({ enum: ['FOLLOW_UP'] })
  mode: 'FOLLOW_UP';

  @ApiProperty({ type: FollowUpDto })
  followUp: FollowUpDto;

  @ApiProperty({ type: SearchFiltersDto })
  filters: SearchFiltersDto;

  @ApiProperty({ type: [SearchChipDto] })
  chips: SearchChipDto[];

  @ApiProperty({ type: Object, isArray: true, example: [] })
  results: any[];
}

export class SearchStatsDto {
  @ApiProperty({ description: 'Total number of matching listings' })
  totalResults: number;

  @ApiProperty({ required: false, description: 'Min price across results' })
  minPrice?: number;

  @ApiProperty({ required: false, description: 'Max price across results' })
  maxPrice?: number;

  @ApiProperty({ required: false, description: 'Average price across results' })
  avgPrice?: number;

  @ApiProperty({ required: false, description: 'Price unit, e.g. "TND/day" or "TND/slot"' })
  priceUnit?: string;

  @ApiProperty({ required: false, type: [String], description: 'Top cities represented in results' })
  topCities?: string[];
}

export class AiSearchResponseResultDto {
  @ApiProperty({ enum: ['RESULT'] })
  mode: 'RESULT';

  @ApiProperty({ type: SearchFiltersDto })
  filters: SearchFiltersDto;

  @ApiProperty({ type: [SearchChipDto] })
  chips: SearchChipDto[];

  @ApiProperty({ type: FollowUpDto, nullable: true, example: null })
  followUp: null;

  @ApiProperty({ type: Object, isArray: true })
  results: any[];

  @ApiProperty({ type: [String], required: false, example: [] })
  relaxedConstraints?: string[];

  @ApiProperty({
    required: false,
    description: 'Conversational summary of what was found (1-2 sentences)',
    example: "J'ai trouvé 12 villas à Kelibia, prix entre 180 et 450 TND/jour.",
  })
  summary?: string;

  @ApiProperty({ type: SearchStatsDto, required: false })
  stats?: SearchStatsDto;

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Suggested follow-up refinements the user can click',
    example: ['Seulement avec piscine', 'Moins de 250 TND', 'Bord de mer uniquement'],
  })
  suggestions?: string[];

  @ApiProperty({
    required: false,
    description: 'Optional trace of how the AI interpreted the query',
    example: "J'ai compris : villa à Kelibia, max 1000 TND, du 15 au 20 mai. Filtré par titre et prix.",
  })
  reasoning?: string;
}

export type AiSearchResponseDto =
  | AiSearchResponseFollowUpDto
  | AiSearchResponseResultDto;
