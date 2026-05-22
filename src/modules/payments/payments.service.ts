import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaymentIntent } from '@prisma/client';
import { PaymentStateMachine } from '../../common/utils/payment-state-machine';
import { BookingsService } from '../bookings/bookings.service';
import { CancellationPolicyService } from '../../common/policies/cancellation-policy.service';
import { LedgerService } from '../ledger/ledger.service';
import { ConfigService } from '@nestjs/config';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { ProviderKey } from './providers/payment-provider.interface';

@Injectable()
export class PaymentsService {
  /** Default commission rate read from env, fallback 0.10 */
  private readonly defaultCommissionRate: number;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => BookingsService))
    private bookingsService: BookingsService,
    private cancellationPolicyService: CancellationPolicyService,
    private ledgerService: LedgerService,
    private configService: ConfigService,
    private providerRegistry: PaymentProviderRegistry,
  ) {
    this.defaultCommissionRate =
      Number(this.configService.get<string>('COMMISSION_PERCENTAGE')) || 0.1;
  }

  // ─── Real-money checkout via external provider ─────────────────────────

  /**
   * Start a real-money checkout for a booking via the chosen provider.
   * Returns a redirect URL the renter should be sent to.
   *
   * Idempotent: if a checkout was already started and is still pending, we
   * return the existing redirect URL instead of creating a duplicate.
   */
  async createCheckout(
    bookingId: string,
    userId: string,
    providerKey: ProviderKey,
  ): Promise<{ redirectUrl: string; provider: ProviderKey }> {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { bookingId },
    });
    if (!intent) {
      throw new NotFoundException(
        `Payment intent not found for booking ${bookingId}`,
      );
    }
    if (intent.renterId !== userId) {
      throw new ForbiddenException(
        'Only the renter can pay for this booking',
      );
    }
    if (intent.status === 'captured') {
      throw new BadRequestException('This booking is already paid.');
    }
    if (intent.status === 'cancelled' || intent.status === 'refunded') {
      throw new BadRequestException(
        `Cannot pay: payment is ${intent.status}.`,
      );
    }

    // Reuse the live link if we already created one and the user is just
    // hitting the button again. Avoids a second Flouci payment per booking.
    if (intent.redirectUrl && intent.provider === providerKey && intent.providerRef) {
      return { redirectUrl: intent.redirectUrl, provider: providerKey };
    }

    const provider = this.providerRegistry.get(providerKey);
    if (!provider.isConfigured()) {
      throw new BadRequestException(
        `Payment provider "${providerKey}" is not available right now.`,
      );
    }

    const frontendBase =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const apiBase =
      this.configService.get<string>('API_PUBLIC_URL') ??
      this.configService.get<string>('BACKEND_URL') ??
      'http://localhost:3001';

    const successUrl = `${apiBase}/api/payments/${providerKey}/callback?booking=${encodeURIComponent(bookingId)}&outcome=success`;
    const failUrl = `${frontendBase}/booking/${bookingId}/pay?outcome=failed`;

    const result = await provider.createPayment({
      amount: Number(intent.amount),
      currency: 'TND',
      successUrl,
      failUrl,
      description: `RentEverything booking ${bookingId}`,
      reference: bookingId,
    });

    await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        provider: providerKey,
        providerRef: result.providerRef,
        redirectUrl: result.redirectUrl,
        status: intent.status === 'created' ? 'authorized' : intent.status,
      },
    });

    this.logger.log(
      `Checkout started: booking=${bookingId} provider=${providerKey} ref=${result.providerRef}`,
    );

    return { redirectUrl: result.redirectUrl, provider: providerKey };
  }

  /**
   * Called when the provider redirects the renter back to us. We re-fetch the
   * payment server-to-server to confirm — the user's query string alone is
   * never trusted.
   *
   * On success, this goes through the existing `capture()` flow so the ledger
   * entries are posted exactly the same way as in the simulated path.
   */
  async handleProviderCallback(
    providerKey: ProviderKey,
    bookingId: string,
  ): Promise<{ status: 'success' | 'failed' | 'pending' }> {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { bookingId },
    });
    if (!intent) {
      throw new NotFoundException(
        `Payment intent not found for booking ${bookingId}`,
      );
    }

    // Already settled — nothing more to do
    if (intent.status === 'captured') return { status: 'success' };

    if (!intent.providerRef || intent.provider !== providerKey) {
      this.logger.warn(
        `Callback for booking ${bookingId} but no matching provider ref`,
      );
      return { status: 'failed' };
    }

    const provider = this.providerRegistry.get(providerKey);
    const providerStatus = await provider.verifyPayment(intent.providerRef);

    if (providerStatus === 'success') {
      await this.capture(bookingId);
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { paidAt: new Date() },
      });
      this.logger.log(`Provider ${providerKey} confirmed payment for ${bookingId}`);
      return { status: 'success' };
    }

    if (providerStatus === 'failed' || providerStatus === 'cancelled') {
      this.logger.log(
        `Provider ${providerKey} reports ${providerStatus} for ${bookingId}`,
      );
      return { status: 'failed' };
    }

    return { status: 'pending' };
  }

  /** Which real-money providers are usable in this deployment. */
  availableProviders(): ProviderKey[] {
    return this.providerRegistry.available();
  }

  /**
   * Create a payment intent for a booking
   * Called automatically when booking is created
   */
  async createForBooking(bookingId: string): Promise<PaymentIntent> {
    const booking = await this.bookingsService.findOne(bookingId);

    // Check if payment intent already exists
    const existing = await this.prisma.paymentIntent.findUnique({
      where: { bookingId },
    });

    if (existing) {
      return existing;
    }

    const totalPrice =
      typeof booking.totalPrice === 'number'
        ? booking.totalPrice
        : Number(booking.totalPrice);

    return this.prisma.paymentIntent.create({
      data: {
        bookingId,
        renterId: booking.renterId,
        hostId: booking.hostId,
        amount: totalPrice,
        currency: 'TND',
        status: 'created',
      },
    });
  }

  /**
   * Authorize payment (renter authorizes payment)
   * Only renter can authorize
   */
  async authorize(
    bookingId: string,
    userId: string,
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    return await this.prisma.$transaction(async (tx) => {
      // Load payment intent with lock
      const paymentIntents = await tx.$queryRaw<PaymentIntent[]>`
        SELECT * FROM payment_intents
        WHERE "bookingId"::text = ${bookingId}
        FOR UPDATE
      `;

      if (!paymentIntents || paymentIntents.length === 0) {
        throw new NotFoundException(
          `Payment intent not found for booking ${bookingId}`,
        );
      }

      const paymentIntent = paymentIntents[0];

      // Authorization check
      if (paymentIntent.renterId !== userId) {
        throw new ForbiddenException(
          'Only the renter can authorize this payment',
        );
      }

      // Idempotent check
      if (paymentIntent.status === 'authorized') {
        return paymentIntent;
      }

      // State machine validation
      PaymentStateMachine.validateTransition(
        paymentIntent.status as any,
        'authorized',
        'authorize payment',
      );

      // Update status
      return tx.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: {
          status: 'authorized',
          metadata: metadata
            ? { ...(paymentIntent.metadata as any), ...metadata }
            : paymentIntent.metadata,
        },
      });
    });
  }

  /**
   * Capture payment (system captures authorized payment)
   * Only system can capture (no userId required)
   * This is called when booking moves to PAID status
   * Also posts 3 ledger entries atomically in the same transaction.
   */
  async capture(bookingId: string): Promise<PaymentIntent> {
    return await this.prisma.$transaction(async (tx) => {
      // Load payment intent with lock
      const paymentIntents = await tx.$queryRaw<PaymentIntent[]>`
        SELECT * FROM payment_intents
        WHERE "bookingId"::text = ${bookingId}
        FOR UPDATE
      `;

      if (!paymentIntents || paymentIntents.length === 0) {
        throw new NotFoundException(
          `Payment intent not found for booking ${bookingId}`,
        );
      }

      const paymentIntent = paymentIntents[0];

      // Idempotent check
      if (paymentIntent.status === 'captured') {
        return paymentIntent;
      }

      // State machine validation
      PaymentStateMachine.validateTransition(
        paymentIntent.status as any,
        'captured',
        'capture payment',
      );

      // Update status
      const updated = await tx.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: { status: 'captured' },
      });

      // Load booking for commission rate
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
      });

      const commissionRate = booking.snapshotCommissionRate
        ? Number(booking.snapshotCommissionRate)
        : this.defaultCommissionRate;

      // Post 3 ledger entries atomically (idempotent by design)
      await this.ledgerService.postCapture(
        paymentIntent.id,
        bookingId,
        Number(paymentIntent.amount),
        commissionRate,
        tx,
      );

      return updated;
    });
  }

  /**
   * Refund payment
   * Can only refund captured payments
   * Policy validation ensures refunds follow cancellation rules
   * Also reverses ledger entries atomically.
   */
  async refund(bookingId: string): Promise<PaymentIntent> {
    return await this.prisma.$transaction(async (tx) => {
      // Load payment intent with lock
      const paymentIntents = await tx.$queryRaw<PaymentIntent[]>`
        SELECT * FROM payment_intents
        WHERE "bookingId"::text = ${bookingId}
        FOR UPDATE
      `;

      if (!paymentIntents || paymentIntents.length === 0) {
        throw new NotFoundException(
          `Payment intent not found for booking ${bookingId}`,
        );
      }

      const paymentIntent = paymentIntents[0];

      // Idempotent check
      if (paymentIntent.status === 'refunded') {
        return paymentIntent;
      }

      // Policy validation: Refunds only allowed if payment is CAPTURED
      if (
        !this.cancellationPolicyService.canRefund(paymentIntent.status as any)
      ) {
        throw new BadRequestException(
          `Cannot refund payment: Payment status is ${paymentIntent.status}. ` +
            `Only CAPTURED payments can be refunded.`,
        );
      }

      // ── Refund Guardrail v1 ──────────────────────────────────────────────
      // Check whether a HOST_PAYOUT ledger entry exists for this booking,
      // which means the host has already been paid out for it.
      // Design choice: BLOCK the refund rather than allow a negative balance.
      // Rationale: silently creating platform loss (paying out a host then
      // also refunding the renter without recovering the host payout) violates
      // financial integrity. An explicit error forces admins to reconcile
      // manually (e.g. clawback from host, platform absorbs loss, etc.).
      const existingPayout = await tx.ledgerEntry.findFirst({
        where: {
          bookingId,
          type: 'HOST_PAYOUT',
          status: 'POSTED',
        },
      });

      if (existingPayout) {
        throw new BadRequestException(
          JSON.stringify({
            code: 'REFUND_AFTER_PAYOUT_NOT_ALLOWED',
            message:
              'Cannot refund: the host payout for this booking has already been ' +
              'marked as PAID. Refunding now would create a platform loss. ' +
              'Please reconcile manually (clawback from host or absorb loss) ' +
              'before issuing a refund.',
            payoutLedgerEntryId: existingPayout.id,
            bookingId,
          }),
        );
      }
      // ── End Refund Guardrail ─────────────────────────────────────────────

      // State machine validation
      PaymentStateMachine.validateTransition(
        paymentIntent.status as any,
        'refunded',
        'refund payment',
      );

      // Update status
      const updated = await tx.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: { status: 'refunded' },
      });

      // Reverse ledger entries atomically (idempotent by design)
      await this.ledgerService.postRefund(paymentIntent.id, bookingId, tx);

      return updated;
    });
  }

  /**
   * Cancel payment intent
   * Can only cancel authorized payments (before capture)
   */
  async cancel(bookingId: string, userId: string): Promise<PaymentIntent> {
    return await this.prisma.$transaction(async (tx) => {
      // Load payment intent with lock
      const paymentIntents = await tx.$queryRaw<PaymentIntent[]>`
        SELECT * FROM payment_intents
        WHERE "bookingId"::text = ${bookingId}
        FOR UPDATE
      `;

      if (!paymentIntents || paymentIntents.length === 0) {
        throw new NotFoundException(
          `Payment intent not found for booking ${bookingId}`,
        );
      }

      const paymentIntent = paymentIntents[0];

      // Authorization check - renter or host can cancel
      if (
        paymentIntent.renterId !== userId &&
        paymentIntent.hostId !== userId
      ) {
        throw new ForbiddenException(
          'Only the renter or host can cancel this payment intent',
        );
      }

      // Idempotent check
      if (paymentIntent.status === 'cancelled') {
        return paymentIntent;
      }

      // State machine validation
      PaymentStateMachine.validateTransition(
        paymentIntent.status as any,
        'cancelled',
        'cancel payment intent',
      );

      // Update status
      return tx.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: { status: 'cancelled' },
      });
    });
  }

  /**
   * Get payment intent for a booking
   */
  async findByBooking(bookingId: string): Promise<PaymentIntent | null> {
    return this.prisma.paymentIntent.findUnique({
      where: { bookingId },
      include: {
        renter: true,
        host: true,
      },
    });
  }

  /**
   * Get payment intent by ID
   */
  async findOne(id: string): Promise<PaymentIntent> {
    const paymentIntent = await this.prisma.paymentIntent.findUnique({
      where: { id },
      include: {
        renter: true,
        host: true,
        booking: true,
      },
    });

    if (!paymentIntent) {
      throw new NotFoundException(`Payment intent with ID ${id} not found`);
    }

    return paymentIntent;
  }
}
