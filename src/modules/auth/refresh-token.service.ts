import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Record a freshly-issued refresh token. We persist only the sha256 hash,
   * never the raw JWT — so a DB leak doesn't grant attackers live sessions.
   */
  async store(input: {
    userId: string;
    rawToken: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        userId: input.userId,
        tokenHash: this.hash(input.rawToken),
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }

  /** True if the raw token corresponds to a live (non-revoked, non-expired) row. */
  async isLive(rawToken: string): Promise<boolean> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(rawToken) },
    });
    if (!row) return false;
    if (row.revokedAt) return false;
    if (row.expiresAt < new Date()) return false;
    return true;
  }

  /** Mark a single refresh token revoked. Idempotent — no-op if already revoked or unknown. */
  async revoke(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Mark every live refresh token for a user revoked. Used by "sign out everywhere". */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
}
