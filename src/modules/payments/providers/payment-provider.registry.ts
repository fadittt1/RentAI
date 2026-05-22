import { Injectable, NotFoundException } from '@nestjs/common';
import { FlouciProvider } from './flouci.provider';
import { D17Provider } from './d17.provider';
import { PaymentProvider, ProviderKey } from './payment-provider.interface';

/**
 * Single place that knows which providers exist. Inject the registry and ask
 * for a provider by key — handlers stay agnostic of which gateways exist.
 */
@Injectable()
export class PaymentProviderRegistry {
  private readonly providers: Map<ProviderKey, PaymentProvider>;

  constructor(flouci: FlouciProvider, d17: D17Provider) {
    this.providers = new Map<ProviderKey, PaymentProvider>([
      [flouci.key, flouci],
      [d17.key, d17],
      // ['konnect', konnect],
    ]);
  }

  get(key: ProviderKey): PaymentProvider {
    const p = this.providers.get(key);
    if (!p) throw new NotFoundException(`Unknown payment provider: ${key}`);
    return p;
  }

  /** Providers that are actually usable right now (env vars set). */
  available(): ProviderKey[] {
    return Array.from(this.providers.entries())
      .filter(([, p]) => p.isConfigured())
      .map(([k]) => k);
  }
}
