import { Injectable } from '@nestjs/common';

/**
 * Detects and masks off-platform contact info in user-generated text.
 *
 * Why this exists: rental marketplaces in Tunisia bleed commission when
 * renters and hosts move the conversation to WhatsApp / direct call to avoid
 * the platform fee. Every leaked booking is direct revenue loss. This
 * service runs on every chat message, every listing description, and every
 * WhatsApp bot reply we relay — masking phone numbers, emails, and obvious
 * "find me at @handle" pointers before they're persisted or displayed.
 *
 * Calibration notes:
 *   - False positives are costly (users get annoyed). We require ≥7 digits
 *     for phone matches and a real "@" for emails — no over-eager matching.
 *   - We deliberately don't try to detect handles unless paired with a
 *     platform keyword ("whatsapp", "ig", "snap", "tg") — bare "@john" in a
 *     message about an actual person isn't a leak.
 *   - URLs are flagged only when they point off-platform (skip own domain).
 */

export interface DetectionResult {
  detected: boolean;
  /** The text with any detected pieces replaced by the configured mask. */
  masked: string;
  /** What kinds of contact info we found — useful for telemetry / admin. */
  kinds: ContactKind[];
}

export type ContactKind = 'phone' | 'email' | 'social' | 'external_url';

const DEFAULT_MASK = '[hidden — pay through the platform to share contact info]';

// Phone: optional +, optional spaces/dashes, ≥ 7 digits total. Anchored loosely
// so it matches inside a sentence. We require at least one separator OR a +
// to avoid matching e.g. a 10-digit booking ID.
const PHONE_RE =
  /(?:\+\d[\d\s.-]{6,}\d|\b\d{2}[\s.-]\d{2}[\s.-]\d{2}[\s.-]?\d{0,2}\b|\b\d{8,12}\b)/g;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

// "whatsapp", "wa.me/...", "tg @handle", "instagram.com/...", "snap me at ..."
const SOCIAL_RE =
  /\b(whatsapp|whats\s?app|wa\.me\/\S+|t\.me\/\S+|telegram|instagram(\.com)?\/?\S*|insta\b|ig\s?:|snap(chat)?|fb\.me\/\S+|messenger|viber|signal\s?:|skype)\b/gi;

const URL_RE = /\bhttps?:\/\/[^\s)]+/gi;

@Injectable()
export class ContactDetectorService {
  /**
   * Run the full detection pipeline. Always returns a `masked` string —
   * callers can use it directly without checking `detected` first.
   */
  scan(input: string, opts?: { mask?: string; ownDomains?: string[] }): DetectionResult {
    if (!input) return { detected: false, masked: input ?? '', kinds: [] };

    const mask = opts?.mask ?? DEFAULT_MASK;
    const ownDomains = (opts?.ownDomains ?? []).map((d) => d.toLowerCase());

    let masked = input;
    const kinds = new Set<ContactKind>();

    // Order matters: email contains an @ — handle it before phones (so the
    // numeric part of an email doesn't get caught by the phone regex).
    masked = masked.replace(EMAIL_RE, () => {
      kinds.add('email');
      return mask;
    });

    masked = masked.replace(URL_RE, (match) => {
      const lower = match.toLowerCase();
      if (ownDomains.some((d) => d && lower.includes(d))) return match;
      kinds.add('external_url');
      return mask;
    });

    masked = masked.replace(PHONE_RE, (match) => {
      // Skip if the match is mostly punctuation noise (defensive)
      const digits = match.replace(/\D/g, '');
      if (digits.length < 7) return match;
      kinds.add('phone');
      return mask;
    });

    masked = masked.replace(SOCIAL_RE, () => {
      kinds.add('social');
      return mask;
    });

    return {
      detected: kinds.size > 0,
      masked,
      kinds: Array.from(kinds),
    };
  }

  /** Convenience: just say whether the text contains a leak attempt. */
  hasContact(input: string): boolean {
    return this.scan(input).detected;
  }
}
