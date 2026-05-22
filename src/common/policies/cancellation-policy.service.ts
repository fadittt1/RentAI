import { Injectable } from '@nestjs/common';
import { BookingStatus, CancellationPolicy, PaymentIntentStatus } from '@prisma/client';

export type CancellationActor = 'RENTER' | 'HOST';

/**
 * Refund schedule per cancellation policy, evaluated by hours-before-start.
 * The renter-cancels-before-start branch consults this table.
 *
 * Reading: STRICT means 50% refund up to 7 days out, zero after that. The
 * cutoff at 999999 hours is a sentinel for "any time before start".
 */
export const CANCELLATION_POLICY_RULES: Record<
  CancellationPolicy,
  { hoursBeforeStart: number; refundPct: number; label: string }[]
> = {
  FLEXIBLE: [
    { hoursBeforeStart: 24, refundPct: 1.0, label: 'Up to 24h before start' },
    { hoursBeforeStart: 0, refundPct: 0.0, label: 'After that' },
  ],
  MODERATE: [
    { hoursBeforeStart: 24 * 5, refundPct: 1.0, label: 'Up to 5 days before start' },
    { hoursBeforeStart: 24, refundPct: 0.5, label: 'Up to 24h before start' },
    { hoursBeforeStart: 0, refundPct: 0.0, label: 'After that' },
  ],
  STRICT: [
    { hoursBeforeStart: 24 * 7, refundPct: 0.5, label: 'Up to 7 days before start' },
    { hoursBeforeStart: 0, refundPct: 0.0, label: 'After that' },
  ],
};

export interface CancellationDecision {
  allowCancel: boolean;
  refundAmount: number;
  refundType: 'FULL' | 'PARTIAL' | 'NONE';
  penaltyApplied: boolean;
  reason: string;
}

export interface CancellationContext {
  actor: CancellationActor;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentIntentStatus;
  startDate: Date;
  endDate: Date;
  totalPrice: number;
  now: Date;
  /** Host-chosen policy on the listing. Defaults to MODERATE for legacy callers. */
  policy?: CancellationPolicy;
}

@Injectable()
export class CancellationPolicyService {
  /**
   * Evaluate cancellation request and return policy decision
   * This is the single source of truth for cancellation rules
   */
  evaluateCancellation(context: CancellationContext): CancellationDecision {
    const {
      actor,
      bookingStatus,
      paymentStatus,
      startDate,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      endDate, // Reserved for future policy rules (e.g., partial refunds based on days)
      totalPrice,
      now,
    } = context;

    // Rule 1: COMPLETED bookings cannot be cancelled
    if (bookingStatus === 'completed') {
      return {
        allowCancel: false,
        refundAmount: 0,
        refundType: 'NONE',
        penaltyApplied: false,
        reason: 'Cannot cancel a completed booking',
      };
    }

    // Rule 2: Already CANCELLED bookings (idempotent check)
    if (bookingStatus === 'cancelled') {
      // If payment is already refunded, mention that
      if (paymentStatus === 'refunded') {
        return {
          allowCancel: true,
          refundAmount: 0,
          refundType: 'NONE',
          penaltyApplied: false,
          reason: 'Payment already refunded',
        };
      }
      return {
        allowCancel: true,
        refundAmount: 0,
        refundType: 'NONE',
        penaltyApplied: false,
        reason: 'Booking is already cancelled',
      };
    }

    // Rule 3: Host cancels at any time → FULL refund (if payment captured)
    if (actor === 'HOST') {
      if (paymentStatus === 'captured') {
        return {
          allowCancel: true,
          refundAmount: totalPrice,
          refundType: 'FULL',
          penaltyApplied: false,
          reason: 'Host cancellation: Full refund required',
        };
      } else if (paymentStatus === 'refunded') {
        return {
          allowCancel: true,
          refundAmount: 0,
          refundType: 'NONE',
          penaltyApplied: false,
          reason: 'Payment already refunded',
        };
      } else {
        // Payment not captured yet, no refund needed
        return {
          allowCancel: true,
          refundAmount: 0,
          refundType: 'NONE',
          penaltyApplied: false,
          reason: 'Host cancellation: No payment captured to refund',
        };
      }
    }

    // Rule 4: Renter cancels before start date → refund follows the listing's
    // policy (FLEXIBLE / MODERATE / STRICT). Legacy bookings without a policy
    // get full refund (the old behaviour).
    if (actor === 'RENTER') {
      const isBeforeStart = now < startDate;

      if (isBeforeStart) {
        if (paymentStatus === 'captured') {
          const policy = context.policy ?? 'FLEXIBLE';
          const refundPct = this.refundPctForPolicy(policy, startDate, now);
          const refundAmount = Math.round(totalPrice * refundPct * 100) / 100;
          if (refundPct >= 1) {
            return {
              allowCancel: true,
              refundAmount,
              refundType: 'FULL',
              penaltyApplied: false,
              reason: `Renter cancellation before start (${policy}): Full refund`,
            };
          }
          if (refundPct > 0) {
            return {
              allowCancel: true,
              refundAmount,
              refundType: 'PARTIAL',
              penaltyApplied: true,
              reason: `Renter cancellation before start (${policy}): ${Math.round(refundPct * 100)}% refund`,
            };
          }
          return {
            allowCancel: true,
            refundAmount: 0,
            refundType: 'NONE',
            penaltyApplied: true,
            reason: `Renter cancellation too close to start (${policy}): No refund`,
          };
        } else if (paymentStatus === 'refunded') {
          return {
            allowCancel: true,
            refundAmount: 0,
            refundType: 'NONE',
            penaltyApplied: false,
            reason: 'Payment already refunded',
          };
        } else {
          // Payment not captured yet
          return {
            allowCancel: true,
            refundAmount: 0,
            refundType: 'NONE',
            penaltyApplied: false,
            reason:
              'Renter cancellation before start: No payment captured to refund',
          };
        }
      } else {
        // Rule 5: Renter cancels after start date → NO refund
        return {
          allowCancel: false,
          refundAmount: 0,
          refundType: 'NONE',
          penaltyApplied: true,
          reason: 'Renter cancellation after start date: No refund allowed',
        };
      }
    }

    // Fallback (should not reach here)
    return {
      allowCancel: false,
      refundAmount: 0,
      refundType: 'NONE',
      penaltyApplied: false,
      reason: 'Cancellation not allowed for this scenario',
    };
  }

  /**
   * Check if refund is allowed based on payment status
   * Refunds only allowed if payment is CAPTURED
   */
  canRefund(paymentStatus: PaymentIntentStatus): boolean {
    return paymentStatus === 'captured';
  }

  /**
   * Check if cancellation is allowed based on booking status
   */
  canCancel(bookingStatus: BookingStatus): boolean {
    return (
      bookingStatus === 'pending' ||
      bookingStatus === 'confirmed' ||
      bookingStatus === 'paid'
    );
  }

  /**
   * Look up the refund percentage for a given policy + (now - startDate) gap.
   * Returns the first matching rule, top-down — rules are ordered most-generous
   * first, so the first hit is the highest refund the renter qualifies for.
   */
  private refundPctForPolicy(
    policy: CancellationPolicy,
    startDate: Date,
    now: Date,
  ): number {
    const hoursOut = Math.max(
      0,
      (startDate.getTime() - now.getTime()) / (1000 * 60 * 60),
    );
    for (const rule of CANCELLATION_POLICY_RULES[policy]) {
      if (hoursOut >= rule.hoursBeforeStart) return rule.refundPct;
    }
    return 0;
  }
}
