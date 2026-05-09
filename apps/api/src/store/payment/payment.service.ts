import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { PaymentProviderService } from "./payment.provider";

export type CreateOrderInput = {
  items: Array<{
    productId?: string;
    name: string;
    price: number;
    quantity: number;
  }>;
  currency?: string;
  email?: string;
  userId?: string;
  notes?: string;
  successUrl: string;
  cancelUrl: string;
};

export type OrderStatusResponse = {
  id: string;
  status: string;
  total: number;
  currency: string;
  items: Array<{ name: string; price: number; quantity: number }>;
  createdAt: Date;
};

@Injectable()
export class PaymentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PaymentProviderService) private readonly paymentProvider: PaymentProviderService
  ) {}

  /** Create a new order and return a checkout URL. */
  async createCheckout(input: CreateOrderInput) {
    const { items, currency = "USD", email, userId, notes, successUrl, cancelUrl } = input;

    if (!items.length) throw new BadRequestException({ message: "Order must contain at least one item", code: "EMPTY_ORDER" });

    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId: userId ?? null,
          email: email ?? null,
          currency,
          total,
          notes: notes ?? null,
          status: "pending"
        }
      });

      await tx.orderItem.createMany({
        data: items.map((item) => ({
          orderId: created.id,
          productId: item.productId ?? null,
          name: item.name,
          price: item.price,
          quantity: item.quantity
        }))
      });

      return created;
    });

    const provider = this.paymentProvider.get();
    const checkout = await provider.createCheckout({
      orderId: order.id,
      lineItems: items.map((item) => ({
        name: item.name,
        unitAmount: item.price,
        quantity: item.quantity
      })),
      currency,
      successUrl,
      cancelUrl,
      customerEmail: email
    });

    // Log the initial transaction attempt
    await this.prisma.transaction.create({
      data: {
        orderId: order.id,
        provider: this.paymentProvider.name,
        providerTxId: checkout.providerSessionId,
        status: "pending",
        amount: total,
        currency,
        metadata: { sessionId: checkout.providerSessionId }
      }
    });

    return { orderId: order.id, checkoutUrl: checkout.checkoutUrl };
  }

  /** Process an inbound webhook event from the payment provider. */
  async handleWebhook(provider: string, rawBody: Buffer, signature: string) {
    const logEntry = await this.prisma.webhookLog.create({
      data: { provider, eventType: "unknown", payload: {}, status: "pending" }
    });

    try {
      const event = await this.paymentProvider.get().verifyWebhook(rawBody, signature);

      await this.prisma.webhookLog.update({
        where: { id: logEntry.id },
        data: { eventType: event.type, payload: event.raw as object, status: "processed" }
      });

      if (event.orderId) {
        await this.applyWebhookEvent(event.orderId, event.type, event.providerEventId, event.amount, event.currency);
      }

      return { received: true, type: event.type };
    } catch (error) {
      await this.prisma.webhookLog.update({
        where: { id: logEntry.id },
        data: { status: "failed", error: error instanceof Error ? error.message : "unknown" }
      });
      throw error;
    }
  }

  private async applyWebhookEvent(
    orderId: string,
    type: string,
    providerEventId: string,
    amount?: number,
    currency?: string
  ) {
    const statusMap: Record<string, string> = {
      "payment.succeeded": "paid",
      "payment.failed": "failed",
      "payment.refunded": "refunded",
      "checkout.expired": "cancelled"
    };

    const newStatus = statusMap[type];
    if (!newStatus) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: newStatus } });
      await tx.transaction.updateMany({
        where: { orderId, providerTxId: providerEventId },
        data: {
          status: newStatus === "paid" ? "succeeded" : newStatus === "refunded" ? "refunded" : "failed",
          ...(amount ? { amount } : {}),
          ...(currency ? { currency } : {})
        }
      });
    });
  }

  /** Get order status (public — by orderId only, no auth needed). */
  async getOrderStatus(orderId: string): Promise<OrderStatusResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });
    if (!order) throw new NotFoundException({ message: "Order not found", code: "ORDER_NOT_FOUND" });

    return {
      id: order.id,
      status: order.status,
      total: order.total,
      currency: order.currency,
      items: order.items.map((item) => ({ name: item.name, price: item.price, quantity: item.quantity })),
      createdAt: order.createdAt
    };
  }

  /** List orders for the authenticated user. */
  async getUserOrders(userId: string, page = 1, limit = 20) {
    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.order.count({ where: { userId } })
    ]);
    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) || 1 } };
  }

  /** Refund an order (admin only). */
  async refundOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { transactions: true }
    });
    if (!order) throw new NotFoundException({ message: "Order not found", code: "ORDER_NOT_FOUND" });
    if (order.status !== "paid") {
      throw new BadRequestException({ message: `Cannot refund order with status "${order.status}"`, code: "INVALID_ORDER_STATUS" });
    }

    const successTx = order.transactions.find((tx) => tx.status === "succeeded");
    if (!successTx?.providerTxId) {
      throw new BadRequestException({ message: "No successful transaction found for this order", code: "NO_TRANSACTION" });
    }

    const refund = await this.paymentProvider.get().refund({
      providerTransactionId: successTx.providerTxId,
      amount: order.total
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: "refunded" } });
      await tx.transaction.create({
        data: {
          orderId,
          provider: this.paymentProvider.name,
          providerTxId: refund.providerRefundId,
          status: "refunded",
          amount: refund.amount,
          currency: order.currency
        }
      });
    });

    return { ok: true, refundId: refund.providerRefundId };
  }

  /** List products. */
  async listProducts(onlyActive = true) {
    return this.prisma.product.findMany({
      where: onlyActive ? { active: true } : undefined,
      orderBy: { createdAt: "desc" }
    });
  }
}
