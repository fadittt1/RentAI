import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, WalletTransactionType, LedgerEntryType, LedgerDirection, LedgerStatus } from '@prisma/client';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async getWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: { userId, balance: 0 },
        include: { transactions: true },
      });
    }

    return wallet;
  }

  async topUp(userId: string, amount: number) {
    // Explicitly coerce — amount could arrive as a string if ValidationPipe transform
    // is misconfigured. Never trust the type declaration alone.
    const safeAmount = parseFloat(amount as any);
    if (!isFinite(safeAmount) || safeAmount <= 0) {
      throw new BadRequestException('Top-up amount must be a positive number');
    }

    return await this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { userId, balance: 0 } });
      }

      const balanceBefore = parseFloat(wallet.balance.toString());
      const balanceAfter = parseFloat((balanceBefore + safeAmount).toFixed(2));

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          actorId: userId,
          type: LedgerEntryType.WALLET_TOP_UP,
          direction: LedgerDirection.CREDIT,
          amount: safeAmount,
          status: LedgerStatus.POSTED,
          metadata: { reason: 'simulated_top_up' },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: safeAmount,
          balanceBefore,
          balanceAfter,
          type: WalletTransactionType.TOP_UP,
          ledgerEntryId: ledgerEntry.id,
        },
      });

      return updatedWallet;
    });
  }

  async payForBooking(userId: string, bookingId: string, amount: number, tx: Prisma.TransactionClient) {
    // Atomic check and decrement using raw SQL or optimistic concurrency.
    // For simplicity with Prisma, we do read, check, update in transaction.
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    const balanceBefore = parseFloat(wallet.balance.toString());
    const safeAmount = parseFloat((amount as any).toString());
    if (balanceBefore < safeAmount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const balanceAfter = parseFloat((balanceBefore - safeAmount).toFixed(2));

    // Use Prisma's decrement to ensure atomic DB update against race conditions
    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: safeAmount } },
    });

    // Post-check just in case (though decrement should handle it)
    if (parseFloat(updatedWallet.balance.toString()) < 0) {
      throw new BadRequestException('Wallet balance cannot go negative');
    }

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: safeAmount,
        balanceBefore,
        balanceAfter: parseFloat(updatedWallet.balance.toString()),
        type: WalletTransactionType.PAYMENT,
        referenceId: bookingId,
      },
    });

    return updatedWallet;
  }

  async refundToWallet(userId: string, bookingId: string, amount: number, tx: Prisma.TransactionClient) {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    // Idempotency check
    const existingRefund = await tx.walletTransaction.findFirst({
      where: {
        walletId: wallet.id,
        type: WalletTransactionType.REFUND,
        referenceId: bookingId,
      },
    });

    if (existingRefund) {
      // Already refunded, idempotent return
      return wallet;
    }

    const balanceBefore = parseFloat(wallet.balance.toString());
    const safeRefundAmount = parseFloat((amount as any).toString());

    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: safeRefundAmount } },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: safeRefundAmount,
        balanceBefore,
        balanceAfter: parseFloat(updatedWallet.balance.toString()),
        type: WalletTransactionType.REFUND,
        referenceId: bookingId,
      },
    });

    return updatedWallet;
  }
}
