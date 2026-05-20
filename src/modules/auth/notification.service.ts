import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type NotificationChannel = 'email' | 'phone';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendVerificationCode(
    channel: NotificationChannel,
    destination: string,
    code: string,
  ): Promise<void> {
    if (channel === 'email') {
      await this.sendEmail(destination, code);
    } else {
      await this.sendSms(destination, code);
    }
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const resendKey = this.configService.get<string>('RESEND_API_KEY');
    if (!resendKey?.trim()) {
      this.logger.warn(
        `[DEV] Password reset link for ${to}: ${resetUrl} (set RESEND_API_KEY to send real emails)`,
      );
      return;
    }

    const from = this.configService.get<string>('VERIFY_FROM_EMAIL', 'noreply@renteverything.app');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: 'Reset your RentEverything password',
        html:
          `<p>We received a request to reset your password.</p>` +
          `<p><a href="${resetUrl}" style="display:inline-block;background:#0284c7;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a></p>` +
          `<p style="font-size:12px;color:#666">Or paste this link into your browser:<br/><span style="word-break:break-all">${resetUrl}</span></p>` +
          `<p style="font-size:12px;color:#666">This link expires in 1 hour. If you didn't ask for this, you can ignore this email.</p>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Resend password-reset email failed (${response.status}): ${body}`);
      throw new Error('Failed to send password reset email');
    }
  }

  async sendPasswordResetUnavailableEmail(to: string): Promise<void> {
    const resendKey = this.configService.get<string>('RESEND_API_KEY');
    if (!resendKey?.trim()) {
      this.logger.warn(
        `[DEV] Password reset attempted for OAuth-only account ${to} — would inform them to use Google sign-in`,
      );
      return;
    }

    const from = this.configService.get<string>('VERIFY_FROM_EMAIL', 'noreply@renteverything.app');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: 'About your RentEverything account',
        html:
          `<p>Someone (hopefully you) asked to reset the password on this account.</p>` +
          `<p>This account was created with <strong>Continue with Google</strong> and doesn't have a password to reset. ` +
          `Just use the "Continue with Google" button on the login page to sign in.</p>` +
          `<p style="font-size:12px;color:#666">If this wasn't you, no action is needed.</p>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Resend OAuth-only notice email failed (${response.status}): ${body}`);
    }
  }

  private async sendEmail(to: string, code: string): Promise<void> {
    const resendKey = this.configService.get<string>('RESEND_API_KEY');
    if (!resendKey?.trim()) {
      this.logger.warn(
        `[DEV] Email verification code for ${to}: ${code} (set RESEND_API_KEY to send real emails)`,
      );
      return;
    }

    const from = this.configService.get<string>('VERIFY_FROM_EMAIL', 'noreply@renteverything.app');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: 'Your RentEverything verification code',
        html: `<p>Your verification code is <strong style="font-size:24px;letter-spacing:4px">${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Resend email failed (${response.status}): ${body}`);
      throw new Error('Failed to send verification email');
    }
  }

  private async sendSms(to: string, code: string): Promise<void> {
    const sid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.configService.get<string>('TWILIO_FROM_NUMBER');

    if (!sid?.trim() || !token?.trim() || !from?.trim()) {
      this.logger.warn(
        `[DEV] SMS verification code for ${to}: ${code} (set TWILIO_* env vars to send real SMS)`,
      );
      return;
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const body = new URLSearchParams({
      To: to,
      From: from,
      Body: `Your RentEverything verification code is ${code}. Expires in 10 minutes.`,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`Twilio SMS failed (${response.status}): ${text}`);
      throw new Error('Failed to send verification SMS');
    }
  }
}
