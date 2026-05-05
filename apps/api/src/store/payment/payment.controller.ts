import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import { AuthGuard } from "../../common/auth.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { PaymentService } from "./payment.service";
import type { CreateOrderInput } from "./payment.service";

type UserContext = { id: string; email?: string; permissions: string[] };
type RequestLike = { user?: UserContext; rawBody?: Buffer };

@Controller("store")
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // ──────────────────────────────────────────────
  // Public endpoints — no JWT required
  // ──────────────────────────────────────────────

  /**
   * GET /store/products
   * List all active products (public storefront).
   */
  @Get("products")
  products() {
    return this.paymentService.listProducts(true);
  }

  /**
   * POST /store/checkout
   * Create an order + payment session.
   * Works for guests (no auth) and authenticated users.
   */
  @Post("checkout")
  checkout(
    @Body() body: CreateOrderInput & { guestEmail?: string },
    @Req() req: RequestLike
  ) {
    return this.paymentService.createCheckout({
      ...body,
      userId: req.user?.id,
      email: body.email ?? body.guestEmail ?? req.user?.email
    });
  }

  /**
   * GET /store/orders/:id/status
   * Public order status check (e.g. success page after redirect).
   */
  @Get("orders/:id/status")
  orderStatus(@Param("id") id: string) {
    return this.paymentService.getOrderStatus(id);
  }

  /**
   * POST /store/webhook/:provider
   * Receive payment events from the provider.
   * Authentication is signature-based (handled in PaymentService).
   */
  @Post("webhook/:provider")
  webhook(
    @Param("provider") provider: string,
    @Headers("stripe-signature") stripeSignature: string | undefined,
    @Headers("x-webhook-signature") genericSignature: string | undefined,
    @Req() req: RawBodyRequest<RequestLike>
  ) {
    const signature = stripeSignature ?? genericSignature ?? "";
    const rawBody = req.rawBody ?? Buffer.from("{}");
    return this.paymentService.handleWebhook(provider, rawBody, signature);
  }

  // ──────────────────────────────────────────────
  // Authenticated user endpoints
  // ──────────────────────────────────────────────

  /**
   * GET /store/orders
   * List orders belonging to the current user.
   */
  @UseGuards(AuthGuard)
  @Get("orders")
  myOrders(
    @CurrentUser() user: UserContext,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.paymentService.getUserOrders(user.id, Number(page ?? 1), Number(limit ?? 20));
  }
}
