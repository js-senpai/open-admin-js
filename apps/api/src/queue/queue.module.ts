import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaService } from "../common/prisma.service";
import { AuthGuard } from "../common/auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { CaslAbilityFactory } from "../common/casl-ability.factory";
import { QueueController } from "./queue.controller";
import { QueueService } from "./queue.service";
import { QueueProcessor } from "./queue.processor";

@Module({
  imports: [JwtModule.register({})],
  controllers: [QueueController],
  providers: [QueueService, QueueProcessor, PrismaService, AuthGuard, PermissionsGuard, CaslAbilityFactory]
})
export class QueueModule {}
