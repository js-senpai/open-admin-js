import { Body, Controller, Delete, Get, Inject, Optional, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { RequireAuthRealm } from "../common/auth-realm.decorator";
import { CurrentUser } from "../common/current-user.decorator";
import { AdminResourceService } from "./admin-resource.service";
import { AdminAnalyticsService } from "./admin-analytics.service";
import { ResourceBulkDto } from "./dto/resource-bulk.dto";
import { ResourceReorderDto } from "./dto/resource-reorder.dto";
import { ResourceUploadDto } from "./dto/resource-upload.dto";
import { PaymentService } from "../store/payment/payment.service";

type UserContext = { id: string; email?: string; permissions: string[] };

@UseGuards(AuthGuard)
@RequireAuthRealm("admin")
@Controller("admin/resources")
export class AdminController {
  constructor(
    @Inject(AdminResourceService) private readonly resources: AdminResourceService,
    @Inject(AdminAnalyticsService) private readonly analytics: AdminAnalyticsService,
    @Optional() @Inject(PaymentService) private readonly payments?: PaymentService
  ) {}

  @Get("/overview")
  overview(@Query("period") period: "7d" | "30d" | "90d" | undefined, @CurrentUser() user: UserContext) {
    return this.analytics.overview(user, period ?? "30d");
  }

  @Get()
  all(@Query("locale") locale: string | undefined, @CurrentUser() user: UserContext) {
    return this.resources.listResources(user, locale);
  }

  @Get("search")
  search(
    @Query("q") q: string | undefined,
    @Query("limit") limit: string | undefined,
    @CurrentUser() user: UserContext
  ) {
    return this.resources.globalSearch(q ?? "", user, { perResourceLimit: Number(limit ?? 5) });
  }

  @Get(":resource")
  list(@Param("resource") resource: string, @Query() query: Record<string, unknown>, @CurrentUser() user: UserContext) {
    return this.resources.list(resource, query, user);
  }

  @Post(":resource/bulk")
  bulk(
    @Param("resource") resource: string,
    @Body() body: ResourceBulkDto,
    @CurrentUser() user: UserContext
  ) {
    return this.resources.bulk(resource, body, user);
  }

  @Post(":resource/reorder")
  reorder(
    @Param("resource") resource: string,
    @Body() body: ResourceReorderDto,
    @CurrentUser() user: UserContext
  ) {
    return this.resources.reorder(resource, body.ids, user, body.baseIndex ?? 0);
  }

  @Post("files/upload")
  uploadFile(@Body() body: ResourceUploadDto, @CurrentUser() user: UserContext) {
    return this.resources.uploadFile(body, user);
  }

  @Get(":resource/:id")
  get(@Param("resource") resource: string, @Param("id") id: string, @CurrentUser() user: UserContext) {
    return this.resources.get(resource, id, user);
  }

  @Post(":resource")
  create(@Param("resource") resource: string, @Body() body: Record<string, unknown>, @CurrentUser() user: UserContext) {
    return this.resources.create(resource, body, user);
  }

  @Patch(":resource/:id")
  update(@Param("resource") resource: string, @Param("id") id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: UserContext) {
    return this.resources.update(resource, id, body, user);
  }

  @Delete(":resource/:id")
  delete(@Param("resource") resource: string, @Param("id") id: string, @CurrentUser() user: UserContext) {
    return this.resources.delete(resource, id, user);
  }

  @Post("orders/:id/refund")
  refundOrder(@Param("id") id: string) {
    if (!this.payments) throw new Error("PaymentService not available");
    return this.payments.refundOrder(id);
  }

  @Post(":resource/:id/actions/:action")
  action(
    @Param("resource") resource: string,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: Record<string, unknown> = {},
    @CurrentUser() user: UserContext
  ) {
    return this.resources.action(resource, id, action, user, body);
  }
}
