/**
 * Client-side mirror of the backend ContactDetectorService — same regexes,
 * same semantics. Used to warn the user *before* they send a chat message
 * that contains contact info. The backend still has the final say (it
 * re-runs and masks server-side), this is just for UX.
 *
 * Keep the patterns in sync with src/common/anti-leak/contact-detector.service.ts.
 */

export type ContactKind = 'phone' | 'email' | 'social' | 'external_url';

const PHONE_RE =
  /(?:\+\d[\d\s.-]{6,}\d|\b\d{2}[\s.-]\d{2}[\s.-]\d{2}[\s.-]?\d{0,2}\b|\b\d{8,12}\b)/g;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const SOCIAL_RE =
  /\b(whatsapp|whats\s?app|wa\.me\/\S+|t\.me\/\S+|telegram|instagram(\.com)?\/?\S*|insta\b|ig\s?:|snap(chat)?|fb\.me\/\S+|messenger|viber|signal\s?:|skype)\b/gi;
const URL_RE = /\bhttps?:\/\/[^\s)]+/gi;

export function detectContact(input: string): {
  detected: boolean;
  kinds: ContactKind[];
} {
  if (!input) return { detected: false, kinds: [] };
  const kinds = new Set<ContactKind>();
  if (EMAIL_RE.test(input)) kinds.add('email');
  if (URL_RE.test(input)) kinds.add('external_url');
  if (PHONE_RE.test(input)) kinds.add('phone');
  if (SOCIAL_RE.test(input)) kinds.add('social');
  // Reset lastIndex on stateful /g regexes
  PHONE_RE.lastIndex = 0;
  EMAIL_RE.lastIndex = 0;
  SOCIAL_RE.lastIndex = 0;
  URL_RE.lastIndex = 0;
  return { detected: kinds.size > 0, kinds: Array.from(kinds) };
}
