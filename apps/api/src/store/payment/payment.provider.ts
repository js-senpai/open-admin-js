import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createPaymentProvider,
  type PaymentProvider,
  type ProviderName
} from "@openadminjs/payments";

/**
 * NestJS-injectable wrapper around the provider factory.
 *
 * Configure via env vars:
 *   PAYMENT_PROVIDER=stripe           (default: mock)
 *   STRIPE_SECRET_KEY=sk_live_...
 *   STRIPE_WEBHOOK_SECRET=whsec_...
 */
@Injectable()
export class PaymentProviderService {
  private readonly provider: PaymentProvider;
  private readonly logger = new Logger(PaymentProviderService.name);

  constructor(private readonly config: ConfigService) {
    const providerName = (this.config.get<string>("PAYMENT_PROVIDER") ?? "mock") as ProviderName;
    this.provider = createPaymentProvider(providerName, {
      stripeSecretKey: this.config.get<string>("STRIPE_SECRET_KEY"),
      stripeWebhookSecret: this.config.get<string>("STRIPE_WEBHOOK_SECRET")
    });
    this.logger.log(`Payment provider: ${this.provider.name}`);
  }

  get(): PaymentProvider {
    return this.provider;
  }

  get name(): string {
    return this.provider.name;
  }
}
