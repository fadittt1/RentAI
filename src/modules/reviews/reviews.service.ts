import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Review, ReviewAuthorRole } from '@prisma/client';
import { CreateReviewDto } from './dto/create-review.dto';
import { BookingsService } from '../bookings/bookings.service';
import { UsersService } from '../users/users.service';
import { QualityScoreService } from '../quality/quality-score.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    private bookingsService: BookingsService,
    private usersService: UsersService,
    private qualityScore: QualityScoreService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Two-sided review create. The author's relation to the booking decides
   * the side (renter→host or host→renter); we never trust a role passed
   * from the client.
   */
  async create(
    createReviewDto: CreateReviewDto,
    authorId: string,
  ): Promise<Review> {
    const booking = await this.bookingsService.findOne(
      createReviewDto.bookingId,
    );

    let authorRole: ReviewAuthorRole;
    let targetUserId: string;
    if (booking.renterId === authorId) {
      authorRole = 'RENTER';
      targetUserId = booking.hostId;
    } else if (booking.hostId === authorId) {
      authorRole = 'HOST';
      targetUserId = booking.renterId;
    } else {
      throw new ForbiddenException(
        'Only the renter or host of this booking can leave a review',
      );
    }

    if (booking.status !== 'completed') {
      throw new BadRequestException('Can only review completed bookings');
    }

    // One review per side per booking. The DB enforces this too, but a
    // friendlier error is worth the round-trip.
    const existing = await this.prisma.review.findUnique({
      where: {
        bookingId_authorRole: {
          bookingId: createReviewDto.bookingId,
          authorRole,
        },
      },
    });
    if (existing) {
      throw new BadRequestException(
        'You have already reviewed this booking',
      );
    }

    const review = await this.prisma.review.create({
      data: {
        bookingId: createReviewDto.bookingId,
        authorId,
        authorRole,
        targetUserId,
        listingId: booking.listingId,
        rating: createReviewDto.rating,
        comment: createReviewDto.comment,
      },
    });

    await this.updateUserRating(targetUserId);

    // Renter→host: bumps listing quality + host quality.
    // Host→renter: bumps the renter's trust score.
    if (authorRole === 'RENTER') {
      this.qualityScore.recomputeListing(booking.listingId).catch(() => undefined);
      this.qualityScore.recomputeHost(targetUserId).catch(() => undefined);
    } else {
      this.qualityScore.recomputeRenter(targetUserId).catch(() => undefined);
    }

    this.notifications.create({
      userId: targetUserId,
      kind: 'REVIEW_RECEIVED',
      title:
        authorRole === 'RENTER'
          ? `New ${createReviewDto.rating}★ review on your listing`
          : `${createReviewDto.rating}★ review on your booking`,
      body: createReviewDto.comment?.slice(0, 200),
      link: '/profile',
      payload: { reviewId: review.id, bookingId: booking.id },
    });

    return review;
  }

  async findByUser(userId: string): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: { targetUserId: userId },
      include: {
        author: true,
        listing: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /** All reviews left on the given listing (renter→host only — host→renter has no listing context). */
  async findByListing(listingId: string): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: { listingId, authorRole: 'RENTER' },
      include: { author: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<Review> {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        author: true,
        targetUser: true,
        listing: true,
        booking: true,
      },
    });
    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }
    return review;
  }

  /**
   * Pending reviews for the current user — bookings they could review but
   * haven't yet. UI uses this to prompt both sides after a booking completes.
   */
  async pendingForUser(userId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: 'completed',
        OR: [{ renterId: userId }, { hostId: userId }],
      },
      include: {
        listing: { select: { id: true, title: true, images: true } },
        renter: { select: { id: true, name: true } },
        host: { select: { id: true, name: true } },
        reviews: { select: { authorRole: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    return bookings
      .map((b) => {
        const isRenter = b.renterId === userId;
        const myRole: ReviewAuthorRole = isRenter ? 'RENTER' : 'HOST';
        const alreadyDone = b.reviews.some((r) => r.authorRole === myRole);
        if (alreadyDone) return null;
        return {
          bookingId: b.id,
          listing: b.listing,
          counterparty: isRenter ? b.host : b.renter,
          myRole,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  private async updateUserRating(userId: string): Promise<void> {
    const reviews = await this.prisma.review.findMany({
      where: { targetUserId: userId },
    });

    if (reviews.length > 0) {
      const totalRating = reviews.reduce(
        (sum, review) => sum + review.rating,
        0,
      );
      const averageRating = totalRating / reviews.length;
      const roundedRating = Math.round(averageRating * 100) / 100;

      await this.usersService.update(userId, {
        ratingAvg: roundedRating,
        ratingCount: reviews.length,
      } as any);
    }
  }
}
