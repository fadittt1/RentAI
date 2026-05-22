import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { QualityScoreService } from './quality-score.service';
import { PrismaService } from '../../database/prisma.service';

/**
 * Admin-only endpoints for the quality scoring system.
 *
 *   GET  /api/quality/listings/top     — leaderboard for the founder dashboard
 *   GET  /api/quality/hosts/top        — host leaderboard
 *   POST /api/quality/recompute        — kick the cron manually
 *   POST /api/quality/listings/:id/recompute  — single-listing recompute
 */
@ApiTags('quality')
@ApiBearerAuth()
@Controller('api/quality')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class QualityController {
  constructor(
    private readonly quality: QualityScoreService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('listings/top')
  @ApiOperation({ summary: 'Top listings by quality score (admin)' })
  async topListings() {
    return this.prisma.listing.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ qualityScore: 'desc' }, { bookingCount30d: 'desc' }],
      take: 25,
      select: {
        id: true,
        title: true,
        address: true,
        pricePerDay: true,
        qualityScore: true,
        ratingAvg: true,
        bookingCount30d: true,
        host: { select: { id: true, name: true } },
      },
    });
  }

  @Get('hosts/top')
  @ApiOperation({ summary: 'Top hosts by quality score (admin)' })
  async topHosts() {
    return this.prisma.user.findMany({
      where: { isHost: true, suspendedAt: null },
      orderBy: [{ qualityScore: 'desc' }, { ratingAvg: 'desc' }],
      take: 25,
      select: {
        id: true,
        name: true,
        email: true,
        ratingAvg: true,
        ratingCount: true,
        qualityScore: true,
        verifiedEmail: true,
        verifiedPhone: true,
      },
    });
  }

  @Get('renters/top')
  @ApiOperation({ summary: 'Top renters by trust score (admin)' })
  async topRenters() {
    return this.prisma.user.findMany({
      where: { suspendedAt: null },
      orderBy: [{ renterTrustScore: 'desc' }, { ratingAvg: 'desc' }],
      take: 25,
      select: {
        id: true,
        name: true,
        email: true,
        renterTrustScore: true,
        verifiedEmail: true,
        verifiedPhone: true,
        idVerifiedAt: true,
      },
    });
  }

  @Post('renters/:userId/recompute')
  @ApiOperation({ summary: 'Recompute a single renter trust score (admin)' })
  async recomputeRenter(@Param('userId') userId: string) {
    const score = await this.quality.recomputeRenter(userId);
    return { id: userId, renterTrustScore: score };
  }

  @Post('recompute')
  @ApiOperation({ summary: 'Recompute quality for every listing + host (admin)' })
  async recomputeAll() {
    return this.quality.recomputeAll();
  }

  @Post('listings/:id/recompute')
  @ApiOperation({ summary: 'Recompute a single listing (admin)' })
  async recomputeListing(@Param('id') id: string) {
    const score = await this.quality.recomputeListing(id);
    return { id, qualityScore: score };
  }
}
