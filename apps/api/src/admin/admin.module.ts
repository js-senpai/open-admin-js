import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaService } from "../common/prisma.service";
import { AuthGuard } from "../common/auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { CaslAbilityFactory } from "../common/casl-ability.factory";
import { AdminController } from "./admin.controller";
import { AdminAiController } from "./admin-ai.controller";
import { AdminLogsController } from "./admin-logs.controller";
import { AdminPluginsController } from "./admin-plugins.controller";
import { AdminPluginsService } from "./admin-plugins.service";
import { AdminResourceService } from "./admin-resource.service";
import { AdminAnalyticsService } from "./admin-analytics.service";
import { AdminAiService } from "./admin-ai.service";
import { PaymentModule } from "../store/payment/payment.module";
import { LoggingModule } from "../common/logging.module";

@Module({
  imports: [JwtModule.register({}), PaymentModule, LoggingModule],
  controllers: [AdminController, AdminPluginsController, AdminAiController, AdminLogsController],
  providers: [
    AdminResourceService,
    AdminAnalyticsService,
    AdminAiService,
    AdminPluginsService,
    PrismaService,
    AuthGuard,
    PermissionsGuard,
    CaslAbilityFactory
  ],
  exports: [AdminResourceService]
})
export class AdminModule {}
