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
 * D17 payment gateway integration.
 *
 * In practice, accepting D17 (the BIAT mobile-money app) as a third-party
 * merchant in Tunisia goes through the **Paymee** aggregator, which exposes
 * D17, bank cards, and bank transfers under one REST API. This provider
 * targets that shape:
 *
 *   - POST {BASE}/api/v2/payments/create   → create a payment, get a token + URL
 *   - GET  {BASE}/api/v2/payments/{token}/check → verify status
 *
 * If the project later signs a direct merchant agreement with BIAT for the
 * D17 API, only `baseUrl` and the request bodies change — the interface and
 * how the rest of the codebase calls it stay identical.
 *
 * Required env:
 *   D17_API_TOKEN  - Paymee/D17 merchant API token
 *   D17_BASE_URL   - https://app.paymee.tn (prod) or https://sandbox.paymee.tn
 *                    Defaults to sandbox so a misconfigured prod doesn't bill
 *                    real money.
 *   D17_MERCHANT_EMAIL - account email associated with the merchant (Paymee uses it)
 */
@Injectable()
export class D17Provider implements PaymentProvider {
  readonly key: ProviderKey = 'd17';
  private readonly logger = new Logger(D17Provider.name);

  constructor(private readonly configService: ConfigService) {}

  private get apiToken(): string | undefined {
    return this.configService.get<string>('D17_API_TOKEN');
  }

  private get baseUrl(): string {
    return (
      this.configService.get<string>('D17_BASE_URL') ??
      'https://sandbox.paymee.tn'
    );
  }

  private get merchantEmail(): string {
    return (
      this.configService.get<string>('D17_MERCHANT_EMAIL') ??
      'noreply@renteverything.app'
    );
  }

  isConfigured(): boolean {
    return Boolean(this.apiToken?.trim());
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentOutput> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'D17 is not configured on this server',
      );
    }

    // Paymee expects the amount in TND (decimal), not millimes — opposite of Flouci.
    const response = await fetch(`${this.baseUrl}/api/v2/payments/create`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${this.apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        amount: input.amount,
        note: input.description,
        // Paymee requires *some* customer info even on the create call.
        // We pass placeholders — the renter fills in real info on the hosted page.
        first_name: 'RentEverything',
        last_name: 'Customer',
        email: this.merchantEmail,
        phone: '00000000',
        return_url: input.successUrl,
        cancel_url: input.failUrl,
        webhook_url: input.successUrl, // same handler verifies server-to-server
        order_id: input.reference,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`D17 create payment failed (${response.status}): ${text}`);
      throw new ServiceUnavailableException(
        'Could not contact the payment provider. Please try again.',
      );
    }

    const data = (await response.json()) as {
      status?: boolean;
      data?: { token?: string; payment_url?: string };
      message?: string;
    };

    if (!data?.status || !data.data?.token || !data.data?.payment_url) {
      this.logger.error(
        `D17 returned an unexpected payload: ${JSON.stringify(data)}`,
      );
      throw new ServiceUnavailableException(
        'Payment provider returned an invalid response.',
      );
    }

    return {
      providerRef: data.data.token,
      redirectUrl: data.data.payment_url,
    };
  }

  async verifyPayment(providerRef: string): Promise<ProviderPaymentStatus> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'D17 is not configured on this server',
      );
    }

    const response = await fetch(
      `${this.baseUrl}/api/v2/payments/${encodeURIComponent(providerRef)}/check`,
      {
        method: 'GET',
        headers: {
          Authorization: `Token ${this.apiToken}`,
          Accept: 'application/json',
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`D17 verify_payment failed (${response.status}): ${text}`);
      // Transient errors should not flip a successful payment to failed.
      return 'pending';
    }

    const data = (await response.json()) as {
      status?: boolean;
      data?: { payment_status?: boolean; transaction_id?: string | number };
    };

    if (!data?.status || !data.data) {
      this.logger.warn(`D17 returned no data for ${providerRef}`);
      return 'pending';
    }

    if (data.data.payment_status === true) return 'success';
    // Paymee returns payment_status:false both for "not yet paid" and "failed".
    // We treat the absence of a transaction id as still pending, since the user
    // may still be on the hosted page; a failed payment has the field set.
    if (data.data.transaction_id) return 'failed';
    return 'pending';
  }
}
