import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { NotificationService } from './notification.service';

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationService,
  ) {}

  async requestCode(userId: string, channel: 'EMAIL' | 'PHONE') {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new NotFoundException('User not found');

    const destination = channel === 'EMAIL' ? user.email : user.phone;
    if (!destination) {
      throw new BadRequestException(
        `User has no ${channel.toLowerCase()} on file`,
      );
    }

    const alreadyVerified =
      channel === 'EMAIL' ? user.verifiedEmail : user.verifiedPhone;
    if (alreadyVerified) {
      throw new BadRequestException(`${channel} already verified`);
    }

    // Cooldown: refuse if a fresh unconsumed code was issued in the last 60s
    const recent = await this.prisma.verificationCode.findFirst({
      where: {
        userId,
        channel,
        consumedAt: null,
        createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      const waitSec =
        RESEND_COOLDOWN_SECONDS -
        Math.floor((Date.now() - recent.createdAt.getTime()) / 1000);
      throw new BadRequestException(
        `Please wait ${waitSec}s before requesting another code`,
      );
    }

    // Invalidate any other unconsumed codes for this channel
    await this.prisma.verificationCode.updateMany({
      where: { userId, channel, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    await this.prisma.verificationCode.create({
      data: {
        userId,
        channel,
        destination,
        codeHash,
        expiresAt,
      },
    });

    await this.notifications.sendVerificationCode(
      channel === 'EMAIL' ? 'email' : 'phone',
      destination,
      code,
    );

    return {
      message: `Verification code sent to ${this.maskDestination(destination, channel)}`,
      expiresInSeconds: CODE_TTL_MINUTES * 60,
    };
  }

  async verifyCode(userId: string, channel: 'EMAIL' | 'PHONE', code: string) {
    const record = await this.prisma.verificationCode.findFirst({
      where: { userId, channel, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new BadRequestException('No active code — request a new one');
    }

    if (record.expiresAt < new Date()) {
      throw new BadRequestException('Code expired — request a new one');
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      // Burn the record so the user is forced to request a fresh one
      await this.prisma.verificationCode.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
      throw new BadRequestException(
        'Too many attempts — request a new code',
      );
    }

    const isValid = await bcrypt.compare(code, record.codeHash);

    if (!isValid) {
      await this.prisma.verificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid code');
    }

    // Mark code consumed + flip user verified flag in a single transaction
    await this.prisma.$transaction([
      this.prisma.verificationCode.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data:
          channel === 'EMAIL'
            ? { verifiedEmail: true }
            : { verifiedPhone: true },
      }),
    ]);

    return { verified: true, channel };
  }

  private maskDestination(value: string, channel: 'EMAIL' | 'PHONE'): string {
    if (channel === 'EMAIL') {
      const [local, domain] = value.split('@');
      if (!local || !domain) return value;
      const hidden =
        local.length <= 2 ? local[0] + '*' : local[0] + '***' + local.slice(-1);
      return `${hidden}@${domain}`;
    }
    return value.length <= 4 ? '****' : `***${value.slice(-3)}`;
  }
}
