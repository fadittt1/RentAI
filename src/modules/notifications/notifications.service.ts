import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Central place to create + read in-app notifications.
 *
 * Other services call `create()` after meaningful events. The HTTP controller
 * exposes the read side (list, mark read, unread count) for the bell icon and
 * /notifications page.
 *
 * Design notes:
 *   - `kind` is a short opaque string ("BOOKING_REQUESTED", etc.); the
 *     frontend maps these to icons/colours. New backend kinds appear as
 *     generic "info" entries on older clients until they ship a UI update.
 *   - `link` is the URL the user should land on when they tap the entry —
 *     points at the actual page that resolves the event (e.g. /host/bookings
 *     for a booking request).
 *   - All notification calls from event hooks are best-effort: never throw,
 *     never block the originating mutation.
 */

export type NotificationKind =
  | 'BOOKING_REQUESTED'      // host: a renter requested your listing
  | 'BOOKING_ACCEPTED'       // renter: host accepted, you can now pay
  | 'BOOKING_REJECTED'       // renter: host rejected
  | 'BOOKING_PAID'           // host: renter paid, get ready
  | 'BOOKING_CANCELLED'      // other party: counterpart cancelled
  | 'BOOKING_COMPLETED'      // both: booking marked complete
  | 'REVIEW_RECEIVED'        // both: someone reviewed you
  | 'DISPUTE_OPENED'         // counter party + admin: a dispute opened
  | 'DISPUTE_RESOLVED'       // both parties: admin resolved the dispute
  | 'DISPUTE_MESSAGE'        // counter party: new message on dispute timeline
  | 'KYC_APPROVED'           // host: ID approved, badge granted
  | 'KYC_REJECTED'           // host: ID rejected, reason inside
  | 'PAYOUT_PAID';           // host: payout completed

interface CreateInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Best-effort create. Logs but never throws. */
  async create(input: CreateInput): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userId: input.userId,
          kind: input.kind,
          title: input.title.slice(0, 255),
          body: input.body ? input.body.slice(0, 2000) : null,
          link: input.link ?? null,
          payload: (input.payload as any) ?? null,
        },
      });
    } catch (err: any) {
      this.logger.warn(
        `Failed to create notification for ${input.userId} kind=${input.kind}: ${err?.message ?? err}`,
      );
    }
  }

  /** Most recent N notifications for the user, newest first. */
  async list(userId: string, opts?: { limit?: number; unreadOnly?: boolean }) {
    const limit = Math.min(opts?.limit ?? 30, 100);
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(opts?.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  /** Mark a single notification read. No-op if not owned by user. */
  async markRead(userId: string, id: string): Promise<{ ok: boolean }> {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: result.count > 0 };
  }

  /** Mark every unread notification for the user as read. Returns count. */
  async markAllRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { count: result.count };
  }
}
