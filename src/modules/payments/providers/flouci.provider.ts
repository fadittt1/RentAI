import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreatePaymentInput,
  CreatePaymentOutput,
  PaymentProvider,
  ProviderKey,
  ProviderPaymentStatus,
} from './payment-provider.interface';

/**
 * Flouci payment gateway integration.
 *
 * Docs: https://developer.flouci.com/
 *
 * Required env:
 *   FLOUCI_APP_TOKEN   - Public key
 *   FLOUCI_APP_SECRET  - Secret key
 *   FLOUCI_BASE_URL    - https://developers.flouci.com (prod) or the sandbox URL
 *
 * Flouci expects amounts in **millimes** (1 TND = 1000 millimes). We accept TND
 * units everywhere else in the codebase and convert at the edge so the rest of
 * the system stays in human-readable amounts.
 */
@Injectable()
export class FlouciProvider implements PaymentProvider {
  readonly key: ProviderKey = 'flouci';
  private readonly logger = new Logger(FlouciProvider.name);

  constructor(private readonly configService: ConfigService) {}

  private get appToken(): string | undefined {
    return this.configService.get<string>('FLOUCI_APP_TOKEN');
  }

  private get appSecret(): string | undefined {
    return this.configService.get<string>('FLOUCI_APP_SECRET');
  }

  private get baseUrl(): string {
    return (
      this.configService.get<string>('FLOUCI_BASE_URL') ??
      'https://developers.flouci.com'
    );
  }

  isConfigured(): boolean {
    return Boolean(this.appToken?.trim()) && Boolean(this.appSecret?.trim());
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentOutput> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Flouci is not configured on this server',
      );
    }

    const amountInMillimes = Math.round(input.amount * 1000);

    const response = await fetch(`${this.baseUrl}/api/generate_payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_token: this.appToken,
        app_secret: this.appSecret,
        amount: String(amountInMillimes),
        accept_card: 'true',
        session_timeout_secs: 1200,
        success_link: input.successUrl,
        fail_link: input.failUrl,
        developer_tracking_id: input.reference,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`Flouci generate_payment failed (${response.status}): ${text}`);
      throw new ServiceUnavailableException(
        'Could not contact the payment provider. Please try again.',
      );
    }

    const data = (await response.json()) as {
      result?: { success?: boolean; link?: string; payment_id?: string };
    };

    if (!data?.result?.success || !data.result.link || !data.result.payment_id) {
      this.logger.error(`Flouci returned an unexpected payload: ${JSON.stringify(data)}`);
      throw new ServiceUnavailableException('Payment provider returned an invalid response.');
    }

    return {
      providerRef: data.result.payment_id,
      redirectUrl: data.result.link,
    };
  }

  async verifyPayment(providerRef: string): Promise<ProviderPaymentStatus> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Flouci is not configured on this server',
      );
    }

    const response = await fetch(
      `${this.baseUrl}/api/verify_payment/${encodeURIComponent(providerRef)}`,
      {
        method: 'GET',
        headers: {
          apppublic: this.appToken!,
          appsecret: this.appSecret!,
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`Flouci verify_payment failed (${response.status}): ${text}`);
      // Don't mark as failed — a transient 5xx shouldn't kill a successful payment.
      // Treat as pending so the user can be redirected to retry later.
      return 'pending';
    }

    const data = (await response.json()) as {
      result?: { status?: string; success?: boolean };
    };

    const status = data?.result?.status?.toUpperCase();
    const success = data?.result?.success === true;

    if (success && status === 'SUCCESS') return 'success';
    if (status === 'FAILED') return 'failed';
    if (status === 'PENDING') return 'pending';

    this.logger.warn(`Flouci returned unknown status ${status} for ${providerRef}`);
    return 'failed';
  }
}
