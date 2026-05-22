import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Minimal Twilio WhatsApp Business client — sends a single text message.
 *
 * In dev (no `TWILIO_*` env vars set), we log instead of calling Twilio so
 * the rest of the flow can be exercised end-to-end without a live account.
 * Same pattern as NotificationService.
 *
 * Required env:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM   - e.g. "whatsapp:+14155238886" (Twilio sandbox)
 */
@Injectable()
export class TwilioWhatsappClient {
  private readonly logger = new Logger(TwilioWhatsappClient.name);

  constructor(private readonly configService: ConfigService) {}

  private get sid() {
    return this.configService.get<string>('TWILIO_ACCOUNT_SID');
  }
  private get token() {
    return this.configService.get<string>('TWILIO_AUTH_TOKEN');
  }
  private get from() {
    return this.configService.get<string>('TWILIO_WHATSAPP_FROM');
  }

  isConfigured(): boolean {
    return Boolean(this.sid?.trim()) && Boolean(this.token?.trim()) && Boolean(this.from?.trim());
  }

  /**
   * Send a WhatsApp text message. `to` accepts either "+216..." (we'll prefix
   * "whatsapp:") or the already-prefixed "whatsapp:+216..." form.
   */
  async send(to: string, body: string): Promise<void> {
    const target = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

    if (!this.isConfigured()) {
      this.logger.warn(
        `[DEV] WhatsApp → ${target}: ${body.slice(0, 200)}${body.length > 200 ? '…' : ''}`,
      );
      return;
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.sid}/Messages.json`;
    const params = new URLSearchParams({
      To: target,
      From: this.from!,
      Body: body,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${this.sid}:${this.token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`Twilio WhatsApp send failed (${response.status}): ${text}`);
      throw new Error('Failed to send WhatsApp message');
    }
  }
}
