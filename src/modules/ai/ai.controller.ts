import { Controller, Post, Get, Patch, Delete, Body, Query, Param, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { EmbeddingService } from './embedding.service';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiOkResponse,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { ListingAssistantService } from './listing-assistant.service';
import { AiSearchService } from './ai-search.service';
import { PriceSuggestionService } from './price-suggestion.service';
import { PrismaService } from '../../database/prisma.service';
import {
  GenerateListingDto,
  EnhanceDescriptionDto,
  GenerateTitleDto,
} from './dto/listing-assistant.dto';
import { AiSearchRequestDto } from './dto/ai-search.dto';
import {
  PriceSuggestionRequestDto,
  PatchPriceSuggestionLogDto,
} from './dto/price-suggestion.dto';

@ApiTags('AI')
@Controller('api/ai')
export class AiController {
  constructor(
    private listingAssistantService: ListingAssistantService,
    private aiSearchService: AiSearchService,
    private priceSuggestionService: PriceSuggestionService,
    private embeddingService: EmbeddingService,
    private prisma: PrismaService,
  ) {}

  @Post('search')
  @Public()
  @ApiOperation({
    summary: 'AI-powered search with natural language',
    description:
      'Converts natural language queries into structured filters. ' +
      'Supports max 1 follow-up question for clarification. ' +
      'Returns either FOLLOW_UP mode (if clarification needed) or RESULT mode with listings. ' +
      'All responses have stable keys: mode, filters, chips, followUp, results.',
  })
  @ApiOkResponse({
    description: 'Search results or follow-up question',
    schema: {
      oneOf: [
        {
          title: 'FOLLOW_UP Mode',
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['FOLLOW_UP'], example: 'FOLLOW_UP' },
            followUp: {
              type: 'object',
              properties: {
                question: {
                  type: 'string',
                  example: 'Which dates do you need?',
                },
                field: {
                  type: 'string',
                  enum: [
                    'dates',
                    'price',
                    'category',
                    'bookingType',
                    'location',
                    'other',
                  ],
                  example: 'dates',
                },
                options: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['Today', 'Tomorrow', 'This weekend'],
                },
              },
            },
            filters: {
              type: 'object',
              properties: {
                q: { type: 'string', example: 'villa' },
                categorySlug: { type: 'string', example: 'stays' },
                minPrice: { type: 'number', nullable: true },
                maxPrice: { type: 'number', example: 250 },
                bookingType: {
                  type: 'string',
                  enum: ['DAILY', 'SLOT', 'ANY'],
                  nullable: true,
                },
                availableFrom: { type: 'string', nullable: true },
                availableTo: { type: 'string', nullable: true },
                sortBy: {
                  type: 'string',
                  enum: ['distance', 'date', 'price_asc', 'price_desc'],
                  example: 'distance',
                },
                radiusKm: { type: 'number', example: 10 },
              },
            },
            chips: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  label: { type: 'string' },
                },
              },
              example: [
                { key: 'q', label: 'villa' },
                { key: 'category', label: 'stays' },
                { key: 'price', label: 'Up to 250 TND' },
              ],
            },
            results: {
              type: 'array',
              example: [],
              description: 'Always empty in FOLLOW_UP mode',
            },
          },
          example: {
            mode: 'FOLLOW_UP',
            followUp: {
              question: 'Which dates do you need?',
              field: 'dates',
              options: ['Today', 'Tomorrow', 'This weekend'],
            },
            filters: {
              q: 'villa',
              categorySlug: 'stays',
              maxPrice: 250,
              sortBy: 'distance',
              radiusKm: 10,
            },
            chips: [
              { key: 'q', label: 'villa' },
              { key: 'category', label: 'stays' },
              { key: 'price', label: 'Up to 250 TND' },
            ],
            results: [],
          },
        },
        {
          title: 'RESULT Mode',
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['RESULT'], example: 'RESULT' },
            filters: {
              type: 'object',
              properties: {
                q: { type: 'string', example: 'villa' },
                categorySlug: { type: 'string', example: 'stays' },
                minPrice: { type: 'number', nullable: true },
                maxPrice: { type: 'number', example: 250 },
                bookingType: {
                  type: 'string',
                  enum: ['DAILY', 'SLOT', 'ANY'],
                  example: 'DAILY',
                },
                availableFrom: { type: 'string', example: '2026-02-17' },
                availableTo: { type: 'string', example: '2026-02-19' },
                sortBy: {
                  type: 'string',
                  enum: ['distance', 'date', 'price_asc', 'price_desc'],
                  example: 'distance',
                },
                radiusKm: { type: 'number', example: 10 },
              },
            },
            chips: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  label: { type: 'string' },
                },
              },
              example: [
                { key: 'q', label: 'villa' },
                { key: 'category', label: 'stays' },
                { key: 'price', label: 'Up to 250 TND' },
                { key: 'dates', label: '2026-02-17 to 2026-02-19' },
              ],
            },
            followUp: {
              type: 'null',
              example: null,
              description: 'Always null in RESULT mode',
            },
            results: {
              type: 'array',
              items: { type: 'object' },
              description: 'Array of listing summaries',
              example: [
                {
                  id: '123e4567-e89b-12d3-a456-426614174000',
                  title: 'Luxury Beach Villa',
                  pricePerDay: 200,
                  category: 'stays',
                },
              ],
            },
          },
          example: {
            mode: 'RESULT',
            filters: {
              q: 'villa',
              categorySlug: 'stays',
              maxPrice: 250,
              bookingType: 'DAILY',
              availableFrom: '2026-02-17',
              availableTo: '2026-02-19',
              sortBy: 'distance',
              radiusKm: 10,
            },
            chips: [
              { key: 'q', label: 'villa' },
              { key: 'category', label: 'stays' },
              { key: 'price', label: 'Up to 250 TND' },
              { key: 'dates', label: '2026-02-17 to 2026-02-19' },
            ],
            followUp: null,
            results: [
              {
                id: '123e4567-e89b-12d3-a456-426614174000',
                title: 'Luxury Beach Villa',
                pricePerDay: 200,
                category: 'stays',
              },
            ],
          },
        },
      ],
    },
  })
  @ApiBody({
    type: AiSearchRequestDto,
    description:
      'Natural language search request. Tip: use followUpUsed=true to always get a direct RESULT without a clarification question.',
    examples: {
      result_direct: {
        summary: '1️⃣ Force RESULT — always returns listings (safe for demo)',
        description:
          'Set followUpUsed=true to bypass the follow-up question guardrail. Always returns RESULT mode.',
        value: {
          query: 'villa near beach under 300',
          lat: 36.847,
          lng: 11.093,
          radiusKm: 50,
          followUpUsed: true,
        },
      },
      follow_up: {
        summary: '2️⃣ FOLLOW_UP — let AI ask one clarifying question',
        description:
          'Vague query triggers FOLLOW_UP. The response includes a question + partial filters + chips.',
        value: {
          query: 'something cheap near me',
          lat: 36.847,
          lng: 11.093,
          radiusKm: 50,
          followUpUsed: false,
        },
      },
      follow_up_answer: {
        summary: '3️⃣ FOLLOW_UP answered — force RESULT on second call',
        description:
          "Pass the user's answer to the follow-up question and set followUpUsed=true. The guardrail forces RESULT mode.",
        value: {
          query: 'something cheap near me',
          lat: 36.847,
          lng: 11.093,
          radiusKm: 50,
          followUpUsed: true,
          followUpAnswer: 'Tomorrow, under 100 TND',
        },
      },
    },
  })
  @Throttle({ default: { limit: 40, ttl: 60_000 } }) // 40 req/min per IP — enough for normal use, blocks abuse
  async search(@Body() dto: AiSearchRequestDto) {
    return this.aiSearchService.search(dto);
  }

  @Post('search/stream')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Streaming AI search (NDJSON)',
    description:
      'Same request shape as POST /search but streams progress events as newline-delimited JSON. ' +
      'The client receives an "understanding" event with parsed filters/chips as soon as the NLU completes (~1s), ' +
      'then a final "result" event with full results (~500ms later). ' +
      'This roughly halves the perceived latency: the user sees chips immediately while results load.',
  })
  async searchStream(@Body() dto: AiSearchRequestDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if reverse-proxied
    res.flushHeaders?.();

    const writeEvent = (event: { type: string; data: any }) => {
      res.write(JSON.stringify(event) + '\n');
      (res as any).flush?.();
    };

    try {
      await this.aiSearchService.search(dto, writeEvent);
    } catch (e: any) {
      writeEvent({ type: 'error', data: { message: e?.message ?? 'Search failed' } });
    } finally {
      res.end();
    }
  }

  @Get('search/recent')
  @Public()
  @ApiOperation({
    summary: 'Recent unique search queries (for empty-state history list)',
    description: 'Returns the last N successful queries deduplicated, newest first.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async getRecentSearches(@Query('limit') limit?: string) {
    const take = Math.min(parseInt(limit ?? '10', 10) || 10, 50);
    // Pull more than `take` and dedup by lowercased query
    const rows = await this.prisma.aiSearchLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: take * 4,
      select: { query: true, createdAt: true, filters: true, mode: true, resultsCount: true },
    });
    const seen = new Set<string>();
    const unique: Array<{
      query: string;
      createdAt: Date;
      categorySlug?: string;
      resultsCount: number;
    }> = [];
    for (const r of rows) {
      const key = r.query.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const f = (r.filters ?? {}) as any;
      unique.push({
        query: r.query,
        createdAt: r.createdAt,
        categorySlug: f.categorySlug,
        resultsCount: r.resultsCount,
      });
      if (unique.length >= take) break;
    }
    return unique;
  }

  @Delete('search/recent')
  @Public()
  @ApiOperation({
    summary: 'Clear recent searches',
    description: 'Deletes all AI search log entries. Use sparingly — affects everyone in this demo build.',
  })
  async clearRecentSearches() {
    const r = await this.prisma.aiSearchLog.deleteMany({});
    return { deleted: r.count };
  }

  @Post('search/suggestion-click')
  @Public()
  @ApiOperation({
    summary: 'Track a click on a suggestion chip',
    description: 'Logs which refinement suggestion the user clicked after a search. Used to learn which suggestions are actually useful.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['suggestion', 'originalQuery'],
      properties: {
        suggestion:    { type: 'string', example: 'Moins de 250 TND/jour' },
        originalQuery: { type: 'string', example: 'villa kelibia' },
        sessionId:     { type: 'string', nullable: true },
      },
    },
  })
  async trackSuggestionClick(@Body() body: { suggestion: string; originalQuery: string; sessionId?: string }) {
    if (!body?.suggestion || !body?.originalQuery) {
      return { ok: false, error: 'suggestion and originalQuery are required' };
    }
    await this.prisma.aiSearchLog.create({
      data: {
        query:         body.suggestion.slice(0, 200),
        mode:          'SUGGESTION_CLICK',
        followUpAsked: false,
        filters: {
          parentQuery: body.originalQuery.slice(0, 200),
          sessionId:   body.sessionId ?? null,
        } as any,
        resultsCount: 0,
      },
    });
    return { ok: true };
  }

  @Get('search/suggestion-stats')
  @Public()
  @ApiOperation({
    summary: '[Dev/Admin] Top clicked suggestions',
    description: 'Returns the most-clicked refinement suggestions, ranked. Useful for tuning which to surface first.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async getSuggestionStats(@Query('limit') limit?: string) {
    const take = Math.min(parseInt(limit ?? '10', 10) || 10, 50);
    const rows = await this.prisma.aiSearchLog.findMany({
      where: { mode: 'SUGGESTION_CLICK' },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { query: true },
    });
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.query, (counts.get(r.query) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, take)
      .map(([suggestion, clicks]) => ({ suggestion, clicks }));
  }

  @Get('search/embedding-stats')
  @Public()
  @ApiOperation({
    summary: '[Dev/Admin] Semantic search index stats',
    description: 'Returns the size, age, and availability of the in-memory listing embedding index.',
  })
  getEmbeddingStats() {
    return this.embeddingService.getIndexStats();
  }

  @Post('search/embedding-rebuild')
  @Public()
  @ApiOperation({
    summary: '[Dev/Admin] Force rebuild of the embedding index',
    description: 'Re-embeds every active listing. Useful after a bulk seed or schema change.',
  })
  async rebuildEmbeddings() {
    return this.embeddingService.rebuildIndex();
  }

  @Get('search/quick-starts')
  @Public()
  @ApiOperation({
    summary: 'Example queries for the empty-state suggestion chips',
    description: 'Hand-curated short prompts grouped by intent. The frontend renders these as clickable chips.',
  })
  getQuickStarts() {
    return [
      { icon: '🏠', label: 'Villa près de la mer à Kelibia', query: 'villa près de la mer à kelibia ce weekend' },
      { icon: '🚗', label: 'Voiture pour le week-end',       query: 'voiture pour ce weekend' },
      { icon: '🏖️', label: 'Kayak ou paddle à Nabeul',        query: 'kayak à nabeul demain' },
      { icon: '⚽', label: 'Terrain de foot à Tunis',         query: 'terrain de foot à tunis ce soir' },
      { icon: '🎾', label: 'Padel pas cher',                  query: 'padel pas cher ce weekend' },
      { icon: '🏡', label: 'Maison avec piscine, max 500',    query: 'maison avec piscine moins de 500 tnd' },
    ];
  }

  @Get('admin/search-logs')
  @Public()
  @ApiOperation({
    summary: '[Dev/Admin] List recent AI search logs',
    description:
      'Returns the last N AI search log entries. Useful for PFE demo and debugging.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  async getSearchLogs(@Query('limit') limit?: string) {
    const take = Math.min(parseInt(limit ?? '20', 10) || 20, 100);
    return this.prisma.aiSearchLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate complete listing (title, description, highlights)',
  })
  @ApiResponse({
    status: 201,
    description: 'Listing generated successfully',
    schema: {
      example: {
        title: 'Professional Tennis Court with Night Lighting',
        description:
          'Experience top-tier tennis at our professional-grade court...',
        highlights: [
          'Professional-grade surface',
          'Night lighting available',
          'Equipment rental included',
        ],
      },
    },
  })
  async generateListing(@Body() dto: GenerateListingDto) {
    return this.listingAssistantService.generateListing(dto);
  }

  @Post('enhance-description')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enhance existing listing description' })
  @ApiResponse({
    status: 201,
    description: 'Description enhanced successfully',
    schema: {
      example: {
        enhancedDescription: 'Discover our premium tennis court...',
      },
    },
  })
  async enhanceDescription(@Body() dto: EnhanceDescriptionDto) {
    const enhanced = await this.listingAssistantService.enhanceDescription(
      dto.currentDescription,
      dto.category,
    );
    return { enhancedDescription: enhanced };
  }

  @Post('generate-titles')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate catchy listing titles' })
  @ApiResponse({
    status: 201,
    description: 'Titles generated successfully',
    schema: {
      example: {
        titles: [
          'Professional Tennis Court - Night Games Available',
          'Premium Tennis Facility with Pro Equipment',
          'Kelibia Tennis Court - Book Your Court Time',
        ],
      },
    },
  })
  async generateTitles(@Body() dto: GenerateTitleDto) {
    const titles = await this.listingAssistantService.generateTitle(
      dto.category,
      dto.keyFeatures,
      dto.location,
    );
    return { titles };
  }

  @Post('price-suggestion')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'AI price suggestion for a listing (stays / accommodation only in MVP)' })
  @ApiResponse({ status: 201, description: 'Price suggestion generated' })
  async priceSuggestion(@Body() dto: PriceSuggestionRequestDto) {
    return this.priceSuggestionService.suggest(dto);
  }

  @Patch('price-suggestion/log/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Link a published listing to its price suggestion log' })
  @ApiResponse({ status: 200, description: 'Log updated' })
  async patchPriceSuggestionLog(
    @Param('id') id: string,
    @Body() dto: PatchPriceSuggestionLogDto,
  ) {
    return this.priceSuggestionService.patchLog(id, dto.listingId, dto.finalPrice, dto.suggestedPrice);
  }
}
