import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AiSearchService } from '../ai/ai-search.service';
import { TwilioWhatsappClient } from './twilio-whatsapp.client';
import { ContactDetectorService } from '../../common/anti-leak/contact-detector.service';

const MAX_RESULTS_PER_REPLY = 3;
const RATE_LIMIT_PER_MINUTE = 10;

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiSearch: AiSearchService,
    private readonly client: TwilioWhatsappClient,
    private readonly configService: ConfigService,
    private readonly contactDetector: ContactDetectorService,
  ) {}

  /**
   * Handle a single inbound WhatsApp message. The Twilio webhook fires this
   * with `from` set to "whatsapp:+216XXX" and `body` set to the user's text.
   *
   * Flow:
   *   1. Normalise the phone, find/create the conversation row.
   *   2. Decide intent:
   *      - Numeric reply ("2") + prior results → "tell me about option N".
   *      - "stop"/"help"/"reset" → housekeeping.
   *      - Anything else → run through AI search.
   *   3. Send a reply. Errors are caught — we always send *something* back.
   */
  async handleIncoming(from: string, body: string): Promise<void> {
    const phone = this.normalisePhone(from);
    const text = (body ?? '').trim();
    if (!phone || !text) return;

    let convo = await this.prisma.whatsappConversation.findUnique({
      where: { phoneNumber: phone },
    });

    if (!convo) {
      // Try to attach the conversation to a registered user with this phone.
      const user = await this.prisma.user.findUnique({ where: { phone } });
      convo = await this.prisma.whatsappConversation.create({
        data: {
          phoneNumber: phone,
          userId: user?.id ?? null,
        },
      });
    }

    // Soft rate-limit: a misbehaving user shouldn't be able to burn Gemini
    // tokens or Twilio messages without bound.
    if (await this.isRateLimited(convo.id)) {
      await this.safeSend(phone, "You're sending messages too fast. Please wait a minute and try again.");
      return;
    }

    await this.prisma.whatsappConversation.update({
      where: { id: convo.id },
      data: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
    });

    const lower = text.toLowerCase();

    if (lower === 'stop' || lower === 'unsubscribe') {
      await this.safeSend(phone, "You're unsubscribed. Send any message to resume.");
      return;
    }

    if (lower === 'help' || lower === 'aide' || lower === '?') {
      await this.safeSend(phone, this.helpText());
      return;
    }

    if (lower === 'reset' || lower === 'restart') {
      await this.prisma.whatsappConversation.update({
        where: { id: convo.id },
        data: { lastQuery: null, lastResultIds: [], lastFilters: null as any },
      });
      await this.safeSend(phone, 'Cleared. What are you looking for?');
      return;
    }

    // Numeric pick? "1" / "2" / "3" → details of that prior option
    const picked = this.parsePick(text);
    if (picked !== null && convo.lastResultIds.length >= picked + 1) {
      await this.handlePick(phone, convo.lastResultIds[picked]);
      return;
    }

    // Otherwise treat as a new search query.
    await this.handleSearch(phone, convo.id, text);
  }

  // ─── Intent handlers ──────────────────────────────────────────────────

  private async handleSearch(phone: string, convoId: string, query: string) {
    let reply: string;
    let resultIds: string[] = [];

    try {
      const result = await this.aiSearch.search({ query });

      if (result.mode === 'FOLLOW_UP') {
        const fu = result.followUp;
        const question = fu?.question ?? 'Could you tell me a bit more?';
        const options = Array.isArray(fu?.options) ? fu.options.slice(0, 4) : [];
        const optionsBlock = options.length
          ? '\n' + options.map((o: any, i: number) => `  ${i + 1}. ${o.label ?? o}`).join('\n')
          : '';
        reply = `${question}${optionsBlock}\n\nReply with the number or just type your answer.`;
      } else {
        const items = (result.results ?? []).slice(0, MAX_RESULTS_PER_REPLY);
        resultIds = items.map((r: any) => r.id).filter(Boolean);

        if (items.length === 0) {
          reply =
            (result.summary ?? "I didn't find a match.") +
            '\n\nTry: "villa in Hammamet under 200 TND" or "padel court Sousse Saturday afternoon".';
        } else {
          reply =
            (result.summary ? result.summary + '\n\n' : '') +
            items
              .map((r: any, i: number) => this.formatListingLine(i + 1, r))
              .join('\n\n') +
            '\n\nReply with a number for details and booking link.';
        }
      }
    } catch (err: any) {
      this.logger.error(`AI search failed for "${query}": ${err?.message ?? err}`);
      reply =
        "Sorry — I couldn't search just now. Try rephrasing, or browse the app: " +
        this.frontendUrl();
    }

    await this.prisma.whatsappConversation.update({
      where: { id: convoId },
      data: { lastQuery: query, lastResultIds: resultIds },
    });

    await this.safeSend(phone, reply);
  }

  private async handlePick(phone: string, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { host: { select: { name: true } } },
    });
    if (!listing) {
      await this.safeSend(phone, "That listing is no longer available. Try a new search.");
      return;
    }

    const bookingUrl = `${this.frontendUrl()}/listing/${listing.id}`;
    const price = Number(listing.pricePerDay).toFixed(0);
    const reply =
      `*${listing.title}*\n` +
      `${listing.host?.name ? 'Hosted by ' + listing.host.name + ' · ' : ''}${price} TND/day\n\n` +
      this.truncate(listing.description, 280) +
      `\n\n📍 ${listing.address}\n\n` +
      `👉 Book now: ${bookingUrl}\n\n` +
      `(Paying through RentEverything is the only way your booking is protected — never pay outside the app.)`;

    await this.safeSend(phone, reply);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async isRateLimited(convoId: string): Promise<boolean> {
    const oneMinAgo = new Date(Date.now() - 60 * 1000);
    const recent = await this.prisma.whatsappConversation.findUnique({
      where: { id: convoId },
      select: { messageCount: true, lastMessageAt: true },
    });
    if (!recent) return false;
    // Cheap heuristic: if they've sent > N messages and the *last* one was
    // within the minute, throttle. Not exact but sufficient — Twilio rate
    // limits also kick in as a hard backstop.
    return (
      recent.messageCount >= RATE_LIMIT_PER_MINUTE &&
      recent.lastMessageAt > oneMinAgo &&
      recent.messageCount % RATE_LIMIT_PER_MINUTE === 0
    );
  }

  private formatListingLine(index: number, r: any): string {
    const price = r.pricePerDay ? `${Number(r.pricePerDay).toFixed(0)} TND/d` : '';
    const city = r.address ? this.shortAddress(r.address) : '';
    const rating = r.ratingAvg && Number(r.ratingAvg) > 0
      ? ` ⭐ ${Number(r.ratingAvg).toFixed(1)}`
      : '';
    const parts = [r.title, city, price].filter(Boolean).join(' · ');
    return `${index}. ${parts}${rating}`;
  }

  private shortAddress(addr: string): string {
    // Last comma-separated chunk is usually the city.
    const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
    return parts[parts.length - 1] ?? addr;
  }

  private truncate(s: string | null | undefined, n: number): string {
    if (!s) return '';
    return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  }

  private parsePick(text: string): number | null {
    const trimmed = text.trim();
    if (/^[1-9]$/.test(trimmed)) return Number(trimmed) - 1;
    // Tolerant: "the 2nd one", "yes 2", "option 3", "#2"
    const m = trimmed.match(/[#]?\s?([1-9])(?:st|nd|rd|th)?/);
    if (m) return Number(m[1]) - 1;
    return null;
  }

  private normalisePhone(from: string): string | null {
    if (!from) return null;
    const stripped = from.replace(/^whatsapp:/i, '').trim();
    if (!stripped.startsWith('+')) return null;
    return stripped;
  }

  private frontendUrl(): string {
    return this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
  }

  private helpText(): string {
    return (
      'Hi! Tell me what you want to rent in plain words.\n\n' +
      'Examples:\n' +
      '• "villa in Hammamet under 200 TND this weekend"\n' +
      '• "padel court Sousse Saturday afternoon"\n' +
      '• "jet ski Tunis tomorrow"\n\n' +
      'Then reply with a number to see details and book.\n\n' +
      'Commands: *help* · *reset* · *stop*'
    );
  }

  private async safeSend(phone: string, body: string): Promise<void> {
    // Defensive: if a listing description ever contains a phone number / email
    // (host trying to circumvent the platform), strip it before relaying via
    // the bot. Same protection the chat module applies.
    const cleaned = this.contactDetector.scan(body, {
      ownDomains: [this.frontendUrl().replace(/^https?:\/\//, '')],
    }).masked;
    try {
      await this.client.send(phone, cleaned);
    } catch (err: any) {
      this.logger.error(`WhatsApp send failed for ${phone}: ${err?.message ?? err}`);
    }
  }
}
