import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Host KYC: hosts upload a government ID image; admins approve or reject.
 *
 * Storage: Cloudinary in production (private folder, signed URLs would be a
 * v2 improvement), local /uploads/kyc/ in dev. Either way the URL is stored
 * on the User row in `idDocumentUrl`.
 *
 * State columns on User:
 *   - idSubmittedAt       — host uploaded (or re-uploaded after rejection)
 *   - idVerifiedAt        — admin approved
 *   - idRejectedAt + idRejectionReason — admin rejected
 *
 * A host is "verified" iff idVerifiedAt IS NOT NULL.
 */

const ACCEPTED_MIME = /^image\/(jpeg|jpg|png|webp)$/;
const MAX_BYTES = 8 * 1024 * 1024;

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Host uploads a single ID image. Replaces any prior submission. */
  async submit(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (!ACCEPTED_MIME.test(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, or WebP images are accepted');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('File too large (max 8MB)');
    }

    // Try Cloudinary first, fall back to local disk in dev — same pattern as
    // listing images. Production runs always use Cloudinary.
    let url: string | null = await this.cloudinary.uploadFile(
      file,
      `rentai/kyc/${userId}`,
    );

    if (!url) {
      const baseDir = './uploads';
      const dir = path.join(baseDir, 'kyc', userId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const ext = path.extname(file.originalname) || '.jpg';
      const filename = `id-${Date.now()}${ext}`;
      const filePath = path.join(dir, filename);
      if (file.buffer) {
        fs.writeFileSync(filePath, file.buffer);
      } else if ((file as any).path && fs.existsSync((file as any).path)) {
        fs.renameSync((file as any).path, filePath);
      } else {
        throw new BadRequestException('Could not read uploaded file');
      }
      url = `/uploads/kyc/${userId}/${filename}`;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        idDocumentUrl: url,
        idSubmittedAt: new Date(),
        // Resubmissions clear prior rejection / verification states so the
        // queue picks the row back up.
        idVerifiedAt: null,
        idVerifiedBy: null,
        idRejectedAt: null,
        idRejectionReason: null,
      },
    });

    this.logger.log(`KYC submitted: user=${userId}`);
    return { submittedAt: new Date(), status: 'pending' as const };
  }

  /** Status string for the current user — UI uses this to render the badge. */
  async status(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        idDocumentUrl: true,
        idSubmittedAt: true,
        idVerifiedAt: true,
        idRejectedAt: true,
        idRejectionReason: true,
      },
    });
    if (!u) throw new NotFoundException('User not found');

    let state: 'none' | 'pending' | 'verified' | 'rejected' = 'none';
    if (u.idVerifiedAt) state = 'verified';
    else if (u.idRejectedAt && (!u.idSubmittedAt || u.idRejectedAt > u.idSubmittedAt)) {
      state = 'rejected';
    } else if (u.idSubmittedAt) state = 'pending';

    return {
      state,
      submittedAt: u.idSubmittedAt,
      verifiedAt: u.idVerifiedAt,
      rejectedAt: u.idRejectedAt,
      rejectionReason: u.idRejectionReason,
      hasDocument: !!u.idDocumentUrl,
    };
  }

  // ─── Admin ──────────────────────────────────────────────────────────────

  /** Pending submissions — admin queue. Newest first. */
  async pendingQueue() {
    return this.prisma.user.findMany({
      where: {
        idSubmittedAt: { not: null },
        idVerifiedAt: null,
      },
      orderBy: { idSubmittedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        isHost: true,
        idDocumentUrl: true,
        idSubmittedAt: true,
        idRejectedAt: true,
        idRejectionReason: true,
      },
    });
  }

  async approve(userId: string, adminId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { idDocumentUrl: true },
    });
    if (!u?.idDocumentUrl) {
      throw new BadRequestException('User has no submitted document');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        idVerifiedAt: new Date(),
        idVerifiedBy: adminId,
        idRejectedAt: null,
        idRejectionReason: null,
      },
    });
    this.logger.log(`KYC approved: user=${userId} by admin=${adminId}`);
    this.notifications.create({
      userId,
      kind: 'KYC_APPROVED',
      title: "You're a Verified host",
      body: 'Renters will see the verified badge on your listings.',
      link: '/profile',
    });
    return { state: 'verified' as const };
  }

  async reject(userId: string, adminId: string, reason: string) {
    if (!reason || reason.trim().length < 4) {
      throw new BadRequestException('Rejection reason is required (≥ 4 chars)');
    }

    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { idDocumentUrl: true },
    });
    if (!u?.idDocumentUrl) {
      throw new BadRequestException('User has no submitted document');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        idRejectedAt: new Date(),
        idRejectionReason: reason.trim().slice(0, 500),
        idVerifiedAt: null,
        idVerifiedBy: null,
      },
    });
    this.logger.log(`KYC rejected: user=${userId} by admin=${adminId} reason="${reason}"`);
    this.notifications.create({
      userId,
      kind: 'KYC_REJECTED',
      title: 'Your ID submission was rejected',
      body: reason.trim().slice(0, 200),
      link: '/profile',
    });
    return { state: 'rejected' as const };
  }

  /** Admin can force-revoke a previously-verified host (e.g. after a complaint). */
  async revoke(userId: string, adminId: string, reason: string) {
    if (!reason || reason.trim().length < 4) {
      throw new ForbiddenException('Reason required to revoke verification');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        idVerifiedAt: null,
        idVerifiedBy: null,
        idRejectedAt: new Date(),
        idRejectionReason: reason.trim().slice(0, 500),
      },
    });
    this.logger.warn(`KYC revoked: user=${userId} by admin=${adminId} reason="${reason}"`);
    return { state: 'rejected' as const };
  }
}
