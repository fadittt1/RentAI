import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  Dispute,
  DisputeOpenedBy,
  DisputeReason,
  DisputeResolution,
  DisputeStatus,
} from '@prisma/client';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { PaymentsService } from '../payments/payments.service';
import { QualityScoreService } from '../quality/quality-score.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Dispute resolution flow.
 *
 * Lifecycle:
 *   1. Renter or host opens a dispute on a paid/completed booking.
 *      `Booking.disputeStatus` flips to OPEN → payouts service skips it.
 *   2. Both parties + admin post messages / evidence on the timeline.
 *   3. Admin resolves with one of REFUND_FULL / REFUND_PARTIAL / FAVOR_HOST
 *      / DISMISSED. If a refund is owed and payment is captured, we trigger
 *      the existing refund flow (which posts reverse ledger entries).
 *
 * Safety:
 *   - Only the booking's renter, host, or an admin can read or write a dispute.
 *   - Opening is one-shot per booking — an existing OPEN dispute blocks a new one.
 *   - Closing requires admin role; participants cannot self-resolve.
 */
@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly payments: PaymentsService,
    private readonly qualityScore: QualityScoreService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Open ─────────────────────────────────────────────────────────────

  async open(
    userId: string,
    input: {
      bookingId: string;
      reason: DisputeReason;
      description: string;
    },
  ): Promise<Dispute> {
    if (!input.description || input.description.trim().length < 10) {
      throw new BadRequestException(
        'Please describe the issue in at least 10 characters',
      );
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: input.bookingId },
      select: {
        id: true,
        renterId: true,
        hostId: true,
        status: true,
        disputeStatus: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    let role: DisputeOpenedBy;
    if (booking.renterId === userId) role = 'RENTER';
    else if (booking.hostId === userId) role = 'HOST';
    else
      throw new ForbiddenException(
        'Only the renter or host of this booking can open a dispute',
      );

    if (!['paid', 'completed'].includes(booking.status)) {
      throw new BadRequestException(
        'Disputes can only be opened on paid or completed bookings',
      );
    }

    const existingOpen = await this.prisma.dispute.findFirst({
      where: {
        bookingId: input.bookingId,
        status: { in: ['OPEN'] },
      },
      select: { id: true },
    });
    if (existingOpen) {
      throw new BadRequestException(
        'There is already an open dispute for this booking',
      );
    }

    const dispute = await this.prisma.$transaction(async (tx) => {
      const d = await tx.dispute.create({
        data: {
          bookingId: input.bookingId,
          openedById: userId,
          openedBy: role,
          reason: input.reason,
          description: input.description.trim().slice(0, 2000),
        },
      });
      await tx.booking.update({
        where: { id: input.bookingId },
        data: { disputeStatus: 'OPEN' },
      });
      // Seed the timeline with the opening message so admins see context in one place.
      await tx.disputeMessage.create({
        data: {
          disputeId: d.id,
          authorId: userId,
          body: input.description.trim().slice(0, 2000),
        },
      });
      return d;
    });

    this.logger.warn(
      `Dispute opened: booking=${input.bookingId} by=${userId} (${role}) reason=${input.reason}`,
    );

    // Host-opened disputes are a strong negative signal against the renter —
    // refresh the renter's trust score immediately. Best-effort.
    if (role === 'HOST') {
      this.qualityScore.recomputeRenter(booking.renterId).catch(() => undefined);
    }

    // Notify the other party so they can respond.
    const counterpartyId =
      role === 'RENTER' ? booking.hostId : booking.renterId;
    this.notifications.create({
      userId: counterpartyId,
      kind: 'DISPUTE_OPENED',
      title: 'A dispute was opened on your booking',
      body: 'Open the case to see the details and respond.',
      link: `/disputes/${dispute.id}`,
      payload: { disputeId: dispute.id, bookingId: input.bookingId },
    });

    return dispute;
  }

  // ─── Read ─────────────────────────────────────────────────────────────

  /** All disputes touching this user (as renter or host). */
  async listForUser(userId: string) {
    return this.prisma.dispute.findMany({
      where: {
        booking: { OR: [{ renterId: userId }, { hostId: userId }] },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        booking: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
            totalPrice: true,
            renterId: true,
            hostId: true,
            listing: { select: { id: true, title: true, images: true } },
          },
        },
      },
    });
  }

  async getOne(disputeId: string, userId: string, isAdmin: boolean) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        booking: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
            totalPrice: true,
            renterId: true,
            hostId: true,
            listing: { select: { id: true, title: true, images: true } },
            renter: { select: { id: true, name: true, avatarUrl: true } },
            host: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');

    if (
      !isAdmin &&
      dispute.booking.renterId !== userId &&
      dispute.booking.hostId !== userId
    ) {
      throw new ForbiddenException('You cannot view this dispute');
    }

    return dispute;
  }

  // ─── Messages / evidence ──────────────────────────────────────────────

  async postMessage(
    disputeId: string,
    userId: string,
    isAdmin: boolean,
    body: string,
    files?: Express.Multer.File[],
  ) {
    const trimmed = (body ?? '').trim();
    if (!trimmed && (!files || files.length === 0)) {
      throw new BadRequestException('Message body or evidence required');
    }

    // Authorization
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        booking: { select: { renterId: true, hostId: true } },
      },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (
      !isAdmin &&
      dispute.booking.renterId !== userId &&
      dispute.booking.hostId !== userId
    ) {
      throw new ForbiddenException('You cannot post to this dispute');
    }

    if (dispute.status === 'RESOLVED') {
      throw new BadRequestException('This dispute is closed');
    }

    const attachments: string[] = [];
    if (files && files.length > 0) {
      for (const f of files.slice(0, 5)) {
        const url = await this.storeEvidence(disputeId, f);
        if (url) attachments.push(url);
      }
    }

    // Notify the other party (not the author) that there's a new message.
    // When an admin posts, both renter + host get notified.
    const recipients: string[] = [];
    if (isAdmin) {
      recipients.push(dispute.booking.renterId, dispute.booking.hostId);
    } else if (dispute.booking.renterId === userId) {
      recipients.push(dispute.booking.hostId);
    } else {
      recipients.push(dispute.booking.renterId);
    }
    for (const uid of recipients) {
      this.notifications.create({
        userId: uid,
        kind: 'DISPUTE_MESSAGE',
        title: isAdmin ? 'Admin replied on your dispute' : 'New message on your dispute',
        body: trimmed.slice(0, 200) || (attachments.length ? '(photo evidence)' : ''),
        link: `/disputes/${disputeId}`,
        payload: { disputeId },
      });
    }

    return this.prisma.disputeMessage.create({
      data: {
        disputeId,
        authorId: userId,
        isAdmin,
        body: trimmed.slice(0, 2000),
        attachments,
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  private async storeEvidence(
    disputeId: string,
    file: Express.Multer.File,
  ): Promise<string | null> {
    if (!file?.mimetype?.match(/^image\//)) return null;
    if (file.size > 8 * 1024 * 1024) return null;

    const url = await this.cloudinary.uploadFile(
      file,
      `rentai/disputes/${disputeId}`,
    );
    if (url) return url;

    // Dev fallback: local disk
    const baseDir = './uploads';
    const dir = path.join(baseDir, 'disputes', disputeId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    const filePath = path.join(dir, filename);
    if (file.buffer) {
      fs.writeFileSync(filePath, file.buffer);
    } else if ((file as any).path && fs.existsSync((file as any).path)) {
      fs.renameSync((file as any).path, filePath);
    } else {
      return null;
    }
    return `/uploads/disputes/${disputeId}/${filename}`;
  }

  // ─── Admin ────────────────────────────────────────────────────────────

  async adminQueue(opts?: { status?: DisputeStatus }) {
    return this.prisma.dispute.findMany({
      where: opts?.status ? { status: opts.status } : { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
      include: {
        booking: {
          select: {
            id: true,
            totalPrice: true,
            renter: { select: { id: true, name: true } },
            host: { select: { id: true, name: true } },
            listing: { select: { id: true, title: true } },
          },
        },
        _count: { select: { messages: true } },
      },
    });
  }

  /**
   * Admin closes the case. If the resolution is REFUND_FULL or REFUND_PARTIAL,
   * we trigger the existing payments refund flow (which posts reverse ledger
   * entries). For REFUND_PARTIAL we just record the intended amount — the
   * actual partial-refund wiring belongs to the payments module and isn't in
   * scope for v1, so a partial decision is recorded but the cash movement is
   * left for an admin to handle out-of-band.
   */
  async resolve(
    disputeId: string,
    adminId: string,
    input: {
      resolution: DisputeResolution;
      refundAmount?: number;
      notes?: string;
    },
  ): Promise<Dispute> {
    if (input.resolution === 'PENDING') {
      throw new BadRequestException('Pick a real resolution, not PENDING');
    }

    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { booking: { select: { id: true, totalPrice: true } } },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.status === 'RESOLVED') {
      throw new BadRequestException('Already resolved');
    }

    const refundAmount =
      input.resolution === 'REFUND_FULL'
        ? Number(dispute.booking.totalPrice)
        : input.resolution === 'REFUND_PARTIAL'
          ? Math.max(0, Math.min(
              Number(input.refundAmount ?? 0),
              Number(dispute.booking.totalPrice),
            ))
          : null;

    // Try to actually refund the renter if the resolution calls for it.
    // Wrapped — a refund failure shouldn't block recording the decision.
    if (input.resolution === 'REFUND_FULL') {
      try {
        await this.payments.refund(dispute.booking.id);
      } catch (err: any) {
        this.logger.warn(
          `Dispute ${disputeId} REFUND_FULL: refund call failed (${err?.message ?? err}). Resolution still recorded; reconcile manually.`,
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const d = await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'RESOLVED',
          resolution: input.resolution,
          refundAmount: refundAmount,
          resolvedById: adminId,
          resolvedAt: new Date(),
          resolverNotes: input.notes?.trim().slice(0, 2000) ?? null,
        },
      });
      await tx.booking.update({
        where: { id: dispute.booking.id },
        data: { disputeStatus: 'RESOLVED' },
      });
      await tx.disputeMessage.create({
        data: {
          disputeId,
          authorId: adminId,
          isAdmin: true,
          body:
            `Resolved as ${input.resolution}` +
            (refundAmount != null ? ` (refund ${refundAmount} TND)` : '') +
            (input.notes ? `\n\n${input.notes.trim()}` : ''),
        },
      });
      return d;
    });

    this.logger.log(
      `Dispute ${disputeId} resolved by admin ${adminId}: ${input.resolution} refund=${refundAmount}`,
    );

    // Notify both renter + host of the outcome. Best-effort.
    const participants = await this.prisma.booking.findUnique({
      where: { id: dispute.booking.id },
      select: { renterId: true, hostId: true },
    });
    if (participants) {
      const resolutionLabel = input.resolution.replace('_', ' ').toLowerCase();
      for (const uid of [participants.renterId, participants.hostId]) {
        this.notifications.create({
          userId: uid,
          kind: 'DISPUTE_RESOLVED',
          title: `Dispute resolved — ${resolutionLabel}`,
          body: input.notes?.slice(0, 200),
          link: `/disputes/${disputeId}`,
          payload: { disputeId, resolution: input.resolution },
        });
      }
    }

    return updated;
  }
}
