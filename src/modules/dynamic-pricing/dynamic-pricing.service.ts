import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Smart Pricing — daily nudges to listing prices based on demand signals.
 *
 * Each opt-in listing gets:
 *   - A snapshot `basePricePerDay` (the host's intended price)
 *   - A daily run that computes a multiplier in [0.7, 1.3]
 *   - An audit log entry every time `pricePerDay` moves > 5%
 *
 * Signals (all bounded contributions, none dominates):
 *   1. Comparables (PostGIS, 5km, same category) — pull toward the median
 *   2. Search demand — high-volume area queries in the last 7 days nudge up
 *   3. Empty-calendar urgency — empty next 7 days nudges down (move inventory)
 *   4. Booked-up scarcity — fully booked next 7 days nudges up
 *   5. Day-of-week — current day weekend nudges up
 *   6. Season — Tunisia summer (Jun-Sep) nudges up
 *
 * Why per-day instead of per-night-being-booked: simpler, no risk of price
 * inconsistencies between the listing page and the booking page mid-flow.
 * A more sophisticated v2 could price each future night individually.
 */

const MAX_UP = 1.3;
const MAX_DOWN = 0.7;
const MIN_CHANGE_PCT = 0.05;

interface Factors {
  comparables: number;
  demand: number;
  emptyUrgency: number;
  scarcity: number;
  weekend: number;
  season: number;
}

@Injectable()
export class DynamicPricingService {
  private readonly logger = new Logger(DynamicPricingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Run the algorithm for one listing. Idempotent — re-runs the same day are no-ops if price doesn't change >5%. */
  async adjustForListing(listingId: string): Promise<{
    skipped: boolean;
    oldPrice?: number;
    newPrice?: number;
    multiplier?: number;
    reason?: string;
  }> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        pricePerDay: true,
        basePricePerDay: true,
        dynamicPricing: true,
        isActive: true,
        deletedAt: true,
        categoryId: true,
      },
    });
    if (!listing || !listing.dynamicPricing || !listing.isActive || listing.deletedAt) {
      return { skipped: true, reason: 'not eligible' };
    }

    // Default base to current price the first time the algorithm sees this listing.
    const basePrice = listing.basePricePerDay
      ? Number(listing.basePricePerDay)
      : Number(listing.pricePerDay);
    if (!listing.basePricePerDay) {
      await this.prisma.listing.update({
        where: { id: listing.id },
        data: { basePricePerDay: basePrice },
      });
    }

    const factors = await this.computeFactors(listing.id, listing.categoryId, basePrice);
    const multiplier = this.clamp(this.combine(factors), MAX_DOWN, MAX_UP);
    const newPrice = Math.round(basePrice * multiplier * 100) / 100;
    const oldPrice = Number(listing.pricePerDay);

    const changePct = oldPrice === 0 ? 0 : Math.abs(newPrice - oldPrice) / oldPrice;
    if (changePct < MIN_CHANGE_PCT) {
      // Still record an "update timestamp" so we don't reprocess this listing this hour.
      await this.prisma.listing.update({
        where: { id: listing.id },
        data: { dynamicPricingAt: new Date() },
      });
      return { skipped: true, reason: 'change < 5%' };
    }

    const reason = this.humanReason(factors, multiplier);

    await this.prisma.$transaction([
      this.prisma.listing.update({
        where: { id: listing.id },
        data: { pricePerDay: newPrice, dynamicPricingAt: new Date() },
      }),
      this.prisma.priceAdjustmentLog.create({
        data: {
          listingId: listing.id,
          oldPrice,
          newPrice,
          basePrice,
          multiplier,
          factors: factors as any,
          reason,
        },
      }),
    ]);

    this.logger.log(
      `Smart Pricing: ${listing.id} ${oldPrice} → ${newPrice} (×${multiplier.toFixed(3)}) — ${reason}`,
    );
    return { skipped: false, oldPrice, newPrice, multiplier };
  }

  /** Cron entry point — runs all opt-in listings with bounded concurrency. */
  async adjustAll(concurrency = 5): Promise<{
    processed: number;
    changed: number;
    skipped: number;
  }> {
    const listings = await this.prisma.listing.findMany({
      where: { dynamicPricing: true, isActive: true, deletedAt: null },
      select: { id: true },
    });

    let changed = 0;
    let skipped = 0;
    let i = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (i < listings.length) {
          const idx = i++;
          try {
            const r = await this.adjustForListing(listings[idx].id);
            if (r.skipped) skipped++;
            else changed++;
          } catch (err: any) {
            this.logger.warn(
              `Smart Pricing failed for ${listings[idx].id}: ${err?.message ?? err}`,
            );
            skipped++;
          }
        }
      }),
    );

    this.logger.log(
      `Smart Pricing run done: ${listings.length} processed, ${changed} adjusted, ${skipped} skipped`,
    );
    return { processed: listings.length, changed, skipped };
  }

  /** Recent adjustment history for a listing. UI uses this on the host edit page. */
  async history(listingId: string, limit = 20) {
    return this.prisma.priceAdjustmentLog.findMany({
      where: { listingId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ─── Factor computation ──────────────────────────────────────────────

  private async computeFactors(
    listingId: string,
    categoryId: string,
    basePrice: number,
  ): Promise<Factors> {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + 7);

    const [comparablesMedian, searchHits, blockedNights] = await Promise.all([
      this.queryComparablesMedian(listingId, categoryId),
      this.querySearchHits(listingId),
      this.queryBlockedNights(listingId, today, windowEnd),
    ]);

    // 1. Comparables: bring the price toward the local median (capped at ±10%)
    const compFactor = comparablesMedian
      ? this.clamp(comparablesMedian / basePrice, 0.9, 1.1)
      : 1.0;

    // 2. Search demand: each search in last 7d nudges up by 0.4%, capped at +12%
    const demandFactor = this.clamp(1 + searchHits * 0.004, 1.0, 1.12);

    // 3. Empty-calendar urgency: 0 blocked nights = -10%, 7 = 0%
    const emptyFraction = (7 - blockedNights) / 7;
    const emptyUrgency = 1 - emptyFraction * 0.1;

    // 4. Scarcity (opposite of #3): 7 blocked = +8%
    const scarcity = blockedNights >= 7 ? 1.08 : 1.0;

    // 5. Weekend bump
    const dow = now.getDay();
    const weekend = dow === 5 || dow === 6 ? 1.05 : 1.0;

    // 6. Season — Tunisia high season is Jun-Sep
    const month = now.getMonth(); // 0-indexed
    const season = month >= 5 && month <= 8 ? 1.1 : 1.0;

    return {
      comparables: compFactor,
      demand: demandFactor,
      emptyUrgency,
      scarcity,
      weekend,
      season,
    };
  }

  /** Multiply the factors and clamp. Each factor sits near 1.0, so the product stays sane. */
  private combine(f: Factors): number {
    return (
      f.comparables *
      f.demand *
      f.emptyUrgency *
      f.scarcity *
      f.weekend *
      f.season
    );
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  private humanReason(f: Factors, multiplier: number): string {
    const dir = multiplier > 1 ? 'up' : 'down';
    const parts: string[] = [];
    if (Math.abs(f.comparables - 1) > 0.02) {
      parts.push(
        f.comparables > 1 ? 'similar listings cost more' : 'similar listings cost less',
      );
    }
    if (f.demand > 1.02) parts.push(`high search interest`);
    if (f.emptyUrgency < 0.99) parts.push('open calendar this week');
    if (f.scarcity > 1) parts.push('fully booked next week');
    if (f.weekend > 1) parts.push("today's a weekend day");
    if (f.season > 1) parts.push('high season');
    return parts.length
      ? `Adjusted ${dir} ${(Math.abs(multiplier - 1) * 100).toFixed(0)}%: ${parts.join(', ')}`
      : `Adjusted ${dir} ${(Math.abs(multiplier - 1) * 100).toFixed(0)}%`;
  }

  // ─── DB queries ──────────────────────────────────────────────────────

  /** Median price of active, non-deleted listings within 5km in the same category. */
  private async queryComparablesMedian(
    listingId: string,
    categoryId: string,
  ): Promise<number | null> {
    const rows = await this.prisma.$queryRawUnsafe<{ median: string | null }[]>(
      `
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY l."pricePerDay")::float AS median
        FROM listings l
        WHERE l."isActive" = true
          AND l."deletedAt" IS NULL
          AND l."categoryId" = $1
          AND l.id <> $2
          AND l.location IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM listings me
            WHERE me.id = $2 AND me.location IS NOT NULL
              AND ST_DWithin(me.location::geography, l.location::geography, 5000)
          )
      `,
      categoryId,
      listingId,
    );
    const m = rows?.[0]?.median;
    return m == null ? null : Number(m);
  }

  /** Count recent searches likely to surface this listing (proxy: search logs in last 7 days). */
  private async querySearchHits(listingId: string): Promise<number> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // We don't have a search→listing impression table, so we approximate with
    // total searches in the window — every active listing competes for the same
    // demand. A future v2 could narrow this with category / city matching.
    const count = await this.prisma.aiSearchLog.count({
      where: { createdAt: { gt: sevenDaysAgo } },
    });
    // Damp it so a viral spike doesn't peg the multiplier — log10 scale.
    return Math.round(Math.log10(count + 1) * 10);
    void listingId;
  }

  /** Number of nights in [from, to) that are blocked by confirmed/paid/completed bookings. */
  private async queryBlockedNights(
    listingId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<{ blocked: string }[]>(
      `
        SELECT COALESCE(COUNT(DISTINCT d::date), 0)::text AS blocked
        FROM bookings b,
             LATERAL generate_series(
               GREATEST(b."startDate", $2::date),
               LEAST(b."endDate", $3::date - INTERVAL '1 day'),
               INTERVAL '1 day'
             ) AS d
        WHERE b."listingId" = $1
          AND b.status IN ('confirmed', 'paid', 'completed')
          AND b."startDate" < $3::date
          AND b."endDate"   >= $2::date
      `,
      listingId,
      from,
      to,
    );
    return Number(rows?.[0]?.blocked ?? 0);
  }
}
