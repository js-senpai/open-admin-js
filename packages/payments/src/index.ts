// ──────────────────────────────────────────────────────────────────────────────
// @openadminjs/payments — payment provider abstraction layer
//
// Usage:
//   import { MockPaymentProvider, type PaymentProvider } from "@openadminjs/payments";
//   const provider = process.env.STRIPE_SECRET_KEY
//     ? new StripePaymentProvider(process.env.STRIPE_SECRET_KEY)
//     : new MockPaymentProvider();
// ──────────────────────────────────────────────────────────────────────────────

export type Currency = string; // ISO 4217, e.g. "USD", "EUR"

export type OrderLineItem = {
  name: string;
  description?: string;
  /** Unit price in smallest currency unit (cents for USD) */
  unitAmount: number;
  quantity: number;
  productId?: string;
};

export type CheckoutInput = {
  /** Your internal order ID */
  orderId: string;
  lineItems: OrderLineItem[];
  currency: Currency;
  /** Where to redirect after successful payment */
  successUrl: string;
  /** Where to redirect on cancel */
  cancelUrl: string;
  /** Customer email (optional, pre-fills checkout form) */
  customerEmail?: string;
  metadata?: Record<string, string>;
};

export type CheckoutResult = {
  /** URL to redirect the user to for payment */
  checkoutUrl: string;
  /** Provider-side session / intent ID */
  providerSessionId: string;
};

export type WebhookEventType =
  | "payment.succeeded"
  | "payment.failed"
  | "payment.refunded"
  | "checkout.expired"
  | "unknown";

export type WebhookEvent = {
  type: WebhookEventType;
  orderId: string | null;
  providerEventId: string;
  amount?: number;
  currency?: Currency;
  raw: unknown;
};

export type RefundInput = {
  providerTransactionId: string;
  /** Amount in cents. If omitted → full refund. */
  amount?: number;
  reason?: string;
};

export type RefundResult = {
  providerRefundId: string;
  amount: number;
  status: "succeeded" | "pending" | "failed";
};

// ──────────────────────────────────────────────
// Provider interface
// ──────────────────────────────────────────────

export interface PaymentProvider {
  readonly name: string;

  /** Create a hosted checkout session and return a redirect URL. */
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;

  /**
   * Verify and parse an inbound webhook payload.
   * @param rawBody - raw Buffer/string as received by the HTTP server
   * @param signature - value of the provider-specific signature header
   */
  verifyWebhook(rawBody: Buffer | string, signature: string): Promise<WebhookEvent>;

  /** Issue a full or partial refund. */
  refund(input: RefundInput): Promise<RefundResult>;
}

// ──────────────────────────────────────────────
// Mock provider (dev / testing)
// ──────────────────────────────────────────────

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const sessionId = `mock_sess_${Date.now()}`;
    const params = new URLSearchParams({ session: sessionId, orderId: input.orderId });
    return {
      checkoutUrl: `${input.successUrl}?${params.toString()}`,
      providerSessionId: sessionId
    };
  }

  async verifyWebhook(rawBody: Buffer | string, _signature: string): Promise<WebhookEvent> {
    try {
      const body = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8")) as {
        type?: string;
        orderId?: string;
        id?: string;
        amount?: number;
        currency?: string;
      };
      return {
        type: (body.type as WebhookEventType) ?? "payment.succeeded",
        orderId: body.orderId ?? null,
        providerEventId: body.id ?? `mock_evt_${Date.now()}`,
        amount: body.amount,
        currency: body.currency,
        raw: body
      };
    } catch {
      return {
        type: "unknown",
        orderId: null,
        providerEventId: `mock_evt_${Date.now()}`,
        raw: rawBody
      };
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    return {
      providerRefundId: `mock_re_${Date.now()}`,
      amount: input.amount ?? 0,
      status: "succeeded"
    };
  }
}

// ──────────────────────────────────────────────
// Stripe provider
// ──────────────────────────────────────────────

export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";

  // We import Stripe lazily so the package doesn't crash when stripe is not installed
  private stripeInstance: unknown = null;

  constructor(private readonly secretKey: string, private readonly webhookSecret?: string) {}

  private async getStripe(): Promise<import("stripe").default> {
    if (!this.stripeInstance) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { default: Stripe } = (await import("stripe")) as { default: typeof import("stripe").default };
      this.stripeInstance = new Stripe(this.secretKey, { apiVersion: "2025-02-24.acacia" });
    }
    return this.stripeInstance as import("stripe").default;
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const stripe = await this.getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: input.lineItems.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: item.unitAmount,
          product_data: {
            name: item.name,
            description: item.description
          }
        }
      })),
      customer_email: input.customerEmail,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: { orderId: input.orderId, ...input.metadata }
    });

    return {
      checkoutUrl: session.url ?? input.cancelUrl,
      providerSessionId: session.id
    };
  }

  async verifyWebhook(rawBody: Buffer | string, signature: string): Promise<WebhookEvent> {
    if (!this.webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    const stripe = await this.getStripe();
    const event = stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);

    const typeMap: Record<string, WebhookEventType> = {
      "checkout.session.completed": "payment.succeeded",
      "checkout.session.expired": "checkout.expired",
      "payment_intent.payment_failed": "payment.failed",
      "charge.refunded": "payment.refunded"
    };

    const session = event.data.object as unknown as Record<string, unknown>;
    const orderId = (session.metadata as Record<string, string> | null)?.orderId ?? null;
    const amount = typeof session.amount_total === "number" ? session.amount_total : undefined;
    const currency = typeof session.currency === "string" ? session.currency.toUpperCase() : undefined;

    return {
      type: typeMap[event.type] ?? "unknown",
      orderId,
      providerEventId: event.id,
      amount,
      currency,
      raw: event
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const stripe = await this.getStripe();
    const params: {
      payment_intent: string;
      reason: "duplicate" | "fraudulent" | "requested_by_customer";
      amount?: number;
    } = {
      payment_intent: input.providerTransactionId,
      reason: (input.reason as "duplicate" | "fraudulent" | "requested_by_customer") ?? "requested_by_customer"
    };
    if (input.amount) params.amount = input.amount;
    const refund = await stripe.refunds.create(params as never);
    return {
      providerRefundId: refund.id,
      amount: refund.amount,
      status: refund.status === "succeeded" ? "succeeded" : refund.status === "pending" ? "pending" : "failed"
    };
  }
}

// ──────────────────────────────────────────────
// Factory helper
// ──────────────────────────────────────────────

export type ProviderName = "stripe" | "mock";

export function createPaymentProvider(
  provider: ProviderName = "mock",
  config: { stripeSecretKey?: string; stripeWebhookSecret?: string } = {}
): PaymentProvider {
  if (provider === "stripe") {
    if (!config.stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is required for Stripe provider");
    return new StripePaymentProvider(config.stripeSecretKey, config.stripeWebhookSecret);
  }
  return new MockPaymentProvider();
}
