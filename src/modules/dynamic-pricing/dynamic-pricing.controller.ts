import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DynamicPricingService } from './dynamic-pricing.service';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('dynamic-pricing')
@ApiBearerAuth()
@Controller('api/dynamic-pricing')
@UseGuards(JwtAuthGuard)
export class DynamicPricingController {
  constructor(
    private readonly dynamicPricing: DynamicPricingService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('listings/:listingId/toggle')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Host toggles Smart Pricing on/off for one of their listings',
    description:
      'On first enable we snapshot the current pricePerDay as basePricePerDay. ' +
      'On disable we restore pricePerDay to basePricePerDay so the host gets ' +
      'their original price back instead of whatever the algorithm last set.',
  })
  async toggle(@Param('listingId') listingId: string, @Request() req: any) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        hostId: true,
        pricePerDay: true,
        basePricePerDay: true,
        dynamicPricing: true,
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.hostId !== req.user.sub) {
      throw new ForbiddenException('Not your listing');
    }

    if (listing.dynamicPricing) {
      // Turning OFF — restore the base price so the host isn't left at a
      // randomly-adjusted price after disabling.
      const restorePrice = listing.basePricePerDay ?? listing.pricePerDay;
      await this.prisma.listing.update({
        where: { id: listingId },
        data: { dynamicPricing: false, pricePerDay: restorePrice },
      });
      return { dynamicPricing: false, pricePerDay: Number(restorePrice) };
    }

    // Turning ON — snapshot current price as the base if not yet set.
    await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        dynamicPricing: true,
        basePricePerDay: listing.basePricePerDay ?? listing.pricePerDay,
      },
    });
    return { dynamicPricing: true, basePricePerDay: Number(listing.pricePerDay) };
  }

  @Get('listings/:listingId/history')
  @ApiOperation({ summary: 'Recent Smart Pricing adjustments for one listing' })
  async history(@Param('listingId') listingId: string, @Request() req: any) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { hostId: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    const isAdmin =
      Array.isArray(req.user?.roles) &&
      req.user.roles.map((r: string) => String(r).toUpperCase()).includes('ADMIN');
    if (!isAdmin && listing.hostId !== req.user.sub) {
      throw new ForbiddenException('Not your listing');
    }
    return this.dynamicPricing.history(listingId);
  }

  @Post('run')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Cron-triggered: recompute Smart Pricing for every opt-in listing',
    description:
      'Idempotent. Schedule daily (e.g. 04:00) via Railway / Windows Task Scheduler.',
  })
  runAll() {
    return this.dynamicPricing.adjustAll();
  }

  @Post('listings/:listingId/run')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Run Smart Pricing for a single listing (admin)' })
  runOne(@Param('listingId') listingId: string) {
    return this.dynamicPricing.adjustForListing(listingId);
  }
}
